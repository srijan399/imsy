#!/usr/bin/env node
// Maximum-drama local market driver.
//
// This script bypasses the LLM and creates visible sandbox action:
//   1. Randomly reprices league tokens on the sandbox router and Mongo.
//   2. Executes random buy/sell trades for active league agents.
//   3. Writes fresh valuation snapshots and ranks so the PnL chart moves.
//
// Env:
//   MONGODB_URI, MONGODB_DB
//   RPC_URL / NEXT_PUBLIC_RPC_URL
//   CHAIN_ID / NEXT_PUBLIC_CHAIN_ID
//   NEXT_PUBLIC_MARKET_FACTORY_ADDRESS
//   SANDBOX_ROUTER_ADDRESS
//   PRIVATE_KEY                 router owner, for setUsdPrice
//   EXECUTOR_PRIVATE_KEY         factory executor, for executeTrade
//
// Usage:
//   bun run chaos
//   bun run chaos:loop
//
// Optional:
//   CHAOS_LEAGUE_NAME="High Risk League"
//   CHAOS_LOOP_MS=45000
//   CHAOS_TRADE_NOTIONAL_MIN=25000
//   CHAOS_TRADE_NOTIONAL_MAX=250000
//   CHAOS_RUG_PROB=0.5
//   CHAOS_MEME_PUMP_MAX_FACTOR=11
//   CHAOS_MEME_RUG_MIN_FACTOR=0.0909
//   CHAOS_MAJOR_PUMP_MAX_FACTOR=1.5
//   CHAOS_MAJOR_RUG_MIN_FACTOR=0.5

import "dotenv/config"
import dotenv from "dotenv"
import mongoose from "mongoose"
import { ethers } from "ethers"
import { setTimeout as sleep } from "node:timers/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env.local") })

const SCALE = 10n ** 18n
const MEME_SYMBOLS = new Set(["DOGE", "SHIB", "PEPE", "FLOKI", "WIF", "BONK", "MOON", "JEFE", "SCAM", "RUG"])
const PEG_SYMBOLS = new Set(["USD", "USDC"])

const FACTORY_ABI = [
  "function executeTrade(uint256 agentId,uint8 action,bytes32 asset,uint256 qty,uint256 priceUsd,bytes32 reasonHash) returns (bool)",
  "function getAgent(uint256 agentId) view returns (tuple(address owner,string name,bytes32 strategyRoot,bool exists,uint256 cashUsd,uint256 tradeCount,uint64 createdAt))",
  "function getAgentAssets(uint256 agentId) view returns (bytes32[])",
  "function getAgentPosition(uint256 agentId,bytes32 asset) view returns (uint256 qty,uint256 avgPriceUsd)",
  "event TradeExecuted(uint256 indexed agentId,uint256 indexed tradeId,uint8 action,bytes32 asset,uint256 qty,uint256 priceUsd,bool success,bool simulated,bytes32 reasonHash)",
]

const ROUTER_ABI = ["function setUsdPrice(bytes32 symbol,uint256 priceUsd)"]

const LOOP = process.argv.includes("--loop")
const LOOP_MS = Number(process.env.CHAOS_LOOP_MS || 60_000)
const LEAGUE_NAME = process.env.CHAOS_LEAGUE_NAME || "High Risk League"
const TRADE_NOTIONAL_MIN = Number(process.env.CHAOS_TRADE_NOTIONAL_MIN || 25_000)
const TRADE_NOTIONAL_MAX = Number(process.env.CHAOS_TRADE_NOTIONAL_MAX || 250_000)
const BUY_CASH_FRACTION_MAX = Number(process.env.CHAOS_BUY_CASH_FRACTION_MAX || 0.6)
const RUG_PROB = Number(process.env.CHAOS_RUG_PROB || 0.5)
const MEME_PUMP_MAX_FACTOR = Number(process.env.CHAOS_MEME_PUMP_MAX_FACTOR || 3)
const MEME_RUG_MIN_FACTOR = Number(process.env.CHAOS_MEME_RUG_MIN_FACTOR || 0.33)
const MAJOR_PUMP_MAX_FACTOR = Number(process.env.CHAOS_MAJOR_PUMP_MAX_FACTOR || 1.2)
const MAJOR_RUG_MIN_FACTOR = Number(process.env.CHAOS_MAJOR_RUG_MIN_FACTOR || 0.8)

function required(name, fallback) {
  const value = process.env[name] || fallback
  if (!value) throw new Error(`${name} is required`)
  return value
}

function usdToScaled(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return 0n
  const normalized = usd.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 18,
  })
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 0n
  const [whole, fraction = ""] = normalized.split(".")
  const paddedFraction = `${fraction}${"0".repeat(18)}`.slice(0, 18)
  return BigInt(whole) * SCALE + BigInt(paddedFraction)
}

function scaledToUsd(value) {
  return Number(BigInt(value || 0) / 10n ** 12n) / 1_000_000
}

function qtyToScaled(qty) {
  if (!Number.isFinite(qty) || qty <= 0) return 0n
  const normalized = qty.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 18,
  })
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 0n
  const [whole, fraction = ""] = normalized.split(".")
  const paddedFraction = `${fraction}${"0".repeat(18)}`.slice(0, 18)
  return BigInt(whole) * SCALE + BigInt(paddedFraction)
}

function symbolToBytes32(symbol) {
  return ethers.encodeBytes32String(symbol)
}

function bytes32ToSymbol(value) {
  return ethers.decodeBytes32String(value)
}

function uniform(min, max) {
  return min + Math.random() * (max - min)
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function shuffle(items) {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function moveBounds(symbol) {
  const isMeme = MEME_SYMBOLS.has(symbol)
  const pumpMax = Math.max(1.000001, isMeme ? MEME_PUMP_MAX_FACTOR : MAJOR_PUMP_MAX_FACTOR)
  const rugMin = Math.min(0.999999, Math.max(1e-9, isMeme ? MEME_RUG_MIN_FACTOR : MAJOR_RUG_MIN_FACTOR))
  return { pumpMax, rugMin }
}

function directionalMoveFactor(symbol, direction, minMagnitude = 1) {
  const { pumpMax, rugMin } = moveBounds(symbol)
  const maxMagnitude = direction === "rug" ? 1 / rugMin : pumpMax
  const min = Math.min(Math.max(1, minMagnitude), maxMagnitude)
  const logMagnitude = uniform(Math.log(min), Math.log(maxMagnitude))
  // Reciprocal moves are proportionate in price space: +1000% pairs with -90.9%,
  // since losses cannot go below -100%.
  return direction === "rug" ? Math.exp(-logMagnitude) : Math.exp(logMagnitude)
}

function randomPrice(symbol, current) {
  const direction = Math.random() < 0.5 ? "rug" : "pump"
  const factor = directionalMoveFactor(symbol, direction)
  return Math.max(current * factor, current / 1000, 1e-18)
}

function fatePrice(symbol, current, fate) {
  const isMeme = MEME_SYMBOLS.has(symbol)
  const minMagnitude = isMeme ? 1.75 : 1.08
  const factor = directionalMoveFactor(symbol, fate === "rug" ? "rug" : "pump", minMagnitude)
  return Math.max(current * factor, current / 1000, 1e-18)
}

function wholeTokenQtyForNotional(notional, price) {
  if (!Number.isFinite(notional) || !Number.isFinite(price) || price <= 0) return 0
  return Math.max(1, Math.floor(notional / price))
}

function wholeTokenSellQty(rawQty) {
  const held = scaledToUsd(rawQty)
  return Math.max(0, Math.floor(held * uniform(0.15, 0.75)))
}

function shortHash(value) {
  return value ? `${value.slice(0, 10)}...${value.slice(-6)}` : "-"
}

async function connectMongo() {
  const uri = required("MONGODB_URI")
  const dbName = process.env.MONGODB_DB
  await mongoose.connect(uri, { dbName, bufferCommands: false, maxPoolSize: 10 })
  return mongoose.connection.db
}

async function sendWithPendingNonce(wallet, fn, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const nonce = await wallet.provider.getTransactionCount(wallet.address, "pending")
      const tx = await fn(nonce)
      const receipt = await tx.wait()
      return { tx, receipt }
    } catch (error) {
      const msg = String(error?.message || error)
      if (!/nonce too low|nonce has already been used|NONCE_EXPIRED|replacement transaction underpriced|replacement fee too low|REPLACEMENT_UNDERPRICED/i.test(msg)) {
        throw error
      }
      console.warn(`[chaos] ${label} nonce race; retrying (${attempt + 1}/3)`)
      await sleep(750 * (attempt + 1))
    }
  }
  throw new Error(`${label} failed after nonce retries`)
}

async function repriceTokens({ db, router, ownerWallet, league, tokenFates = new Map() }) {
  const symbols = league.asset_universe.filter((symbol) => symbol && !PEG_SYMBOLS.has(symbol))
  const tokens = await db.collection("tokenregistries").find({ symbol: { $in: symbols } }).toArray()
  const updates = []

  for (const token of tokens) {
    const symbol = token.symbol
    const from = Number(token.current_price_usd)
    if (!Number.isFinite(from) || from <= 0) continue
    const to = tokenFates.has(symbol) ? fatePrice(symbol, from, tokenFates.get(symbol)) : randomPrice(symbol, from)
    const direction = to >= from ? 1 : -1
    const changePct = ((to - from) / from) * 100

    await sendWithPendingNonce(
      ownerWallet,
      (nonce) => router.setUsdPrice(symbolToBytes32(symbol), usdToScaled(to), { nonce }),
      `setUsdPrice ${symbol}`,
    )

    await db.collection("tokenregistries").updateOne(
      { symbol },
      {
        $set: {
          previous_price_usd: from,
          current_price_usd: to,
          last_change_pct: changePct,
          last_direction: direction,
          last_updated: new Date(),
        },
      },
    )
    updates.push({ symbol, from, to, changePct, fate: tokenFates.get(symbol) || "random" })
  }

  return updates
}

async function readAgentState(factory, agentId) {
  const agent = await factory.getAgent(agentId)
  const assetBytes = await factory.getAgentAssets(agentId)
  const positions = []
  for (const asset of assetBytes) {
    const symbol = bytes32ToSymbol(asset)
    const [qty, avgPriceUsd] = await factory.getAgentPosition(agentId, asset)
    if (qty > 0n) positions.push({ symbol, qty, avgPriceUsd })
  }
  return { agent, positions }
}

async function executeRandomTrades({ db, factory, executorWallet, league, agents, priceMap }) {
  const out = []
  const tokenFates = new Map()
  const tradeableSymbols = league.asset_universe.filter((symbol) => priceMap[symbol] > 0 && !PEG_SYMBOLS.has(symbol))
  const shuffledSymbols = shuffle(tradeableSymbols)

  for (let i = 0; i < agents.length; i++) {
    const agentDoc = agents[i]
    const { agent, positions } = await readAgentState(factory, agentDoc.agent_id)
    if (!agent.exists) continue

    const canSell = positions.length > 0
    const action = canSell && Math.random() < 0.2 ? "sell" : "buy"
    const symbol = action === "sell" ? pick(positions).symbol : shuffledSymbols[i % shuffledSymbols.length]
    const fate = action === "buy" ? (Math.random() < RUG_PROB ? "rug" : "pump") : "random"
    if (action === "buy") tokenFates.set(symbol, fate)
    const price = priceMap[symbol]
    if (!price) continue

    let qty
    if (action === "sell") {
      const pos = positions.find((p) => p.symbol === symbol)
      qty = wholeTokenSellQty(pos.qty)
      if (qty <= 0) continue
    } else {
      const cashUsd = scaledToUsd(agent.cashUsd)
      const maxNotional = cashUsd * BUY_CASH_FRACTION_MAX
      const notional = Math.min(Math.max(uniform(TRADE_NOTIONAL_MIN, TRADE_NOTIONAL_MAX), price), maxNotional)
      qty = wholeTokenQtyForNotional(notional, price)
    }

    const qtyScaled = qtyToScaled(qty)
    const priceScaled = usdToScaled(price)
    if (qtyScaled <= 0n || priceScaled <= 0n) continue

    const actionCode = action === "buy" ? 0 : 1
    const reasonHash = ethers.id(`chaos-${agentDoc.agent_id}-${symbol}-${Date.now()}-${Math.random()}`)
    let success = false
    let txHash = null
    let blockNumber = null

    try {
      const { tx, receipt } = await sendWithPendingNonce(
        executorWallet,
        (nonce) =>
          factory.executeTrade(BigInt(agentDoc.agent_id), actionCode, symbolToBytes32(symbol), qtyScaled, priceScaled, reasonHash, {
            nonce,
          }),
        `executeTrade agent ${agentDoc.agent_id}`,
      )
      txHash = tx.hash
      blockNumber = receipt.blockNumber
      for (const log of receipt.logs) {
        try {
          const parsed = factory.interface.parseLog({ topics: log.topics, data: log.data })
          if (parsed?.name === "TradeExecuted") success = Boolean(parsed.args.success)
        } catch {}
      }
    } catch (error) {
      console.warn(`[chaos] agent ${agentDoc.agent_id} ${action} ${symbol} failed: ${error?.message || error}`)
    }

    const after = await readAgentState(factory, agentDoc.agent_id)
    const valueAfter = valueAgent(after.agent.cashUsd, after.positions, priceMap)

    await db.collection("tradelogs").insertOne({
      agent_id: agentDoc.agent_id,
      league_chain_id_hex: league.chain_id_hex,
      season_chain_id_hex: agentDoc.season_chain_id_hex || league.season_chain_id_hex,
      timestamp: new Date(),
      action,
      asset: symbol,
      quantity: qty,
      price_usd: priceScaled.toString(),
      success,
      simulated: false,
      dex_router: null,
      reason: `chaos script ${action} ${symbol}`,
      confidence: 1,
      portfolio_value_usd_after: valueAfter.totalUsd.toString(),
      tx_hash: txHash,
      reason_hash: reasonHash,
      zg_storage_status: "local_hash_only",
      compute_ref: { model: "chaos-script", endpoint: "local", response_id: null, tee_verified: false, status: "not_configured" },
      created_at: new Date(),
      updated_at: new Date(),
    })

    out.push({ agentId: agentDoc.agent_id, name: agentDoc.name, action, symbol, qty, price, fate, success, txHash })
  }

  return { trades: out, tokenFates }
}

function valueAgent(cashUsd, positions, priceMap) {
  let positionUsd = 0n
  for (const pos of positions) {
    const price = priceMap[pos.symbol]
    if (!price) continue
    positionUsd += (pos.qty * usdToScaled(price)) / SCALE
  }
  const totalUsd = BigInt(cashUsd) + positionUsd
  return { cashUsd: BigInt(cashUsd), positionUsd, totalUsd }
}

function percentChangeScaled(current, initial) {
  if (initial === 0n) return 0
  return Number(((current - initial) * 1_000_000n) / initial) / 10_000
}

async function computeAgentMetrics(db, agentId, leagueChainIdHex, currentRoiPct) {
  const snapshots = await db.collection("agentvaluesnapshots")
    .find({ agent_id: agentId, league_chain_id_hex: leagueChainIdHex })
    .sort({ timestamp: 1 })
    .project({ pnl_pct: 1 })
    .toArray()

  const pnls = [...snapshots.map((s) => s.pnl_pct), currentRoiPct]
  if (pnls.length < 2) return { sharpe: 0, maxDrawdownPct: 0, winRate: 0 }

  let peak = pnls[0]
  let maxDD = 0
  for (const pnl of pnls) {
    if (pnl > peak) peak = pnl
    const dd = peak - pnl
    if (dd > maxDD) maxDD = dd
  }

  let ups = 0
  for (let i = 1; i < pnls.length; i++) {
    if (pnls[i] > pnls[i - 1]) ups++
  }
  const winRate = (ups / (pnls.length - 1)) * 100

  const returns = pnls.slice(1).map((p, i) => p - pnls[i])
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
  const std = Math.sqrt(variance)
  const sharpe = std === 0 ? 0 : mean / std

  return { sharpe, maxDrawdownPct: maxDD, winRate }
}

async function snapshotAndRank({ db, factory, league, agents, priceMap }) {
  const valuations = []
  for (const agentDoc of agents) {
    const state = await readAgentState(factory, agentDoc.agent_id)
    const value = valueAgent(state.agent.cashUsd, state.positions, priceMap)
    const initialUsd = BigInt(agentDoc.deposit_usd || "0")
    valuations.push({ agentDoc, ...value, initialUsd })
  }

  valuations.sort((a, b) => (a.totalUsd < b.totalUsd ? 1 : a.totalUsd > b.totalUsd ? -1 : 0))

  for (let i = 0; i < valuations.length; i++) {
    const entry = valuations[i]
    const roiPct = percentChangeScaled(entry.totalUsd, entry.initialUsd)
    const [tradeCount, metrics] = await Promise.all([
      db.collection("tradelogs").countDocuments({
        agent_id: entry.agentDoc.agent_id,
        action: { $in: ["buy", "sell"] },
        success: true,
      }),
      computeAgentMetrics(db, entry.agentDoc.agent_id, league.chain_id_hex, roiPct),
    ])
    await db.collection("agents").updateOne(
      { agent_id: entry.agentDoc.agent_id },
      {
        $set: {
          current_rank: i + 1,
          "performance.roi_pct": roiPct,
          "performance.trade_count": tradeCount,
          "performance.sharpe_ratio": metrics.sharpe,
          "performance.max_drawdown_pct": metrics.maxDrawdownPct,
          "performance.win_rate": metrics.winRate,
        },
        $push: { rank_history: { timestamp: new Date(), rank: i + 1, roi_pct: roiPct } },
      },
    )
    await db.collection("agentvaluesnapshots").insertOne({
      agent_id: entry.agentDoc.agent_id,
      league_chain_id_hex: league.chain_id_hex,
      timestamp: new Date(),
      cash_usd: entry.cashUsd.toString(),
      position_value_usd: entry.positionUsd.toString(),
      total_value_usd: entry.totalUsd.toString(),
      pnl_pct: roiPct,
      snapshot_kind: "chaos_tick",
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

  return valuations.map((v, index) => ({
    rank: index + 1,
    agentId: v.agentDoc.agent_id,
    name: v.agentDoc.name,
    totalUsd: scaledToUsd(v.totalUsd),
    pnlUsd: scaledToUsd(v.totalUsd) - scaledToUsd(v.initialUsd),
    roiPct: percentChangeScaled(v.totalUsd, v.initialUsd),
  }))
}

async function runForLeague({ db, factory, router, ownerWallet, executorWallet, league }) {
  const agents = await db.collection("agents").find({
    leagues: league.chain_id_hex,
    status: { $in: ["registered", "active"] },
  }).toArray()

  if (agents.length === 0) {
    console.log(`[chaos] league "${league.name}" — no active agents, skipping`)
    return
  }

  const wipeMins = Number(process.env.CHAOS_WIPE_RECENT_SNAPSHOTS_MINS || 0)
  if (wipeMins > 0) {
    const cutoff = new Date(Date.now() - wipeMins * 60_000)
    const { deletedCount } = await db.collection("agentvaluesnapshots").deleteMany({
      league_chain_id_hex: league.chain_id_hex,
      snapshot_kind: "chaos_tick",
      timestamp: { $gte: cutoff },
    })
    console.log(`[chaos] league "${league.name}" — wiped ${deletedCount} recent chaos_tick snapshots (last ${wipeMins}m)`)
  }

  const tokenDocsBefore = await db.collection("tokenregistries").find({ symbol: { $in: league.asset_universe } }).toArray()
  const priceMapBefore = Object.fromEntries(tokenDocsBefore.map((token) => [token.symbol, Number(token.current_price_usd)]))
  const { trades, tokenFates } = await executeRandomTrades({ db, factory, executorWallet, league, agents, priceMap: priceMapBefore })
  const reprices = await repriceTokens({ db, router, ownerWallet, league, tokenFates })
  const tokenDocsAfter = await db.collection("tokenregistries").find({ symbol: { $in: league.asset_universe } }).toArray()
  const priceMapAfter = Object.fromEntries(tokenDocsAfter.map((token) => [token.symbol, Number(token.current_price_usd)]))
  const ranks = await snapshotAndRank({ db, factory, league, agents, priceMap: priceMapAfter })

  const stamp = new Date().toISOString()
  console.log(`[chaos ${stamp}] league="${league.name}" agents=${agents.length} trades=${trades.length} repriced=${reprices.length}`)
  for (const r of reprices) {
    console.log(`  price ${r.symbol.padEnd(5)} ${r.from} -> ${r.to} (${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(1)}%, ${r.fate})`)
  }
  for (const t of trades) {
    console.log(`  trade agent=${t.agentId} ${t.name} ${t.action} ${t.symbol} qty=${t.qty} fate=${t.fate} ok=${t.success} tx=${shortHash(t.txHash)}`)
  }
  console.log(`  ranks for "${league.name}":`)
  for (const r of ranks) {
    console.log(`    #${r.rank} ${r.name}: total=$${r.totalUsd.toFixed(2)} pnl=$${r.pnlUsd.toFixed(2)} roi=${r.roiPct.toFixed(4)}%`)
  }
}

async function runOnce() {
  const db = await connectMongo()
  const chainId = Number(process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || 16602)
  const rpcUrl = required("RPC_URL", process.env.NEXT_PUBLIC_RPC_URL)
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId)
  const ownerWallet = new ethers.Wallet(required("PRIVATE_KEY"), provider)
  const executorWallet = new ethers.Wallet(required("EXECUTOR_PRIVATE_KEY"), provider)
  const factory = new ethers.Contract(required("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS"), FACTORY_ABI, executorWallet)
  const router = new ethers.Contract(required("SANDBOX_ROUTER_ADDRESS"), ROUTER_ABI, ownerWallet)

  // Fetch all active leagues (optionally filtered by CHAOS_LEAGUE_NAME for debugging)
  const leagueFilter = { status: "active" }
  if (process.env.CHAOS_LEAGUE_NAME) leagueFilter.name = process.env.CHAOS_LEAGUE_NAME
  const leagues = await db.collection("leagues").find(leagueFilter).toArray()

  if (leagues.length === 0) {
    console.warn(`[chaos] no active leagues found — nothing to do`)
    return
  }

  console.log(`[chaos] running across ${leagues.length} active league(s): ${leagues.map((l) => l.name).join(", ")}`)

  for (const league of leagues) {
    await runForLeague({ db, factory, router, ownerWallet, executorWallet, league })
  }
}

if (LOOP) {
  console.log(`[chaos] loop mode every ${LOOP_MS}ms across all active leagues`)
  while (true) {
    await runOnce().catch((error) => {
      console.error(`[chaos] ${error?.stack || error}`)
    })
    await sleep(LOOP_MS)
  }
} else {
  try {
    await runOnce()
    process.exit(0)
  } catch (error) {
    console.error(`[chaos] ${error?.stack || error}`)
    process.exit(1)
  }
}
