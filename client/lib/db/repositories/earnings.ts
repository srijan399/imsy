import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { CreatorEarningsModel } from "@/lib/db/models/CreatorEarnings"
import { AgentModel } from "@/lib/db/models/Agent"

export async function listEarningsByWallet(wallet: string) {
  await connectMongo()
  const lower = wallet.toLowerCase()
  const earnings = await CreatorEarningsModel.find({ creator_wallet: lower })
    .sort({ calculated_at: -1 })
    .lean()
    .exec()

  const agentIds = Array.from(new Set(earnings.map((e) => e.agent_id)))
  const agents = agentIds.length ? await AgentModel.find({ agent_id: { $in: agentIds } }).lean().exec() : []
  const map = new Map(agents.map((a) => [a.agent_id, a]))

  return earnings.map((e) => ({ ...e, agent: map.get(e.agent_id) ?? null }))
}

export async function recordCreatorEarning(input: {
  creator_wallet: string
  agent_id: number
  season_chain_id_hex: string
  market_contract: string
  total_fee_pool: number
  creator_share_rate: number
  earned_amount: number
  tx_hash: string
}) {
  await connectMongo()
  const doc = new CreatorEarningsModel({
    creator_wallet: input.creator_wallet.toLowerCase(),
    agent_id: input.agent_id,
    season_chain_id_hex: input.season_chain_id_hex.toLowerCase(),
    eligible_market_contracts: [input.market_contract.toLowerCase()],
    total_fee_pool: input.total_fee_pool,
    creator_share_rate: input.creator_share_rate,
    earned_amount: input.earned_amount,
    tx_hash: input.tx_hash,
    status: "paid",
    calculated_at: new Date(),
    paid_at: new Date(),
  })
  await doc.save()
  return doc.toObject()
}
