import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { TradeLogModel, type TradeLogDoc } from "@/lib/db/models/TradeLog"
import { DEMO_TRADES } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

export async function recordTrade(input: TradeLogDoc) {
  await connectMongo()
  const doc = new TradeLogModel(input)
  await doc.save()
  return doc.toObject()
}

export async function listTradesByAgent(agentId: number, limit = 50) {
  await connectMongo()
  const trades = await TradeLogModel.find({ agent_id: agentId }).sort({ timestamp: -1 }).limit(limit).lean().exec()
  return trades.length || !isDemoDataEnabled() ? trades : (DEMO_TRADES.get(agentId) ?? []).slice(0, limit) as typeof trades
}

export async function listRecentTradesByAgent(agentId: number, limit = 5) {
  await connectMongo()
  const trades = await TradeLogModel.find({ agent_id: agentId }).sort({ timestamp: -1 }).limit(limit).lean().exec()
  return trades.length || !isDemoDataEnabled() ? trades : (DEMO_TRADES.get(agentId) ?? []).slice(0, limit) as typeof trades
}
