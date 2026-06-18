#!/usr/bin/env node
// Fire one engine tick against /api/engine/tick.
//
// Designed to be a single-shot script you can run from any cron — local crontab,
// `watch`, GitHub Actions, cronjob.org, etc. It reads:
//
//   ENGINE_TICK_URL    Full URL of the tick endpoint.
//                      Default: http://localhost:3000/api/engine/tick
//   ADMIN_API_TOKEN    Same token the Next server reads. Required.
//   ENGINE_TICK_TIMEOUT_MS
//                      Optional fetch timeout. Default: 600000 (10 min).
//
// Exit code: 0 on { status: "tick_complete" } or 409 (already running). Non-zero
// on transport / auth / server failure so cron drivers can alert.
//
// Usage:
//   bun run tick                       # one-shot
//   bun run tick:loop                  # local 10-minute loop (sleeps between)
//   crontab -e
//     */10 * * * * cd /path/to/imsy/client && /usr/local/bin/node scripts/engine-tick.mjs >> /tmp/imsy-tick.log 2>&1

import { setTimeout as sleep } from "node:timers/promises"

const URL = process.env.ENGINE_TICK_URL || "http://localhost:3000/api/engine/tick"
const TOKEN = process.env.ADMIN_API_TOKEN
const TIMEOUT_MS = Number(process.env.ENGINE_TICK_TIMEOUT_MS || 600_000)
const LOOP = process.argv.includes("--loop")
const LOOP_INTERVAL_MS = Number(process.env.ENGINE_TICK_LOOP_MS || 10 * 60 * 1000)

if (!TOKEN) {
  console.error("[engine-tick] ADMIN_API_TOKEN env var is required")
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
    console.error(`[engine-tick] transport error: ${error?.message ?? error}`)
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
    console.log(`[engine-tick ${stamp}] 409 already running (lock held). ${elapsed}ms`)
    return { ok: true, code: 0 }
  }

  if (!response.ok) {
    console.error(`[engine-tick ${stamp}] HTTP ${response.status}: ${JSON.stringify(body)}`)
    return { ok: false, code: 1 }
  }

  const totals = body?.totals ?? {}
  console.log(
    `[engine-tick ${stamp}] ok ${elapsed}ms · agents=${totals.agents_processed ?? 0} trades=${totals.trades_executed ?? 0} failures=${totals.trades_failed ?? 0}`,
  )
  return { ok: true, code: 0 }
}

if (LOOP) {
  console.log(`[engine-tick] loop mode every ${LOOP_INTERVAL_MS}ms targeting ${URL}`)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await fireOnce()
    await sleep(LOOP_INTERVAL_MS)
  }
} else {
  const result = await fireOnce()
  process.exit(result.code)
}
