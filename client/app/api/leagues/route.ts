import { NextRequest, NextResponse } from "next/server"
import { createLeague, listLeagues } from "@/lib/db/repositories/leagues"
import { verifyLeagueOnChain } from "@/lib/web3/server"

export async function GET() {
  return NextResponse.json(await listLeagues())
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      chain_id_hex,
      season_chain_id_hex,
      name,
      type,
      asset_universe,
      initial_capital,
      max_drawdown_pct,
      allowed_signals,
      max_leverage,
      status,
      tx_hash,
    } = body ?? {}

    if (!chain_id_hex || !season_chain_id_hex) throw new Error("chain_id_hex and season_chain_id_hex required")
    if (!name) throw new Error("name required")
    if (!tx_hash) throw new Error("tx_hash required")

    const onChain = await verifyLeagueOnChain(chain_id_hex)
    if (!onChain.exists) throw new Error("League not found on-chain")
    if (onChain.seasonId.toLowerCase() !== String(season_chain_id_hex).toLowerCase()) {
      throw new Error("On-chain seasonId mismatch")
    }

    const league = await createLeague({
      chain_id_hex,
      season_chain_id_hex,
      name,
      type,
      asset_universe,
      initial_capital,
      max_drawdown_pct,
      allowed_signals,
      max_leverage,
      status,
      tx_hash,
    })
    return NextResponse.json(league, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
