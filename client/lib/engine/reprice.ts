import "server-only"

import { ethers } from "ethers"
import { sandboxRouterAbi } from "@/lib/web3/abis"
import { getZGConfig } from "@/lib/0g/config"
import { connectMongo } from "@/lib/db/mongoose"
import { LeagueModel } from "@/lib/db/models/League"
import { listTokens, updateTokenPrice } from "@/lib/db/repositories/tokens"
import { rerankLeagueAndSnapshot } from "@/lib/engine/tick"
import { fetchTokenPrices } from "@/lib/engine/prices"
import { usdToScaled } from "@/lib/engine/prices"
import { withWalletWriteLock } from "@/lib/web3/write-lock"

const STABLE_DRIFT_RANGE = 0.03 // ±3%
const STABLE_REVERSAL_PROB = 0.25
const VOLATILE_DRIFT_RANGE = 0.3 // ±30%
const VOLATILE_REVERSAL_PROB = 0.5
const VOLATILE_SHOCK_PROB = 0.3
const VOLATILE_SHOCK_FACTOR = [1.5, 3.0] as const // shock multiplier range

export interface RepriceTickSummary {
  tokens_updated: number
  prices: Array<{ symbol: string; from: number; to: number; class: string }>
  duration_ms: number
  leagues_resnapshotted: number
}

function getOwnerSigner() {
  const config = getZGConfig()
  const key = config.privateKey
  if (!key) throw new Error("PRIVATE_KEY required to call setUsdPrice on the sandbox router")
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId)
  return new ethers.Wallet(key, provider)
}

function uniform(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function nextStablePrice(
  current: number,
  base: number,
  lastDirection: 1 | -1,
): { price: number; direction: 1 | -1 } {
  const reverse = Math.random() < STABLE_REVERSAL_PROB
  const dir: 1 | -1 = reverse ? (lastDirection === 1 ? -1 : 1) : lastDirection
  const magnitude = uniform(0, STABLE_DRIFT_RANGE)
  const next = current * (1 + dir * magnitude)
  return { price: clamp(next, base), direction: dir }
}

function nextVolatilePrice(
  current: number,
  base: number,
  lastDirection: 1 | -1,
): { price: number; direction: 1 | -1 } {
  const reverse = Math.random() < VOLATILE_REVERSAL_PROB
  const dir: 1 | -1 = reverse ? (lastDirection === 1 ? -1 : 1) : lastDirection
  let magnitude = uniform(0, VOLATILE_DRIFT_RANGE)
  if (Math.random() < VOLATILE_SHOCK_PROB) {
    magnitude *= uniform(VOLATILE_SHOCK_FACTOR[0], VOLATILE_SHOCK_FACTOR[1])
  }
  const next = current * (1 + dir * magnitude)
  return { price: clamp(next, base), direction: dir }
}

function clamp(price: number, base: number): number {
  const floor = base / 1000
  const ceil = base * 1000
  if (price < floor) return floor
  if (price > ceil) return ceil
  return price
}

function errorText(error: unknown): string {
  if (!error) return ""
  const anyErr = error as { code?: unknown; message?: unknown; info?: unknown; error?: unknown }
  const candidates = [
    anyErr.code,
    anyErr.message,
    (anyErr.info as any)?.error?.message,
    (anyErr.error as any)?.message,
    error,
  ]
  return candidates
    .map((v) => {
      if (typeof v === "string") return v
      if (v instanceof Error) return v.message
      try {
        return JSON.stringify(v)
      } catch {
        return String(v)
      }
    })
    .filter(Boolean)
    .join(" | ")
}

function isNonceRace(error: unknown) {
  return /NONCE_EXPIRED|nonce too low|nonce has already been used|REPLACEMENT_UNDERPRICED|replacement transaction underpriced|replacement fee too low/i.test(
    errorText(error),
  )
}

async function setRouterPrice(
  wallet: ethers.Wallet,
  router: ethers.Contract,
  symbolBytes: string,
  priceUsdScaled: bigint,
) {
  return withWalletWriteLock(async () => {
    const nonce = await wallet.provider!.getTransactionCount(wallet.address, "pending")
    const tx = await router.setUsdPrice(symbolBytes, priceUsdScaled, { nonce })
    return tx.wait()
  })
}

export async function runRepriceTick(): Promise<RepriceTickSummary> {
  const startedAt = Date.now()
  await connectMongo()

  const tokens = await listTokens()
  if (tokens.length === 0) {
    return { tokens_updated: 0, prices: [], duration_ms: Date.now() - startedAt, leagues_resnapshotted: 0 }
  }

  const wallet = getOwnerSigner()
  const routerAddress = process.env.SANDBOX_ROUTER_ADDRESS
  if (!routerAddress || !ethers.isAddress(routerAddress)) {
    throw new Error("SANDBOX_ROUTER_ADDRESS env required for reprice tick")
  }
  const router = new ethers.Contract(routerAddress, sandboxRouterAbi as unknown as ethers.InterfaceAbi, wallet)

  const updates: RepriceTickSummary["prices"] = []
  for (const t of tokens) {
    if (t.asset_class === "peg") continue

    const last = (t.last_direction as 1 | -1) ?? 1
    const next =
      t.asset_class === "stable"
        ? nextStablePrice(t.current_price_usd, t.base_price_usd, last)
        : nextVolatilePrice(t.current_price_usd, t.base_price_usd, last)

    const symbolBytes = ethers.encodeBytes32String(t.symbol)
    const priceUsdScaled = usdToScaled(next.price)
    if (priceUsdScaled === 0n) continue

    try {
      try {
        await setRouterPrice(wallet, router, symbolBytes, priceUsdScaled)
      } catch (error) {
        if (!isNonceRace(error)) throw error
        await new Promise((resolve) => setTimeout(resolve, 750))
        await setRouterPrice(wallet, router, symbolBytes, priceUsdScaled)
      }
      await updateTokenPrice(t.symbol, next.price, next.direction)
      updates.push({ symbol: t.symbol, from: t.current_price_usd, to: next.price, class: t.asset_class })
    } catch (error) {
      console.error("[reprice]", t.symbol, (error as Error).message)
    }
  }

  // Snapshot every active league so the chart picks up between engine ticks.
  const activeLeagues = await LeagueModel.find({ status: "active" }).lean().exec()
  for (const league of activeLeagues) {
    const prices = await fetchTokenPrices(league.asset_universe ?? [])
    await rerankLeagueAndSnapshot(league.chain_id_hex, prices, "reprice_tick")
  }

  return {
    tokens_updated: updates.length,
    prices: updates,
    duration_ms: Date.now() - startedAt,
    leagues_resnapshotted: activeLeagues.length,
  }
}
