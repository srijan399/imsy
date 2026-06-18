#!/usr/bin/env node
// Fire one reprice tick against /api/engine/reprice-tick.
//
// Twin of engine-tick.mjs. Drives the random-walk price oracle that updates
// IMSYSandboxRouter prices for every registered token (skipping pegged sUSD /
// USDC). Every active league gets a fresh AgentValueSnapshot row so the live
// PnL chart updates between engine ticks.
//
// Env:
//   REPRICE_TICK_URL          default http://localhost:3000/api/engine/reprice-tick
//   ADMIN_API_TOKEN           required
//   REPRICE_TICK_TIMEOUT_MS   default 600000 (10 min — sandbox setUsdPrice writes can be slow)
//   REPRICE_TICK_LOOP_MS      default 300000 (5 minutes interval for visible drama)
//
// Usage:
//   bun run reprice                    # one-shot
//   bun run reprice:loop               # local loop (5 min default)
//   crontab: */1 * * * * cd <client> && ADMIN_API_TOKEN=xxx /usr/local/bin/node scripts/reprice-tick.mjs

import { setTimeout as sleep } from "node:timers/promises"

const URL = process.env.REPRICE_TICK_URL || "http://localhost:3000/api/engine/reprice-tick"
const TOKEN = process.env.ADMIN_API_TOKEN
const TIMEOUT_MS = Number(process.env.REPRICE_TICK_TIMEOUT_MS || 600_000)
const LOOP = process.argv.includes("--loop")
const LOOP_INTERVAL_MS = Number(process.env.REPRICE_TICK_LOOP_MS || 300 * 1000)

if (!TOKEN) {
  console.error("[reprice-tick] ADMIN_API_TOKEN env var is required")
  process.exit(2)
}

async function fireOnce() {
  const startedAt = Date.now()
  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let response
  try {
    response = await fetch(URL, {
      method: "POST",
      headers: { "x-admin-token": TOKEN, "content-type": "application/json" },
      body: "{}",
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(abortTimer)
    console.error(`[reprice-tick] transport error: ${error?.message ?? error}`)
    return { ok: false, code: 1 }
  }
  clearTimeout(abortTimer)

  let body
  try {
    body = await response.json()
  } catch {
    body = { raw: await response.text().catch(() => "") }
  }

  const elapsed = Date.now() - startedAt
  const stamp = new Date().toISOString()

  if (response.status === 409) {
    console.log(`[reprice-tick ${stamp}] 409 already running. ${elapsed}ms`)
    return { ok: true, code: 0 }
  }

  if (!response.ok) {
    console.error(`[reprice-tick ${stamp}] HTTP ${response.status}: ${JSON.stringify(body)}`)
    return { ok: false, code: 1 }
  }

  const updates = Array.isArray(body?.prices) ? body.prices.length : 0
  console.log(
    `[reprice-tick ${stamp}] ok ${elapsed}ms · tokens=${body?.tokens_updated ?? 0} updated=${updates} leagues=${body?.leagues_resnapshotted ?? 0}`,
  )
  return { ok: true, code: 0 }
}

if (LOOP) {
  console.log(`[reprice-tick] loop mode every ${LOOP_INTERVAL_MS}ms targeting ${URL}`)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await fireOnce()
    await sleep(LOOP_INTERVAL_MS)
  }
} else {
  const result = await fireOnce()
  process.exit(result.code)
}
