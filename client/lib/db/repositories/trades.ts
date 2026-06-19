import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { TradeLogModel, type TradeLogDoc } from "@/lib/db/models/TradeLog"

export async function recordTrade(input: TradeLogDoc) {
  await connectMongo()
  const doc = new TradeLogModel(input)
  await doc.save()
  return doc.toObject()
}

export async function listTradesByAgent(agentId: number, limit = 50) {
  await connectMongo()
  return TradeLogModel.find({ agent_id: agentId }).sort({ timestamp: -1 }).limit(limit).lean().exec()
}

export async function listRecentTradesByAgent(agentId: number, limit = 5) {
  await connectMongo()
  return TradeLogModel.find({ agent_id: agentId }).sort({ timestamp: -1 }).limit(limit).lean().exec()
}
