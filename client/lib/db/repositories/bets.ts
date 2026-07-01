import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { BetModel } from "@/lib/db/models/Bet"
import { MarketModel } from "@/lib/db/models/Market"
import { SeasonModel } from "@/lib/db/models/Season"
import { ensureUser } from "@/lib/db/repositories/agents"
import { verifyBetTransaction } from "@/lib/web3/server"
import { DEMO_BETS } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

export async function placeBet(input: {
  wallet_address: string
  market_contract: string
  side: "yes" | "no"
  stake: number | string
  tx_hash: string
  implied_odds_at_bet?: number
}) {
  await connectMongo()

  const market = await MarketModel.findOne({ contract_address: input.market_contract.toLowerCase() })
  if (!market) throw new Error("Market not found")

  // Markets are sometimes generated before a season becomes active, leaving
  // them `pending` in Mongo even though the contract is already bettable.
  // If the season is active, treat pending as open and persist the fix.
  if (market.status !== "open") {
    if (market.status === "pending") {
      const season = await SeasonModel.findOne({ chain_id_hex: market.season_chain_id_hex }).lean().exec()
      if (season?.status === "active") {
        market.status = "open"
        await market.save()
      }
    }
    if (market.status !== "open") throw new Error("Market is not open")
  }

  const verified = await verifyBetTransaction({
    txHash: input.tx_hash,
    walletAddress: input.wallet_address,
    contractAddress: market.contract_address,
    side: input.side,
    stake: input.stake,
  })

  if (await BetModel.exists({ tx_hash: verified.txHash })) throw new Error("Bet already indexed")

  await ensureUser(verified.walletAddress, "bettor")

  const bet = new BetModel({
    wallet_address: verified.walletAddress,
    market_contract: market.contract_address,
    agent_id: market.agent_id,
    season_chain_id_hex: market.season_chain_id_hex,
    side: input.side,
    stake: verified.stake,
    implied_odds_at_bet: input.implied_odds_at_bet ?? 0,
    tx_hash: verified.txHash,
    tx_block_number: verified.blockNumber,
    status: "active",
    placed_at: new Date(),
  })
  await bet.save()

  if (input.side === "yes") {
    market.yes_pool = Number((market.yes_pool + verified.stake).toFixed(6))
    market.yes_count += 1
  } else {
    market.no_pool = Number((market.no_pool + verified.stake).toFixed(6))
    market.no_count += 1
  }
  market.total_volume = Number((market.yes_pool + market.no_pool).toFixed(6))
  market.interaction_threshold_met = market.yes_pool > 0 && market.no_pool > 0
  await market.save()

  return bet.toObject()
}

export async function listBetsByWallet(wallet: string) {
  await connectMongo()
  const lower = wallet.toLowerCase()
  const bets = await BetModel.find({ wallet_address: lower }).sort({ placed_at: -1 }).lean().exec()
  const contracts = Array.from(new Set(bets.map((bet) => bet.market_contract)))
  const markets = contracts.length
    ? await MarketModel.find({ contract_address: { $in: contracts } }).lean().exec()
    : []
  const marketMap = new Map(markets.map((m) => [m.contract_address, m]))
  if (bets.length === 0 && isDemoDataEnabled()) return DEMO_BETS
  return bets.map((bet) => ({ ...bet, market: marketMap.get(bet.market_contract) ?? null }))
}
