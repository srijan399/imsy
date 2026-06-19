import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { TokenRegistryModel, type TokenRegistryDoc } from "@/lib/db/models/TokenRegistry"

export type AssetClass = "stable" | "volatile" | "peg"

export interface TokenSeed {
  symbol: string
  contract_address: string
  asset_class: AssetClass
  base_price_usd: number
}

export async function seedTokens(seeds: TokenSeed[]): Promise<{ inserted: number; updated: number }> {
  await connectMongo()
  let inserted = 0
  let updated = 0
  for (const seed of seeds) {
    const symbol = seed.symbol.toUpperCase()
    const existing = await TokenRegistryModel.findOne({ symbol }).exec()
    if (existing) {
      existing.contract_address = seed.contract_address.toLowerCase()
      existing.asset_class = seed.asset_class
      existing.base_price_usd = seed.base_price_usd
      // Keep current_price_usd if already drifting; otherwise initialise.
      if (!existing.current_price_usd || existing.current_price_usd <= 0) {
        existing.current_price_usd = seed.base_price_usd
      }
      await existing.save()
      updated += 1
    } else {
      const doc = new TokenRegistryModel({
        symbol,
        contract_address: seed.contract_address.toLowerCase(),
        asset_class: seed.asset_class,
        base_price_usd: seed.base_price_usd,
        current_price_usd: seed.base_price_usd,
        previous_price_usd: seed.base_price_usd,
        last_change_pct: 0,
        last_direction: 1,
        last_updated: new Date(),
      })
      await doc.save()
      inserted += 1
    }
  }
  return { inserted, updated }
}

export async function listTokens(): Promise<TokenRegistryDoc[]> {
  await connectMongo()
  return TokenRegistryModel.find().sort({ symbol: 1 }).lean().exec() as Promise<TokenRegistryDoc[]>
}

export async function listSymbols(): Promise<string[]> {
  const tokens = await listTokens()
  return tokens.map((t) => t.symbol)
}

export async function getTokenBySymbol(symbol: string) {
  await connectMongo()
  return TokenRegistryModel.findOne({ symbol: symbol.toUpperCase() }).lean().exec() as Promise<TokenRegistryDoc | null>
}

export async function updateTokenPrice(symbol: string, newPriceUsd: number, lastDirection: 1 | -1) {
  await connectMongo()
  const existing = await TokenRegistryModel.findOne({ symbol: symbol.toUpperCase() }).exec()
  const previousPriceUsd = existing?.current_price_usd ?? newPriceUsd
  const lastChangePct =
    previousPriceUsd > 0 ? ((newPriceUsd - previousPriceUsd) / previousPriceUsd) * 100 : 0

  return TokenRegistryModel.findOneAndUpdate(
    { symbol: symbol.toUpperCase() },
    {
      current_price_usd: newPriceUsd,
      previous_price_usd: previousPriceUsd,
      last_change_pct: lastChangePct,
      last_direction: lastDirection,
      last_updated: new Date(),
    },
    { returnDocument: "after" },
  )
    .lean()
    .exec()
}

export async function getPriceMap(): Promise<Record<string, number>> {
  const tokens = await listTokens()
  const map: Record<string, number> = {}
  for (const t of tokens) map[t.symbol] = t.current_price_usd
  return map
}

export async function getPriceContextMap(): Promise<Record<string, TokenRegistryDoc>> {
  const tokens = await listTokens()
  const map: Record<string, TokenRegistryDoc> = {}
  for (const token of tokens) map[token.symbol] = token
  return map
}
