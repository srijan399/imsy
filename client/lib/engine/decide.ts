import "server-only"

import { z } from "zod"
import { runVerifiedInference, type ZGComputeResult } from "@/lib/0g/compute"
import { TRADER_SYSTEM_PROMPT } from "@/lib/0g/prompts"
import { usdToScaled, type AssetPrice } from "@/lib/engine/prices"
import { parseUntilJson } from "@/lib/utils/parse-json"
import type { AgentStrategy } from "@/lib/agents/strategy"

const SCALE = 10n ** 18n
const BUY_QUOTE_SAFETY = 0.995

export interface AgentSnapshot {
  agentId: number
  name: string
  strategy: AgentStrategy
  league: {
    name: string
    asset_universe: string[]
    max_drawdown_pct: number
    max_leverage: number
    allowed_signals: string[]
  }
  portfolio: {
    cashUsd: bigint
    totalValueUsd: bigint
    initialUsd: bigint
    roiPct: number
    currentDrawdownPct: number
    positions: Array<{ asset: string; qty: bigint; avgPriceUsd: bigint; lastPriceUsd: number }>
  }
  prices: Record<string, AssetPrice>
  recentTrades: Array<{ asset: string; action: string; qty: number; priceUsd: string; success: boolean; simulated: boolean; ts: string }>
  dramaDirective?: {
    mode: "maximum_drama"
    targetAsset: string
    command: "buy"
    minNotionalUsd: number
    headline: string
    instruction: string
  }
}

const decisionSchema = z.object({
  action: z.enum(["buy", "sell", "hold"]),
  asset: z.string().min(1),
  quantity: z.number().nonnegative(),
  limit_price_usd: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400),
})

export type TraderDecision = z.infer<typeof decisionSchema>

export interface DecideResult {
  decision: TraderDecision
  raw: string
  compute: ZGComputeResult
}

function holdDecision(reason: string): TraderDecision {
  return { action: "hold", asset: "0G", quantity: 0, limit_price_usd: 0, confidence: 0, reasoning: reason.slice(0, 200) }
}

function numberToScaledUnits(value: number): bigint | null {
  if (!Number.isFinite(value) || value < 0) return null
  const normalized = value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 18,
  })
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const [whole, fraction = ""] = normalized.split(".")
  const paddedFraction = `${fraction}${"0".repeat(18)}`.slice(0, 18)
  return BigInt(whole) * SCALE + BigInt(paddedFraction)
}

function scaledToDisplay(value: bigint) {
  const whole = value / SCALE
  const fractional = value % SCALE
  if (fractional === 0n) return whole.toString()
  const fraction = fractional.toString().padStart(18, "0").replace(/0+$/, "")
  return `${whole}.${fraction.slice(0, 6)}`
}

function scaledUsdToNumber(value: bigint) {
  return Number(value / 10n ** 12n) / 1_000_000
}

function applyDramaDirective(decision: TraderDecision, snapshot: AgentSnapshot): TraderDecision {
  const directive = snapshot.dramaDirective
  if (!directive) return decision

  const price = snapshot.prices[directive.targetAsset]?.usd ?? 0
  const cashUsd = scaledUsdToNumber(snapshot.portfolio.cashUsd)
  if (price <= 0 || cashUsd <= 0) {
    return holdDecision(`drama buy ${directive.targetAsset} blocked: no price or cash`)
  }

  const notionalUsd = Math.min(directive.minNotionalUsd, cashUsd)
  const quantity = (notionalUsd / price) * BUY_QUOTE_SAFETY
  return {
    action: "buy",
    asset: directive.targetAsset,
    quantity,
    limit_price_usd: price,
    confidence: Math.max(decision.confidence, 0.95),
    reasoning: `${directive.headline}: sandbox drama desk says buy; no real guarantee, just maximum theater.`,
  }
}

function validateDecisionAgainstPortfolio(decision: TraderDecision, snapshot: AgentSnapshot): TraderDecision {
  if (decision.action === "hold") {
    return { ...decision, quantity: 0, limit_price_usd: 0 }
  }

  if (snapshot.league.max_drawdown_pct > 0 && snapshot.portfolio.currentDrawdownPct >= snapshot.league.max_drawdown_pct) {
    return holdDecision(`drawdown ${snapshot.portfolio.currentDrawdownPct}% exceeds league cap`)
  }

  if (!snapshot.league.asset_universe.includes(decision.asset)) {
    return holdDecision(`asset ${decision.asset} not in league universe`)
  }

  if (
    !snapshot.dramaDirective &&
    snapshot.strategy.asset_universe.length > 0 &&
    !snapshot.strategy.asset_universe.includes(decision.asset)
  ) {
    return holdDecision(`asset ${decision.asset} not in strategy universe`)
  }

  if (decision.quantity <= 0 || decision.limit_price_usd <= 0) {
    return holdDecision(`${decision.action} ${decision.asset} blocked: quantity and price must be positive`)
  }

  const currentPriceUsd = snapshot.prices[decision.asset]?.usd ?? 0
  if (decision.action === "buy") {
    if (currentPriceUsd <= 0) return holdDecision(`buy ${decision.asset} blocked: no current price`)
    decision = { ...decision, limit_price_usd: currentPriceUsd }
  }

  const qty = numberToScaledUnits(decision.quantity)
  const priceUsd = usdToScaled(decision.limit_price_usd)
  if (!qty || qty <= 0n || priceUsd <= 0n) {
    return holdDecision(`${decision.action} ${decision.asset} blocked: invalid quantity or price`)
  }

  const position = snapshot.portfolio.positions.find((p) => p.asset === decision.asset)

  if (decision.action === "sell") {
    if (!position || position.qty <= 0n) {
      return holdDecision(`sell ${decision.asset} blocked: no current position`)
    }
    if (qty > position.qty) {
      return holdDecision(`sell ${decision.asset} blocked: qty ${decision.quantity} exceeds held ${scaledToDisplay(position.qty)}`)
    }
    return decision
  }

  const notionalUsd = (qty * priceUsd) / SCALE
  if (notionalUsd > snapshot.portfolio.cashUsd) {
    return holdDecision(`buy ${decision.asset} blocked: notional exceeds cash`)
  }

  const maxPositionPct = snapshot.strategy.risk_profile.max_position_size_pct
  const maxPositionBps = BigInt(Math.max(0, Math.floor(maxPositionPct * 100)))
  if (!snapshot.dramaDirective && maxPositionBps > 0n && snapshot.portfolio.totalValueUsd > 0n) {
    const currentPositionUsd = position ? (position.qty * priceUsd) / SCALE : 0n
    const maxPositionUsd = (snapshot.portfolio.totalValueUsd * maxPositionBps) / 10_000n
    if (currentPositionUsd + notionalUsd > maxPositionUsd) {
      return holdDecision(`buy ${decision.asset} blocked: max position size exceeded`)
    }
  }

  return decision
}

function serializePortfolio(snapshot: AgentSnapshot) {
  return {
    cashUsd: snapshot.portfolio.cashUsd.toString(),
    totalValueUsd: snapshot.portfolio.totalValueUsd.toString(),
    initialUsd: snapshot.portfolio.initialUsd.toString(),
    roiPct: snapshot.portfolio.roiPct,
    currentDrawdownPct: snapshot.portfolio.currentDrawdownPct,
    positions: snapshot.portfolio.positions.map((p) => ({
      asset: p.asset,
      qty: p.qty.toString(),
      avgPriceUsd: p.avgPriceUsd.toString(),
      lastPriceUsd: p.lastPriceUsd,
    })),
  }
}

export async function decide(snapshot: AgentSnapshot): Promise<DecideResult> {
  const userPayload = {
    strategy: snapshot.strategy,
    league: snapshot.league,
    portfolio: serializePortfolio(snapshot),
    prices: snapshot.prices,
    recent_trades: snapshot.recentTrades,
    drama_directive: snapshot.dramaDirective ?? null,
    now_iso: new Date().toISOString(),
  }

  const compute = await runVerifiedInference({
    messages: [
      { role: "system", content: TRADER_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    temperature: 0.2,
    maxTokens: 512,
  })

  const raw = compute.content?.trim() ?? ""

  if (compute.status === "not_configured" || compute.status === "failed" || !raw) {
    return { decision: holdDecision(`compute ${compute.status}`), raw, compute }
  }

  const parsed = parseUntilJson(raw)
  if (!parsed || Object.keys(parsed).length === 0) {
    return { decision: holdDecision("no JSON in compute output"), raw, compute }
  }

  const result = decisionSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return { decision: holdDecision(`schema invalid: ${issues}`), raw, compute }
  }

  let decision = result.data

  decision = applyDramaDirective(decision, snapshot)
  decision = validateDecisionAgainstPortfolio(decision, snapshot)

  return { decision, raw, compute }
}
