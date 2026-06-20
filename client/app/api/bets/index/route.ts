import { NextRequest, NextResponse } from "next/server"
import { placeBet } from "@/lib/db/repositories/bets"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const bet = await placeBet({
      wallet_address: body.wallet_address,
      market_contract: body.market_contract ?? body.market_id,
      side: body.side,
      stake: body.stake,
      tx_hash: body.tx_hash,
      implied_odds_at_bet: body.implied_odds_at_bet,
    })
    return NextResponse.json(bet, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
