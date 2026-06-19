import "server-only"

import { getPriceContextMap, type AssetClass } from "@/lib/db/repositories/tokens"

export interface AssetPrice {
  symbol: string
  usd: number
  base_price_usd: number
  previous_price_usd: number
  change_pct: number
  change_from_base_pct: number
  last_direction: 1 | -1
  asset_class: AssetClass
  source: "sandbox-router"
  as_of: string
}

function pctChange(from: number, to: number) {
  if (!Number.isFinite(from) || from <= 0) return 0
  return ((to - from) / from) * 100
}

/**
 * Read current sandbox prices from the Mongo TokenRegistry. The reprice cron
 * keeps these in sync with the on-chain `IMSYSandboxRouter.usdPriceOf` mapping.
 */
export async function fetchTokenPrices(symbols: string[]): Promise<Record<string, AssetPrice>> {
  const map = await getPriceContextMap()
  const asOf = new Date().toISOString()
  const out: Record<string, AssetPrice> = {}
  for (const raw of symbols) {
    const symbol = raw.toUpperCase()
    const token = map[symbol]
    if (!token || typeof token.current_price_usd !== "number" || token.current_price_usd <= 0) continue
    const previousPriceUsd =
      typeof token.previous_price_usd === "number" && token.previous_price_usd > 0
        ? token.previous_price_usd
        : token.base_price_usd
    out[symbol] = {
      symbol,
      usd: token.current_price_usd,
      base_price_usd: token.base_price_usd,
      previous_price_usd: previousPriceUsd,
      change_pct:
        typeof token.last_change_pct === "number"
          ? token.last_change_pct
          : pctChange(previousPriceUsd, token.current_price_usd),
      change_from_base_pct: pctChange(token.base_price_usd, token.current_price_usd),
      last_direction: token.last_direction as 1 | -1,
      asset_class: token.asset_class as AssetClass,
      source: "sandbox-router",
      as_of: token.last_updated ? new Date(token.last_updated).toISOString() : asOf,
    }
  }
  return out
}

/**
 * Convert a USD number to the 1e18-scaled bigint the IMSY contracts use.
 * Mirrors `lib/web3/peg.ts:usdToScaled` but kept server-only here so engine
 * code can stay free of client imports.
 */
export function usdToScaled(usd: number): bigint {
  if (!Number.isFinite(usd) || usd <= 0) return 0n
  const normalized = usd.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 18,
  })
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 0n
  const [whole, fraction = ""] = normalized.split(".")
  const paddedFraction = `${fraction}${"0".repeat(18)}`.slice(0, 18)
  return BigInt(whole) * 10n ** 18n + BigInt(paddedFraction)
}

export function scaledToUsd(scaled: bigint): number {
  return Number(scaled / 10n ** 12n) / 1_000_000
}
