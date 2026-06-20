import { NextResponse } from "next/server"
import { listTokens } from "@/lib/db/repositories/tokens"

export async function GET() {
  const tokens = await listTokens()
  return NextResponse.json(
    tokens.map((t) => ({
      symbol: t.symbol,
      contract_address: t.contract_address,
      asset_class: t.asset_class,
      base_price_usd: t.base_price_usd,
      current_price_usd: t.current_price_usd,
      previous_price_usd: t.previous_price_usd,
      last_change_pct: t.last_change_pct,
      last_direction: t.last_direction,
      last_updated: t.last_updated,
    })),
  )
}
