import { NextRequest, NextResponse } from "next/server"
import { connectMongo } from "@/lib/db/mongoose"
import { MarketModel } from "@/lib/db/models/Market"
import { requireAdmin } from "@/lib/auth/admin"
import { readMarketContractSnapshot } from "@/lib/web3/server"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const BATCH_SIZE = 10

async function mapInBatches<T, R>(items: T[], batchSize: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(mapper))
    out.push(...results)
  }
  return out
}

/**
 * List markets that are closed for betting (on-chain snapshot status=locked)
 * and not yet resolved. Admin-gated.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const url = new URL(req.url)
  const limitRaw = Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT)
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT))

  await connectMongo()

  // Pull candidate markets from Mongo, then filter using live chain reads.
  const candidates = await MarketModel.find({ status: { $ne: "resolved" } })
    .sort({ locked_at: -1, created_at: -1 })
    .limit(limit)
    .lean()
    .exec()

  const enriched = await mapInBatches(candidates, BATCH_SIZE, async (market) => {
    try {
      const snapshot = await readMarketContractSnapshot(market.contract_address)
      if (snapshot.status !== "locked") return null
      return {
        contract_address: market.contract_address,
        question: market.question,
        tier: market.tier,
        agent_id: market.agent_id,
        league_chain_id_hex: market.league_chain_id_hex,
        season_chain_id_hex: market.season_chain_id_hex,
        locked_at: market.locked_at ?? null,
        chain_id: market.chain_id,
        ...snapshot,
      }
    } catch {
      return null
    }
  })

  const markets = enriched.filter(Boolean)
  return NextResponse.json({ markets })
}
