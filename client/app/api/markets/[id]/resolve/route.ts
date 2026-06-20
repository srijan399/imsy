import { NextRequest, NextResponse } from "next/server"
import { connectMongo } from "@/lib/db/mongoose"
import { MarketModel } from "@/lib/db/models/Market"
import { AgentModel } from "@/lib/db/models/Agent"
import { BetModel } from "@/lib/db/models/Bet"
import { recordCreatorEarning } from "@/lib/db/repositories/earnings"
import { resolveMarketContract } from "@/lib/web3/server"
import { isInTier } from "@/lib/engine/rank-calculator"
import { requireAdmin } from "@/lib/auth/admin"

const PLATFORM_FEE_BPS = Number(process.env.MARKET_PLATFORM_FEE_BPS ?? 200)
const CREATOR_SHARE_BPS = Number(process.env.MARKET_CREATOR_SHARE_BPS ?? 2500)

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    await connectMongo()
    const { id } = await params

    const market = await MarketModel.findOne({ contract_address: id.toLowerCase() })
    if (!market) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (market.status === "resolved") return NextResponse.json({ error: "Already resolved" }, { status: 400 })

    const agent = await AgentModel.findOne({ agent_id: market.agent_id })
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 })

    const outcome: "yes" | "no" = isInTier(agent.current_rank, market.tier) ? "yes" : "no"
    const tx = await resolveMarketContract(market.contract_address, outcome)

    market.outcome = outcome
    market.status = "resolved"
    market.resolved_at = new Date()
    market.interaction_threshold_met = market.yes_pool > 0 && market.no_pool > 0
    await market.save()

    const winningPool = outcome === "yes" ? market.yes_pool : market.no_pool
    const totalPool = market.yes_pool + market.no_pool
    const fee = totalPool * (PLATFORM_FEE_BPS / 10000)
    const creatorShare = market.interaction_threshold_met ? fee * (CREATOR_SHARE_BPS / 10000) : 0
    const netPool = totalPool - fee

    const bets = await BetModel.find({ market_contract: market.contract_address })
    for (const bet of bets) {
      bet.resolved_at = market.resolved_at
      bet.status = bet.side === outcome ? "won" : "lost"
      bet.payout = bet.status === "won" && winningPool > 0 ? Number(((bet.stake / winningPool) * netPool).toFixed(6)) : 0
      await bet.save()
    }

    if (creatorShare > 0) {
      await recordCreatorEarning({
        creator_wallet: agent.owner_wallet,
        agent_id: agent.agent_id,
        season_chain_id_hex: market.season_chain_id_hex,
        market_contract: market.contract_address,
        total_fee_pool: Number(fee.toFixed(6)),
        creator_share_rate: CREATOR_SHARE_BPS / 10000,
        earned_amount: Number(creatorShare.toFixed(6)),
        tx_hash: tx.txHash,
      })
    }

    return NextResponse.json({
      market: market.contract_address,
      outcome,
      tx_hash: tx.txHash,
      agent_rank: agent.current_rank,
      tier: market.tier,
      interaction_threshold_met: market.interaction_threshold_met,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
