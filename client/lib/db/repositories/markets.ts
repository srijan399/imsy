import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { MarketModel, type MarketDoc } from "@/lib/db/models/Market"
import { AgentModel } from "@/lib/db/models/Agent"
import { getLeague } from "@/lib/db/repositories/leagues"
import { getSeasonByChainId } from "@/lib/db/repositories/seasons"
import { readMarketContractSnapshot } from "@/lib/web3/server"
import { DEMO_MARKETS, getDemoAgent, getDemoMarket, getDemoMarketsByAgent, getDemoMarketsByLeague } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

export async function listMarketsByLeague(leagueChainIdHex: string) {
  await connectMongo()
  // Ensure season/league statuses are up-to-date for this league.
  const league = await getLeague(leagueChainIdHex)
  if (league) await getSeasonByChainId(league.season_chain_id_hex)
  const markets = await MarketModel.find({ league_chain_id_hex: leagueChainIdHex.toLowerCase() })
    .sort({ tier: 1, total_volume: -1 })
    .lean()
    .exec()
  return mergeDemoMarkets(markets, getDemoMarketsByLeague(leagueChainIdHex))
}

export async function listMarketsByAgent(agentId: number) {
  await connectMongo()
  const markets = await MarketModel.find({ agent_id: agentId }).lean().exec()
  return mergeDemoMarkets(markets, getDemoMarketsByAgent(agentId))
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

  return mergeDemoMarkets(markets, DEMO_MARKETS).slice(0, limit) as typeof markets
}

export async function getMarket(contractAddress: string) {
  await connectMongo()
  const market = await MarketModel.findOne({ contract_address: contractAddress.toLowerCase() }).lean().exec()
  const demoMarket = isDemoDataEnabled() ? getDemoMarket(contractAddress) : null
  if (!market && !demoMarket) return null

  if (!market && demoMarket) {
    const [league, season] = await Promise.all([
      getLeague(demoMarket.league_chain_id_hex),
      getSeasonByChainId(demoMarket.season_chain_id_hex),
    ])
    return { ...demoMarket, agent: getDemoAgent(demoMarket.agent_id), league, season }
  }

  const marketDoc = market!
  const [agent, league, season] = await Promise.all([
    AgentModel.findOne({ agent_id: marketDoc.agent_id }).lean().exec(),
    getLeague(marketDoc.league_chain_id_hex),
    getSeasonByChainId(marketDoc.season_chain_id_hex),
  ])

  if (season) {
    // Keep market status consistent with season status even when chain reads fail.
    if (season.status === "active" && marketDoc.status === "pending") {
      await MarketModel.updateOne(
        { contract_address: marketDoc.contract_address, status: "pending" },
        { status: "open" },
      )
      marketDoc.status = "open"
    } else if ((season.status === "ended" || season.status === "settled") && (marketDoc.status === "open" || marketDoc.status === "pending")) {
      await MarketModel.updateOne(
        { contract_address: marketDoc.contract_address, status: { $in: ["open", "pending"] } },
        { status: "locked", locked_at: new Date() },
      )
      marketDoc.status = "locked"
    } else if ((season.status === "upcoming" || season.status === "registration") && marketDoc.status === "open") {
      await MarketModel.updateOne(
        { contract_address: marketDoc.contract_address, status: "open" },
        { status: "pending" },
      )
      marketDoc.status = "pending"
    }
  }

  const allowChainStatus = marketDoc.status !== "pending"

  try {
    const snapshot = await readMarketContractSnapshot(marketDoc.contract_address)
    // When a market is intentionally `pending` (season not active), don't let
    // chain-derived "open" override that application-level gate.
    if (!allowChainStatus) {
      const { status: _ignored, ...rest } = snapshot
      return { ...marketDoc, ...rest, agent, league, season }
    }
    return { ...marketDoc, ...snapshot, agent, league, season }
  } catch (error) {
    return { ...marketDoc, agent, league, season, contract_read_error: (error as Error).message }
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

function mergeDemoMarkets<T extends Array<{ contract_address: string }>>(markets: T, demos = DEMO_MARKETS) {
  if (!isDemoDataEnabled()) return markets
  const seen = new Set(markets.map((market) => market.contract_address.toLowerCase()))
  return [...markets, ...demos.filter((market) => !seen.has(market.contract_address.toLowerCase()))] as unknown as T
}
