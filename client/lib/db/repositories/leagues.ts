import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { LeagueModel, type LeagueDoc } from "@/lib/db/models/League"
import { AgentModel } from "@/lib/db/models/Agent"
import { getSeasonByChainId } from "@/lib/db/repositories/seasons"
import { leagueStatusFromSeasonStatus } from "@/lib/db/status"

async function ensureLeagueStatusUpToDate<
  T extends { chain_id_hex: string; season_chain_id_hex: string; status: LeagueDoc["status"] },
>(league: T): Promise<T> {
  const season = await getSeasonByChainId(league.season_chain_id_hex)
  if (!season) return league
  const desired = leagueStatusFromSeasonStatus(season.status)
  if (league.status === desired) return league
  await LeagueModel.updateOne({ chain_id_hex: league.chain_id_hex }, { status: desired })
  return { ...league, status: desired }
}

export async function listLeagues() {
  await connectMongo()
  const leagues = await LeagueModel.find().sort({ created_at: -1 }).lean().exec()
  const out: typeof leagues = []
  for (const league of leagues) out.push(await ensureLeagueStatusUpToDate(league))
  return out
}

export async function listLeaguesBySeason(seasonChainIdHex: string) {
  await connectMongo()
  // Ensure season status is up-to-date; this may also cascade league status updates.
  await getSeasonByChainId(seasonChainIdHex)
  const leagues = await LeagueModel.find({ season_chain_id_hex: seasonChainIdHex.toLowerCase() }).lean().exec()
  const out: typeof leagues = []
  for (const league of leagues) out.push(await ensureLeagueStatusUpToDate(league))
  return out
}

export async function getLeague(chainIdHex: string) {
  await connectMongo()
  const league = await LeagueModel.findOne({ chain_id_hex: chainIdHex.toLowerCase() }).lean().exec()
  if (!league) return null
  return ensureLeagueStatusUpToDate(league)
}

export async function createLeague(input: {
  chain_id_hex: string
  season_chain_id_hex: string
  name: string
  type?: LeagueDoc["type"]
  asset_universe?: string[]
  initial_capital?: number
  max_drawdown_pct?: number
  allowed_signals?: string[]
  max_leverage?: number
  status?: LeagueDoc["status"]
  tx_hash: string
}) {
  await connectMongo()
  const season = input.status ? null : await getSeasonByChainId(input.season_chain_id_hex)
  const derivedStatus = season ? leagueStatusFromSeasonStatus(season.status) : undefined
  const doc = new LeagueModel({
    chain_id_hex: input.chain_id_hex.toLowerCase(),
    season_chain_id_hex: input.season_chain_id_hex.toLowerCase(),
    name: input.name,
    type: input.type ?? "custom",
    asset_universe: input.asset_universe ?? [],
    initial_capital: input.initial_capital ?? 1000,
    max_drawdown_pct: input.max_drawdown_pct ?? 20,
    allowed_signals: input.allowed_signals ?? [],
    max_leverage: input.max_leverage ?? 1,
    status: input.status ?? derivedStatus ?? "upcoming",
    tx_hash: input.tx_hash,
  })
  await doc.save()
  return doc.toObject()
}

export async function getLeagueWithAgents(chainIdHex: string) {
  await connectMongo()
  const league0 = await LeagueModel.findOne({ chain_id_hex: chainIdHex.toLowerCase() }).lean().exec()
  const league = league0 ? await ensureLeagueStatusUpToDate(league0) : null
  if (!league) return { league: null, agents: [] }
  const agents = await AgentModel.find({ leagues: chainIdHex.toLowerCase() })
    .sort({ current_rank: 1 })
    .lean()
    .exec()
  return { league, agents }
}
