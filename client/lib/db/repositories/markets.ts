import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { MarketModel, type MarketDoc } from "@/lib/db/models/Market"
import { AgentModel } from "@/lib/db/models/Agent"
import { getLeague } from "@/lib/db/repositories/leagues"
import { getSeasonByChainId } from "@/lib/db/repositories/seasons"
import { readMarketContractSnapshot } from "@/lib/web3/server"

export async function listMarketsByLeague(leagueChainIdHex: string) {
  await connectMongo()
  // Ensure season/league statuses are up-to-date for this league.
  const league = await getLeague(leagueChainIdHex)
  if (league) await getSeasonByChainId(league.season_chain_id_hex)
  return MarketModel.find({ league_chain_id_hex: leagueChainIdHex.toLowerCase() })
    .sort({ tier: 1, total_volume: -1 })
    .lean()
    .exec()
}

export async function listMarketsByAgent(agentId: number) {
  await connectMongo()
  return MarketModel.find({ agent_id: agentId }).lean().exec()
}

export async function listOpenMarkets(limit = 30) {
  await connectMongo()
  const markets = await MarketModel.find({ status: { $in: ["open", "pending"] } })
    .sort({ created_at: -1 })
    .limit(limit)
    .lean()
    .exec()

  const seasonIds = Array.from(new Set(markets.map((m) => m.season_chain_id_hex)))
  const seasons = await Promise.all(seasonIds.map((id) => getSeasonByChainId(id)))
  const seasonById = new Map(seasons.filter(Boolean).map((s) => [s!.chain_id_hex, s!]))

  for (const market of markets) {
    const season = seasonById.get(market.season_chain_id_hex)
    if (!season) continue

    if (season.status === "active" && market.status === "pending") {
      await MarketModel.updateOne({ contract_address: market.contract_address, status: "pending" }, { status: "open" })
      market.status = "open"
    } else if ((season.status === "ended" || season.status === "settled") && (market.status === "open" || market.status === "pending")) {
      await MarketModel.updateOne(
        { contract_address: market.contract_address, status: { $in: ["open", "pending"] } },
        { status: "locked", locked_at: new Date() },
      )
      market.status = "locked"
    } else if ((season.status === "upcoming" || season.status === "registration") && market.status === "open") {
      await MarketModel.updateOne({ contract_address: market.contract_address, status: "open" }, { status: "pending" })
      market.status = "pending"
    }
  }

  return markets
}

export async function getMarket(contractAddress: string) {
  await connectMongo()
  const market = await MarketModel.findOne({ contract_address: contractAddress.toLowerCase() }).lean().exec()
  if (!market) return null

  const [agent, league, season] = await Promise.all([
    AgentModel.findOne({ agent_id: market.agent_id }).lean().exec(),
    getLeague(market.league_chain_id_hex),
    getSeasonByChainId(market.season_chain_id_hex),
  ])

  if (season) {
    // Keep market status consistent with season status even when chain reads fail.
    if (season.status === "active" && market.status === "pending") {
      await MarketModel.updateOne(
        { contract_address: market.contract_address, status: "pending" },
        { status: "open" },
      )
      market.status = "open"
    } else if ((season.status === "ended" || season.status === "settled") && (market.status === "open" || market.status === "pending")) {
      await MarketModel.updateOne(
        { contract_address: market.contract_address, status: { $in: ["open", "pending"] } },
        { status: "locked", locked_at: new Date() },
      )
      market.status = "locked"
    } else if ((season.status === "upcoming" || season.status === "registration") && market.status === "open") {
      await MarketModel.updateOne(
        { contract_address: market.contract_address, status: "open" },
        { status: "pending" },
      )
      market.status = "pending"
    }
  }

  const allowChainStatus = market.status !== "pending"

  try {
    const snapshot = await readMarketContractSnapshot(market.contract_address)
    // When a market is intentionally `pending` (season not active), don't let
    // chain-derived "open" override that application-level gate.
    if (!allowChainStatus) {
      const { status: _ignored, ...rest } = snapshot
      return { ...market, ...rest, agent, league, season }
    }
    return { ...market, ...snapshot, agent, league, season }
  } catch (error) {
    return { ...market, agent, league, season, contract_read_error: (error as Error).message }
  }
}

export async function upsertMarket(input: {
  contract_address: string
  league_chain_id_hex: string
  season_chain_id_hex: string
  agent_id: number
  tier: number
  question: string
  deployment_tx_hash: string
  deployed_at: Date
  chain_id: number
  status?: MarketDoc["status"]
}) {
  await connectMongo()
  const filter = { contract_address: input.contract_address.toLowerCase() }
  return MarketModel.findOneAndUpdate(
    filter,
    {
      $setOnInsert: {
        contract_address: input.contract_address.toLowerCase(),
        league_chain_id_hex: input.league_chain_id_hex.toLowerCase(),
        season_chain_id_hex: input.season_chain_id_hex.toLowerCase(),
        agent_id: input.agent_id,
        tier: input.tier,
        question: input.question,
        deployment_tx_hash: input.deployment_tx_hash,
        deployed_at: input.deployed_at,
        chain_id: input.chain_id,
        status: input.status ?? "open",
        created_at: new Date(),
      },
    },
    { upsert: true, returnDocument: "after" },
  ).lean().exec()
}
