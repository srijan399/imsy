import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { AgentModel, type AgentDoc } from "@/lib/db/models/Agent"
import { LeagueModel } from "@/lib/db/models/League"
import { UserModel } from "@/lib/db/models/User"
import { TradeLogModel } from "@/lib/db/models/TradeLog"
import { MarketModel } from "@/lib/db/models/Market"

export async function listAgents() {
  await connectMongo()
  return AgentModel.find().sort({ current_rank: 1 }).lean().exec()
}

export async function listAgentsByOwner(wallet: string) {
  await connectMongo()
  return AgentModel.find({ owner_wallet: wallet.toLowerCase() }).sort({ current_rank: 1 }).lean().exec()
}

export async function listAgentsByLeague(leagueChainIdHex: string) {
  await connectMongo()
  return AgentModel.find({ leagues: leagueChainIdHex.toLowerCase() }).sort({ current_rank: 1 }).lean().exec()
}

export async function getAgentByOnChainId(agentId: number) {
  await connectMongo()
  return AgentModel.findOne({ agent_id: agentId }).lean().exec()
}

export async function getAgentDetail(agentId: number) {
  await connectMongo()
  const agent = await AgentModel.findOne({ agent_id: agentId }).lean().exec()
  if (!agent) return null
  const [trades, markets] = await Promise.all([
    TradeLogModel.find({ agent_id: agentId }).sort({ timestamp: -1 }).limit(50).lean().exec(),
    MarketModel.find({ agent_id: agentId }).sort({ tier: 1 }).lean().exec(),
  ])
  return { agent, trades, markets }
}

export async function ensureUser(wallet: string, role: "bettor" | "builder" | "admin" = "builder") {
  await connectMongo()
  const lower = wallet.toLowerCase()
  const existing = await UserModel.findOne({ wallet_address: lower }).lean().exec()
  if (existing) return existing
  const doc = new UserModel({
    wallet_address: lower,
    username: `user-${lower.slice(2, 8)}`,
    role,
  })
  await doc.save()
  return doc.toObject()
}

export async function createAgent(input: {
  agent_id: number
  name: string
  owner_wallet: string
  leagues: string[]
  season_chain_id_hex?: string | null
  strategy: AgentDoc["strategy"]
  deposit_usd: string
  deploy_tx_hash: string
  icon: string
  color: string
}) {
  await connectMongo()

  await ensureUser(input.owner_wallet, "builder")

  const initialRank = (await AgentModel.countDocuments({ leagues: { $in: input.leagues } })) + 1

  const doc = new AgentModel({
    agent_id: input.agent_id,
    name: input.name,
    owner_wallet: input.owner_wallet.toLowerCase(),
    leagues: input.leagues.map((l) => l.toLowerCase()),
    season_chain_id_hex: input.season_chain_id_hex?.toLowerCase() ?? null,
    strategy: input.strategy,
    deposit_usd: input.deposit_usd,
    deploy_tx_hash: input.deploy_tx_hash,
    icon: input.icon,
    color: input.color.toLowerCase(),
    status: "registered",
    performance: {},
    current_rank: initialRank,
    rank_history: [{ timestamp: new Date(), rank: initialRank, roi_pct: 0 }],
    prompt_locked_at: new Date(),
  })
  await doc.save()
  const leagueIds = (doc.get("leagues") as string[]) ?? []
  await LeagueModel.updateMany({ chain_id_hex: { $in: leagueIds } }, { $inc: { agent_count: 1 } })
  return doc.toObject()
}

export async function updateAgentPerformance(agentId: number, perf: AgentDoc["performance"], rank?: number) {
  await connectMongo()
  const update: Record<string, unknown> = { performance: perf }
  if (typeof rank === "number") update.current_rank = rank
  return AgentModel.findOneAndUpdate({ agent_id: agentId }, update, { returnDocument: "after" }).lean().exec()
}

export async function pushRankHistory(agentId: number, rank: number, roiPct: number) {
  await connectMongo()
  return AgentModel.findOneAndUpdate(
    { agent_id: agentId },
    { $push: { rank_history: { timestamp: new Date(), rank, roi_pct: roiPct } } },
    { returnDocument: "after" },
  ).lean().exec()
}
