import "server-only"

import { ethers } from "ethers"
import { connectMongo } from "@/lib/db/mongoose"
import { LeagueModel } from "@/lib/db/models/League"
import { AgentModel } from "@/lib/db/models/Agent"
import { TradeLogModel } from "@/lib/db/models/TradeLog"
import { listRecentTradesByAgent } from "@/lib/db/repositories/trades"
import { listLeagues } from "@/lib/db/repositories/leagues"
import { recordSnapshot } from "@/lib/db/repositories/values"
import { AgentValueSnapshotModel } from "@/lib/db/models/AgentValueSnapshot"
import { uploadStateRoot } from "@/lib/0g/storage"
import {
  readAgentAssetsOnChain,
  readAgentOnChain,
  readAgentPositionOnChain,
} from "@/lib/web3/server"
import { decide, type AgentSnapshot } from "./decide"
import { executeAgentTrade } from "./execute"
import { fetchTokenPrices, usdToScaled } from "./prices"
import { normalizeAgentStrategy } from "@/lib/agents/strategy"

interface AgentTickResult {
  agentId: number
  decision: { action: string; asset: string; quantity: number }
  txHash: string | null
  success: boolean
  simulated: boolean
  error?: string
}

interface LeagueTickResult {
  leagueId: string
  agents: number
  results: AgentTickResult[]
  stateRoot: string
}

export interface EngineTickSummary {
  leagues: LeagueTickResult[]
  totals: {
    agents_processed: number
    trades_executed: number
    trades_failed: number
  }
}

type DramaDirective = NonNullable<AgentSnapshot["dramaDirective"]>

async function computeAgentMetrics(agentId: number, leagueChainIdHex: string, currentRoiPct: number) {
  const snapshots = await AgentValueSnapshotModel
    .find({ agent_id: agentId, league_chain_id_hex: leagueChainIdHex })
    .sort({ timestamp: 1 })
    .select({ pnl_pct: 1 })
    .lean()
    .exec()

  const pnls = [...snapshots.map((s) => s.pnl_pct), currentRoiPct]
  if (pnls.length < 2) return { sharpe: 0, maxDrawdownPct: 0, winRate: 0 }

  let peak = pnls[0]
  let maxDD = 0
  for (const pnl of pnls) {
    if (pnl > peak) peak = pnl
    const dd = peak - pnl
    if (dd > maxDD) maxDD = dd
  }

  let ups = 0
  for (let i = 1; i < pnls.length; i++) {
    if (pnls[i] > pnls[i - 1]) ups++
  }
  const winRate = (ups / (pnls.length - 1)) * 100

  const returns = pnls.slice(1).map((p, i) => p - pnls[i])
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
  const std = Math.sqrt(variance)
  const sharpe = std === 0 ? 0 : mean / std

  return { sharpe, maxDrawdownPct: maxDD, winRate }
}

function percentChangeScaled(current: bigint, initial: bigint) {
  if (initial === 0n) return 0
  return Number(((current - initial) * 1_000_000n) / initial) / 10_000
}

function shuffle<T>(items: T[]) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function buildDramaDirectives(agents: Array<{ agent_id: number }>, assetUniverse: string[]) {
  const assets = assetUniverse.filter(Boolean)
  if (agents.length === 0 || assets.length === 0) return new Map<number, DramaDirective>()

  const selected = shuffle(agents).slice(0, Math.min(3, agents.length))
  const directives = new Map<number, DramaDirective>()
  for (const agent of selected) {
    const targetAsset = assets[Math.floor(Math.random() * assets.length)]
    const minNotionalUsd = Math.random() < 0.5 ? 100_000 : 200_000
    directives.set(agent.agent_id, {
      mode: "maximum_drama",
      targetAsset,
      command: "buy",
      minNotionalUsd,
      headline: `${targetAsset} chaos bid`,
      instruction:
        `Maximum drama sandbox directive: buy ${targetAsset}. Use theatrical hype, but label it as sandbox narrative. ` +
        `Aim for at least $${minNotionalUsd.toLocaleString()} notional if cash permits; otherwise use the largest affordable buy.`,
    })
  }
  return directives
}

export async function runEngineTick(): Promise<EngineTickSummary> {
  await connectMongo()
  const allLeagues = await listLeagues()
  const activeLeagues = allLeagues.filter((l) => l.status === "active")
  const leagues: LeagueTickResult[] = []

  for (const league of activeLeagues) {
    const agents = await AgentModel.find({ leagues: league.chain_id_hex, status: { $in: ["registered", "active"] } })
      .lean()
      .exec()
    if (agents.length === 0) continue

    const prices = await fetchTokenPrices(league.asset_universe ?? [])
    const dramaDirectives = buildDramaDirectives(agents, Object.keys(prices))
    const results: AgentTickResult[] = []

    for (const agent of agents) {
      try {
        const onChain = await readAgentOnChain(agent.agent_id)
        if (!onChain) throw new Error(`Agent ${agent.agent_id} missing on chain`)
        const assets = await readAgentAssetsOnChain(agent.agent_id)
        const positions = await Promise.all(
          assets.map(async (asset) => {
            const pos = await readAgentPositionOnChain(agent.agent_id, asset)
            return {
              asset,
              qty: pos.qty,
              avgPriceUsd: pos.avgPriceUsd,
              lastPriceUsd: prices[asset]?.usd ?? 0,
            }
          }),
        )

        const positionValueUsd = positions.reduce((acc, p) => {
          const usd = p.lastPriceUsd
          if (usd <= 0 || p.qty === 0n) return acc
          // qty is 1e18-scaled token units; usdToScaled(usd) is sUSD per token (1e18-scaled).
          // value = qty * priceScaled / 1e18 (so the result is also 1e18-scaled USD).
          return acc + (p.qty * usdToScaled(usd)) / 10n ** 18n
        }, 0n)
        const totalValueUsd = onChain.cashUsd + positionValueUsd
        const initialUsd = BigInt(agent.deposit_usd || "0")
        const roiPct = percentChangeScaled(totalValueUsd, initialUsd)
        const currentDrawdownPct = totalValueUsd < initialUsd ? Math.abs(roiPct) : 0

        const recentTradesDocs = await listRecentTradesByAgent(agent.agent_id, 5)
        const recentTrades = recentTradesDocs.map((trade) => ({
          asset: trade.asset,
          action: trade.action,
          qty: trade.quantity,
          priceUsd: trade.price_usd,
          success: trade.success,
          simulated: trade.simulated,
          ts: new Date(trade.timestamp).toISOString(),
        }))

        const strategy = normalizeAgentStrategy(agent.strategy)
        const snapshot: AgentSnapshot = {
          agentId: agent.agent_id,
          name: agent.name,
          strategy,
          league: {
            name: league.name,
            asset_universe: league.asset_universe ?? [],
            max_drawdown_pct: league.max_drawdown_pct,
            max_leverage: league.max_leverage,
            allowed_signals: league.allowed_signals ?? [],
          },
          portfolio: {
            cashUsd: onChain.cashUsd,
            totalValueUsd,
            initialUsd,
            roiPct,
            currentDrawdownPct,
            positions,
          },
          prices,
          recentTrades,
          dramaDirective: dramaDirectives.get(agent.agent_id),
        }

        const { decision, compute } = await decide(snapshot)
        const exec = await executeAgentTrade({
          agentId: agent.agent_id,
          decision,
          computeMeta: {
            model: compute.model,
            endpoint: compute.endpoint,
            responseId: compute.responseId,
            teeVerified: compute.teeVerified,
            status: compute.status,
          },
        })

        await new TradeLogModel({
          agent_id: agent.agent_id,
          league_chain_id_hex: league.chain_id_hex,
          season_chain_id_hex: agent.season_chain_id_hex ?? league.season_chain_id_hex,
          timestamp: new Date(),
          action: decision.action,
          asset: decision.asset,
          quantity: decision.quantity,
          price_usd: exec.priceUsd.toString(),
          success: exec.success,
          simulated: exec.simulated,
          dex_router: null,
          reason: decision.reasoning,
          confidence: decision.confidence,
          portfolio_value_usd_after: totalValueUsd.toString(),
          tx_hash: exec.txHash,
          reason_hash: exec.reasonHash,
          zg_storage_ref: exec.zgRef.rootHash,
          zg_storage_status: exec.zgRef.status as "uploaded" | "local_hash_only",
          zg_storage_tx_hash: exec.zgRef.txHash,
          zg_storage_error: exec.zgRef.error,
          compute_ref: {
            model: compute.model,
            endpoint: compute.endpoint,
            response_id: compute.responseId,
            tee_verified: compute.teeVerified,
            status: compute.status,
          },
        }).save()

        results.push({
          agentId: agent.agent_id,
          decision: { action: decision.action, asset: decision.asset, quantity: decision.quantity },
          txHash: exec.txHash,
          success: exec.success,
          simulated: exec.simulated,
        })
      } catch (error) {
        const message = (error as Error).message
        results.push({
          agentId: agent.agent_id,
          decision: { action: "hold", asset: "", quantity: 0 },
          txHash: null,
          success: false,
          simulated: true,
          error: message,
        })
      }
    }

    await rerankLeagueAndSnapshot(league.chain_id_hex, prices, "engine_tick")

    const stateRootSeed = JSON.stringify(
      results.map((r) => ({ id: r.agentId, action: r.decision.action, txHash: r.txHash })),
    )
    const stateRoot = ethers.id(stateRootSeed)
    await uploadStateRoot(stateRoot, { leagueId: league.chain_id_hex, seasonId: league.season_chain_id_hex })

    leagues.push({ leagueId: league.chain_id_hex, agents: agents.length, results, stateRoot })
  }

  let processed = 0
  let executed = 0
  let failed = 0
  for (const lg of leagues) {
    for (const r of lg.results) {
      processed += 1
      if (r.success && r.txHash) executed += 1
      else failed += 1
    }
  }

  return {
    leagues,
    totals: {
      agents_processed: processed,
      trades_executed: executed,
      trades_failed: failed,
    },
  }
}

/**
 * Recompute league rank using on-chain cash + position valuations (USD), then
 * persist a snapshot per agent so the live PnL chart has fresh data.
 */
export async function rerankLeagueAndSnapshot(
  leagueChainIdHex: string,
  prices: Record<string, { usd: number }>,
  snapshotKind: "engine_tick" | "reprice_tick",
) {
  const agents = await AgentModel.find({ leagues: leagueChainIdHex }).lean().exec()
  const valuations: Array<{
    agent_id: number
    valueUsd: bigint
    cashUsd: bigint
    positionUsd: bigint
    initialUsd: bigint
  }> = []

  for (const agent of agents) {
    const onChain = await readAgentOnChain(agent.agent_id)
    if (!onChain) continue
    const assets = await readAgentAssetsOnChain(agent.agent_id)
    let positionUsd = 0n
    for (const asset of assets) {
      const usd = prices[asset]?.usd ?? 0
      if (usd <= 0) continue
      const pos = await readAgentPositionOnChain(agent.agent_id, asset)
      if (pos.qty === 0n) continue
      positionUsd += (pos.qty * usdToScaled(usd)) / 10n ** 18n
    }
    const valueUsd = onChain.cashUsd + positionUsd
    const depositString = (agent as { deposit_usd?: string }).deposit_usd ?? "0"
    valuations.push({
      agent_id: agent.agent_id,
      valueUsd,
      cashUsd: onChain.cashUsd,
      positionUsd,
      initialUsd: BigInt(depositString || "0"),
    })
  }

  valuations.sort((a, b) => (a.valueUsd < b.valueUsd ? 1 : a.valueUsd > b.valueUsd ? -1 : 0))

  const tradeCounts = await TradeLogModel.aggregate([
    { $match: { agent_id: { $in: valuations.map((v) => v.agent_id) }, action: { $in: ["buy", "sell"] }, success: true } },
    { $group: { _id: "$agent_id", count: { $sum: 1 } } },
  ]).exec()
  const tradeCountMap = new Map<number, number>(tradeCounts.map((row) => [row._id as number, row.count as number]))

  for (let i = 0; i < valuations.length; i++) {
    const entry = valuations[i]
    const roiPct = percentChangeScaled(entry.valueUsd, entry.initialUsd)
    const metrics = await computeAgentMetrics(entry.agent_id, leagueChainIdHex, roiPct)
    await AgentModel.updateOne(
      { agent_id: entry.agent_id },
      {
        current_rank: i + 1,
        "performance.roi_pct": roiPct,
        "performance.trade_count": tradeCountMap.get(entry.agent_id) ?? 0,
        "performance.sharpe_ratio": metrics.sharpe,
        "performance.max_drawdown_pct": metrics.maxDrawdownPct,
        "performance.win_rate": metrics.winRate,
        $push: { rank_history: { timestamp: new Date(), rank: i + 1, roi_pct: roiPct } },
      },
    )

    await recordSnapshot({
      agent_id: entry.agent_id,
      league_chain_id_hex: leagueChainIdHex,
      cash_usd: entry.cashUsd,
      position_value_usd: entry.positionUsd,
      total_value_usd: entry.valueUsd,
      pnl_pct: roiPct,
      snapshot_kind: snapshotKind,
    })
  }
}
