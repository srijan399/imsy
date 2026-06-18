#!/usr/bin/env node
/**
 * normalize-leaderboard.mjs
 *
 * One-shot demo normalization: bring all agent ROIs into a believable ±100% band.
 *
 * Per agent (by current rank order):
 *   1. Sell all existing on-chain positions at current price
 *   2. Buy SACRIFICE_TOKEN with the excess USD above target value
 *   3. Rug SACRIFICE_TOKEN price on-chain + Mongo
 *   4. Sell sacrifice bags at rug price (clears positions, leaves ~target cash)
 *   5. Write smooth 2-hour snapshot history ending at actual post-rug ROI
 *   6. Update agent rank + performance metrics
 *
 * Usage: bun run normalize
 * Env:   same as chaos-market.mjs
 */

import "dotenv/config"
import dotenv from "dotenv"
import mongoose from "mongoose"
import { ethers } from "ethers"
import { setTimeout as sleep } from "node:timers/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, "..", ".env.local") })

// ─── config ───────────────────────────────────────────────────────────────────

const SCALE = 10n ** 18n
const LEAGUE_NAME = process.env.CHAOS_LEAGUE_NAME || "High Risk League"

// Target ROIs applied to agents sorted by current rank (rank 1 = index 0).
// Extend or trim to match actual agent count.
const TARGET_ROIS_BY_RANK = [82, 57, 33, 9, -19, -41]

// Token used to "burn" excess value: pumped to a buy base, then rugged.
const SACRIFICE_TOKEN    = "PEPE"
const SACRIFICE_BUY_PRICE = 0.001       // $0.001 — agent buys sacrifice at this price
const SACRIFICE_RUG_PRICE = 0.0000001   // $0.0000001 — 10000x rug, bags worth ~$0

// Smooth history settings
const HISTORY_WINDOW_MS = 2 * 60 * 60 * 1000  // 2 hours
const HISTORY_POINTS    = 42                    // ~3 min apart

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const FACTORY_ABI = [
  "function executeTrade(uint256 agentId,uint8 action,bytes32 asset,uint256 qty,uint256 priceUsd,bytes32 reasonHash) returns (bool)",
  "function getAgent(uint256 agentId) view returns (tuple(address owner,string name,bytes32 strategyRoot,bool exists,uint256 cashUsd,uint256 tradeCount,uint64 createdAt))",
  "function getAgentAssets(uint256 agentId) view returns (bytes32[])",
  "function getAgentPosition(uint256 agentId,bytes32 asset) view returns (uint256 qty,uint256 avgPriceUsd)",
  "event TradeExecuted(uint256 indexed agentId,uint256 indexed tradeId,uint8 action,bytes32 asset,uint256 qty,uint256 priceUsd,bool success,bool simulated,bytes32 reasonHash)",
]
const ROUTER_ABI = ["function setUsdPrice(bytes32 symbol,uint256 priceUsd)"]

// ─── helpers ──────────────────────────────────────────────────────────────────

function required(name, fallback) {
  const v = process.env[name] || fallback
  if (!v) throw new Error(`${name} is required`)
  return v
}

function usdToScaled(usd) {
  if (!Number.isFinite(usd) || usd <= 0) return 0n
  const s = usd.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 18 })
  if (!/^\d+(\.\d+)?$/.test(s)) return 0n
  const [whole, fraction = ""] = s.split(".")
  return BigInt(whole) * SCALE + BigInt(`${fraction}${"0".repeat(18)}`.slice(0, 18))
}

function scaledToUsd(value) {
  return Number(BigInt(value || 0) / 10n ** 12n) / 1_000_000
}

function qtyToScaled(qty) {
  if (!Number.isFinite(qty) || qty <= 0) return 0n
  const s = qty.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 0 })
  if (!/^\d+$/.test(s)) return 0n
  return BigInt(s) * SCALE
}

function symbolToBytes32(sym) { return ethers.encodeBytes32String(sym) }
function bytes32ToSymbol(v)   { return ethers.decodeBytes32String(v) }

function percentChange(current, initial) {
  if (initial === 0n) return 0
  return Number(((current - initial) * 1_000_000n) / initial) / 10_000
}

async function sendWithNonce(wallet, fn, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const nonce = await wallet.provider.getTransactionCount(wallet.address, "pending")
      const tx = await fn(nonce)
      const receipt = await tx.wait()
      return { tx, receipt }
    } catch (err) {
      const msg = String(err?.message || err)
      if (!/nonce too low|nonce has already been used|NONCE_EXPIRED|replacement.*underpriced|replacement fee too low|REPLACEMENT_UNDERPRICED/i.test(msg)) throw err
      console.warn(`  [retry] ${label} nonce race (attempt ${attempt + 1}/3)`)
      await sleep(800 * (attempt + 1))
    }
  }
  throw new Error(`${label}: nonce retries exhausted`)
}

async function readAgentState(factory, agentId) {
  const agent = await factory.getAgent(agentId)
  const assetBytes = await factory.getAgentAssets(agentId)
  const positions = []
  for (const asset of assetBytes) {
    const symbol = bytes32ToSymbol(asset)
    const [qty] = await factory.getAgentPosition(agentId, asset)
    if (qty > 0n) positions.push({ symbol, qty })
  }
  return { agent, positions }
}

async function doTrade(factory, executorWallet, agentId, action, symbol, qtyScaled, priceScaled) {
  if (qtyScaled <= 0n || priceScaled <= 0n) return false
  const reasonHash = ethers.id(`normalize-${agentId}-${symbol}-${Date.now()}-${Math.random()}`)
  const actionCode = action === "buy" ? 0 : 1
  let success = false
  try {
    const { receipt } = await sendWithNonce(
      executorWallet,
      (nonce) => factory.executeTrade(BigInt(agentId), actionCode, symbolToBytes32(symbol), qtyScaled, priceScaled, reasonHash, { nonce }),
      `${action} ${symbol} agent${agentId}`,
    )
    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog({ topics: log.topics, data: log.data })
        if (parsed?.name === "TradeExecuted") success = Boolean(parsed.args.success)
      } catch {}
    }
  } catch (err) {
    console.warn(`  [warn] ${action} ${symbol} agent${agentId}: ${err?.message || err}`)
  }
  return success
}

async function setPrice(db, router, ownerWallet, symbol, price) {
  await sendWithNonce(
    ownerWallet,
    (nonce) => router.setUsdPrice(symbolToBytes32(symbol), usdToScaled(price), { nonce }),
    `setUsdPrice ${symbol}`,
  )
  await db.collection("tokenregistries").updateOne(
    { symbol },
    { $set: { current_price_usd: price, last_updated: new Date() } },
  )
}

// Guided random walk from ~0 to targetRoi over numPoints steps
function generatePath(targetRoi, numPoints) {
  let cur = (Math.random() - 0.5) * 6  // start ±3% around 0
  const path = [cur]
  for (let i = 1; i < numPoints; i++) {
    const progress = i / (numPoints - 1)
    const ease = progress * progress * (3 - 2 * progress)  // smooth-step
    const guide = targetRoi * ease
    const bias  = (guide - cur) * 0.28
    const noise = (Math.random() - 0.5) * 12              // ±6% per step
    const drama = Math.random() < 0.09 ? (Math.random() - 0.5) * 28 : 0  // occasional ±14% spike
    cur = cur + bias + noise + drama
    path.push(cur)
  }
  path[numPoints - 1] = targetRoi  // exact end
  return path
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function run() {
  // Connect
  await mongoose.connect(required("MONGODB_URI"), { dbName: process.env.MONGODB_DB, bufferCommands: false })
  const db = mongoose.connection.db

  const chainId = Number(process.env.CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID || 16602)
  const provider = new ethers.JsonRpcProvider(required("RPC_URL", process.env.NEXT_PUBLIC_RPC_URL), chainId)
  const ownerWallet    = new ethers.Wallet(required("PRIVATE_KEY"), provider)
  const executorWallet = new ethers.Wallet(required("EXECUTOR_PRIVATE_KEY"), provider)
  const factory = new ethers.Contract(required("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS"), FACTORY_ABI, executorWallet)
  const router  = new ethers.Contract(required("SANDBOX_ROUTER_ADDRESS"), ROUTER_ABI, ownerWallet)

  const league = await db.collection("leagues").findOne({ name: LEAGUE_NAME, status: "active" })
  if (!league) throw new Error(`No active league: ${LEAGUE_NAME}`)

  const agents = await db.collection("agents")
    .find({ leagues: league.chain_id_hex, status: { $in: ["registered", "active"] } })
    .sort({ current_rank: 1 })
    .toArray()
  if (agents.length === 0) throw new Error("No agents found")

  console.log(`[normalize] ${agents.length} agents in "${LEAGUE_NAME}"`)
  console.log(`[normalize] targets: ${TARGET_ROIS_BY_RANK.slice(0, agents.length).map((r, i) => `#${i + 1}=${r > 0 ? "+" : ""}${r}%`).join("  ")}`)

  // Read current token prices
  const tokenDocs = await db.collection("tokenregistries").find({ symbol: { $in: league.asset_universe } }).toArray()
  const priceMap = Object.fromEntries(tokenDocs.map((t) => [t.symbol, Number(t.current_price_usd)]))

  // ── Phase 1: Pump sacrifice token to buy base ─────────────────────────────
  console.log(`\n[phase 1] pump ${SACRIFICE_TOKEN} → $${SACRIFICE_BUY_PRICE} for sacrifice buys`)
  await setPrice(db, router, ownerWallet, SACRIFICE_TOKEN, SACRIFICE_BUY_PRICE)
  priceMap[SACRIFICE_TOKEN] = SACRIFICE_BUY_PRICE

  // ── Phase 2: Liquidate all positions + buy sacrifice ──────────────────────
  console.log("\n[phase 2] liquidate positions + buy sacrifice per agent")
  for (let rankIdx = 0; rankIdx < agents.length; rankIdx++) {
    const agentDoc    = agents[rankIdx]
    const targetRoi   = TARGET_ROIS_BY_RANK[rankIdx] ?? 0
    const depositBig  = BigInt(agentDoc.deposit_usd || "0")
    const initialUsd  = scaledToUsd(depositBig)
    const targetUsd   = initialUsd * (1 + targetRoi / 100)

    console.log(`\n  agent #${rankIdx + 1} "${agentDoc.name}" (id=${agentDoc.agent_id})`)
    console.log(`    initial=$${initialUsd.toFixed(0)}  target ROI=${targetRoi >= 0 ? "+" : ""}${targetRoi}%  target total=$${targetUsd.toFixed(0)}`)

    // Sell all current positions
    let { agent, positions } = await readAgentState(factory, agentDoc.agent_id)
    if (positions.length > 0) {
      for (const pos of positions) {
        const price = priceMap[pos.symbol]
        if (!price) { console.warn(`    [skip] no price for ${pos.symbol}`); continue }
        const ok = await doTrade(factory, executorWallet, agentDoc.agent_id, "sell", pos.symbol, pos.qty, usdToScaled(price))
        console.log(`    sell ${pos.symbol}: ok=${ok}`)
        await sleep(200)
      }
      await sleep(400)
      const refreshed = await readAgentState(factory, agentDoc.agent_id)
      agent = refreshed.agent
    }

    const cashUsd = scaledToUsd(agent.cashUsd)
    console.log(`    cash after liquidation: $${cashUsd.toFixed(2)}`)

    const excess = cashUsd - targetUsd
    if (excess > 1) {
      // Buy whole sacrifice tokens with the excess
      const qty = Math.floor(excess / SACRIFICE_BUY_PRICE)
      if (qty > 0) {
        console.log(`    buying ${qty.toLocaleString()} ${SACRIFICE_TOKEN} @ $${SACRIFICE_BUY_PRICE} (burning $${excess.toFixed(2)} excess)`)
        const ok = await doTrade(factory, executorWallet, agentDoc.agent_id, "buy", SACRIFICE_TOKEN, qtyToScaled(qty), usdToScaled(SACRIFICE_BUY_PRICE))
        console.log(`    sacrifice buy: ok=${ok}`)
      }
    } else {
      console.log(`    no excess — agent already at/below target`)
    }
  }

  // ── Phase 3: Rug the sacrifice token ─────────────────────────────────────
  console.log(`\n[phase 3] rug ${SACRIFICE_TOKEN} → $${SACRIFICE_RUG_PRICE}`)
  await setPrice(db, router, ownerWallet, SACRIFICE_TOKEN, SACRIFICE_RUG_PRICE)
  priceMap[SACRIFICE_TOKEN] = SACRIFICE_RUG_PRICE

  // ── Phase 4: Sell sacrifice bags + compute final on-chain state ───────────
  console.log("\n[phase 4] sell sacrifice bags + compute final valuations")
  const rankingData = []
  for (const agentDoc of agents) {
    const { agent, positions } = await readAgentState(factory, agentDoc.agent_id)

    // Sell sacrifice bags at rug price
    const bag = positions.find((p) => p.symbol === SACRIFICE_TOKEN)
    if (bag && bag.qty > 0n) {
      const ok = await doTrade(factory, executorWallet, agentDoc.agent_id, "sell", SACRIFICE_TOKEN, bag.qty, usdToScaled(SACRIFICE_RUG_PRICE))
      console.log(`  "${agentDoc.name}": sold ${SACRIFICE_TOKEN} bag ok=${ok}`)
      await sleep(300)
    }

    // Read final state
    const final = await readAgentState(factory, agentDoc.agent_id)
    let positionUsd = 0n
    for (const pos of final.positions) {
      const price = priceMap[pos.symbol]
      if (!price) continue
      positionUsd += (pos.qty * usdToScaled(price)) / SCALE
    }
    const cashUsdBig = BigInt(final.agent.cashUsd)
    const totalUsd   = cashUsdBig + positionUsd
    const depositBig = BigInt(agentDoc.deposit_usd || "0")
    const actualRoi  = percentChange(totalUsd, depositBig)

    console.log(`  "${agentDoc.name}": total=$${scaledToUsd(totalUsd).toFixed(2)}  roi=${actualRoi >= 0 ? "+" : ""}${actualRoi.toFixed(2)}%`)
    rankingData.push({ agentDoc, totalUsd, depositBig, actualRoi, cashUsdBig, positionUsd })
  }

  // Sort by total value desc
  rankingData.sort((a, b) => (a.totalUsd < b.totalUsd ? 1 : a.totalUsd > b.totalUsd ? -1 : 0))

  // ── Phase 5: Wipe recent snapshots + write smooth history ──────────────────
  const wipeFrom = new Date(Date.now() - 8 * 60 * 60 * 1000)  // last 8 hours
  const { deletedCount } = await db.collection("agentvaluesnapshots").deleteMany({
    league_chain_id_hex: league.chain_id_hex,
    timestamp: { $gte: wipeFrom },
  })
  console.log(`\n[phase 5] wiped ${deletedCount} recent snapshots`)

  const now      = Date.now()
  const startTs  = now - HISTORY_WINDOW_MS

  for (const entry of rankingData) {
    const path = generatePath(entry.actualRoi, HISTORY_POINTS)
    const toInsert = path.map((pnlPct, i) => {
      const ts = new Date(startTs + (i / (HISTORY_POINTS - 1)) * HISTORY_WINDOW_MS)
      // Approximate USD values from pnl_pct (historical snapshots are illustrative)
      const factor = BigInt(Math.round(Math.abs(pnlPct) * 1000))
      const pnlBig = pnlPct >= 0
        ? (entry.depositBig * factor) / 100_000n
        : -((entry.depositBig * factor) / 100_000n)
      const approxTotal = entry.depositBig + pnlBig
      const safeTotalBig = approxTotal > 0n ? approxTotal : 1n
      return {
        agent_id: entry.agentDoc.agent_id,
        league_chain_id_hex: league.chain_id_hex,
        timestamp: ts,
        cash_usd: entry.cashUsdBig.toString(),
        position_value_usd: entry.positionUsd.toString(),
        total_value_usd: safeTotalBig.toString(),
        pnl_pct: pnlPct,
        snapshot_kind: "chaos_tick",
        created_at: ts,
        updated_at: ts,
      }
    })
    await db.collection("agentvaluesnapshots").insertMany(toInsert)
    console.log(`  "${entry.agentDoc.name}": wrote ${toInsert.length} history pts → end ${entry.actualRoi >= 0 ? "+" : ""}${entry.actualRoi.toFixed(2)}%`)
  }

  // Write accurate final snapshot from actual on-chain values
  for (const entry of rankingData) {
    await db.collection("agentvaluesnapshots").insertOne({
      agent_id: entry.agentDoc.agent_id,
      league_chain_id_hex: league.chain_id_hex,
      timestamp: new Date(),
      cash_usd: entry.cashUsdBig.toString(),
      position_value_usd: entry.positionUsd.toString(),
      total_value_usd: entry.totalUsd.toString(),
      pnl_pct: entry.actualRoi,
      snapshot_kind: "chaos_tick",
      created_at: new Date(),
      updated_at: new Date(),
    })
  }

  // ── Phase 6: Re-rank agents + update performance metrics ─────────────────
  console.log("\n[phase 6] updating ranks + performance metrics")

  for (let i = 0; i < rankingData.length; i++) {
    const entry = rankingData[i]

    const tradeCount = await db.collection("tradelogs").countDocuments({
      agent_id: entry.agentDoc.agent_id,
      action: { $in: ["buy", "sell"] },
      success: true,
    })

    // Compute metrics from the smooth history we just wrote
    const snaps = await db.collection("agentvaluesnapshots")
      .find({ agent_id: entry.agentDoc.agent_id, league_chain_id_hex: league.chain_id_hex })
      .sort({ timestamp: 1 })
      .project({ pnl_pct: 1 })
      .toArray()
    const pnls = snaps.map((s) => s.pnl_pct)

    let peak = pnls[0] ?? 0, maxDD = 0, ups = 0
    for (const pnl of pnls) {
      if (pnl > peak) peak = pnl
      const dd = peak - pnl
      if (dd > maxDD) maxDD = dd
    }
    for (let j = 1; j < pnls.length; j++) if (pnls[j] > pnls[j - 1]) ups++
    const winRate = pnls.length > 1 ? (ups / (pnls.length - 1)) * 100 : 0
    const returns = pnls.slice(1).map((p, j) => p - pnls[j])
    const mean     = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
    const variance = returns.length ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length : 0
    const std      = Math.sqrt(variance)
    const sharpe   = std === 0 ? 0 : mean / std

    await db.collection("agents").updateOne(
      { agent_id: entry.agentDoc.agent_id },
      {
        $set: {
          current_rank: i + 1,
          "performance.roi_pct":        entry.actualRoi,
          "performance.trade_count":    tradeCount,
          "performance.sharpe_ratio":   sharpe,
          "performance.max_drawdown_pct": maxDD,
          "performance.win_rate":       winRate,
        },
        $push: { rank_history: { timestamp: new Date(), rank: i + 1, roi_pct: entry.actualRoi } },
      },
    )

    const sign = (n) => n >= 0 ? "+" : ""
    console.log(`  #${i + 1} "${entry.agentDoc.name}": roi=${sign(entry.actualRoi)}${entry.actualRoi.toFixed(2)}%  sharpe=${sharpe.toFixed(2)}  dd=${maxDD.toFixed(1)}%  wr=${winRate.toFixed(0)}%  trades=${tradeCount}`)
  }

  console.log("\n[normalize] ✓ done")
  console.log("  Chart will show smooth 2h history ending at the normalized ROIs.")
  console.log("  Run 'bun run chaos:loop' to continue with bounded movements.")
}

run()
  .catch((err) => { console.error(`[normalize] ${err?.stack || err}`); process.exit(1) })
  .finally(() => mongoose.disconnect())
