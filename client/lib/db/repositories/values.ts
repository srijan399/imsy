import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { AgentValueSnapshotModel, type AgentValueSnapshotDoc } from "@/lib/db/models/AgentValueSnapshot"

export type SnapshotKind = "engine_tick" | "reprice_tick" | "registration"

export async function recordSnapshot(input: {
  agent_id: number
  league_chain_id_hex: string
  cash_usd: bigint
  position_value_usd: bigint
  total_value_usd: bigint
  pnl_pct: number
  snapshot_kind: SnapshotKind
  timestamp?: Date
}) {
  await connectMongo()
  const doc = new AgentValueSnapshotModel({
    agent_id: input.agent_id,
    league_chain_id_hex: input.league_chain_id_hex.toLowerCase(),
    timestamp: input.timestamp ?? new Date(),
    cash_usd: input.cash_usd.toString(),
    position_value_usd: input.position_value_usd.toString(),
    total_value_usd: input.total_value_usd.toString(),
    pnl_pct: input.pnl_pct,
    snapshot_kind: input.snapshot_kind,
  })
  await doc.save()
  return doc.toObject()
}

export async function listSnapshotsByLeague(leagueChainIdHex: string, sinceTs: Date) {
  await connectMongo()
  return AgentValueSnapshotModel.find({
    league_chain_id_hex: leagueChainIdHex.toLowerCase(),
    timestamp: { $gte: sinceTs },
  })
    .sort({ timestamp: 1 })
    .lean()
    .exec() as Promise<AgentValueSnapshotDoc[]>
}

export async function listLatestSnapshotPerAgent(leagueChainIdHex: string) {
  await connectMongo()
  // For small agent counts (hackathon), this aggregation is cheap.
  return AgentValueSnapshotModel.aggregate([
    { $match: { league_chain_id_hex: leagueChainIdHex.toLowerCase() } },
    { $sort: { timestamp: -1 } },
    { $group: { _id: "$agent_id", doc: { $first: "$$ROOT" } } },
    { $replaceRoot: { newRoot: "$doc" } },
  ]).exec()
}
