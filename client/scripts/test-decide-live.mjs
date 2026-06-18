#!/usr/bin/env node
// End-to-end smoke test of the trader decide pipeline against the LIVE 0G
// Compute provider. Builds a dummy AgentSnapshot, sends the real
// TRADER_SYSTEM_PROMPT + user payload, runs the response through the same
// parseUntilJson + zod schema the engine uses, and prints what the engine
// would do.
//
// Run:
//   bun run test:decide-live
//
// Requires `.env.local` to contain at minimum:
//   ZG_COMPUTE_API_KEY    (app-sk-...)
//   ZG_COMPUTE_BASE_URL
//   ZG_COMPUTE_MODEL
//
// Optional flags:
//   --runs=N        repeat N times to estimate parse-success rate (default 1)
//   --temp=0.0      override temperature (default 0.2)

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { ALL, parseJSON } from "partial-json"
import { z } from "zod"

const here = dirname(fileURLToPath(import.meta.url))
const envPath = join(here, "..", ".env.local")
loadDotenv(envPath)

const argv = process.argv.slice(2)
const runs = Number(parseFlag("--runs", "1"))
const temperature = Number(parseFlag("--temp", "0.2"))

const COMPUTE_BASE_URL = (process.env.ZG_COMPUTE_BASE_URL ?? "").replace(/\/$/, "")
const COMPUTE_MODEL = process.env.ZG_COMPUTE_MODEL ?? "qwen/qwen-2.5-7b-instruct"
const COMPUTE_API_KEY = process.env.ZG_COMPUTE_API_KEY ?? ""
const VERIFY_TEE = (process.env.ZG_COMPUTE_VERIFY_TEE ?? "true") === "true"

if (!COMPUTE_BASE_URL || !COMPUTE_API_KEY) {
  console.error("[test-decide-live] ZG_COMPUTE_BASE_URL and ZG_COMPUTE_API_KEY required")
  process.exit(2)
}
if (!COMPUTE_API_KEY.startsWith("app-sk-")) {
  console.error("[test-decide-live] ZG_COMPUTE_API_KEY must be an app-sk-... token")
  process.exit(2)
}

// ── Read the real system prompt so we test what the engine actually sends ───
const promptModulePath = join(here, "..", "lib", "0g", "prompts.ts")
const promptSrc = readFileSync(promptModulePath, "utf8")
const promptMatch = promptSrc.match(/`([\s\S]*?)`/)
if (!promptMatch) {
  console.error("[test-decide-live] could not extract TRADER_SYSTEM_PROMPT from prompts.ts")
  process.exit(2)
}
const TRADER_SYSTEM_PROMPT = promptMatch[1].trim()

// ── parseUntilJson (mirror of client/lib/utils/parse-json.ts) ───────────────
function parseUntilJson(jsonstr) {
  let jsonRes = jsonstr
  if (typeof jsonRes !== "string") return {}
  jsonRes = jsonRes.replaceAll("\n", "")
  if (jsonRes.startsWith("```json")) jsonRes = jsonRes.replace("```json", "")
  if (jsonRes.startsWith("`") || jsonRes.endsWith("`")) jsonRes = jsonRes.replaceAll("```", "")
  try {
    const properly = JSON.parse(jsonRes)
    if (typeof properly === "object" && properly !== null) return properly
    jsonRes = properly
  } catch {}
  if (typeof jsonRes !== "string") return {}
  const c = jsonRes.indexOf("{") === -1 ? jsonRes.length : jsonRes.indexOf("{")
  const s = jsonRes.indexOf("[") === -1 ? jsonRes.length : jsonRes.indexOf("[")
  jsonRes = jsonRes.slice(Math.min(c, s))
  if (jsonRes.startsWith("```json")) jsonRes = jsonRes.replace("```json", "")
  if (jsonRes.startsWith("`") || jsonRes.endsWith("`")) jsonRes = jsonRes.replaceAll("```", "")
  jsonRes = jsonRes.replaceAll("{\\n", "{").replaceAll("\\n}", "}")
  try {
    let guard = 0
    while (typeof jsonRes === "string" && guard < 4) {
      jsonRes = parseJSON(jsonRes, ALL)
      guard += 1
    }
    return typeof jsonRes === "object" && jsonRes !== null ? jsonRes : {}
  } catch {
    return {}
  }
}

// ── decisionSchema (mirror of client/lib/engine/decide.ts) ──────────────────
const decisionSchema = z.object({
  action: z.enum(["buy", "sell", "hold"]),
  asset: z.string().min(1),
  quantity: z.number().nonnegative(),
  limit_price_usd: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400),
})

// ── Dummy AgentSnapshot ─────────────────────────────────────────────────────
const dummySnapshot = {
  strategy: {
    description: "Momentum on majors with 24h-change > 2% triggers buys; trim above max_position_size_pct",
    risk_profile: { max_drawdown_pct: 20, max_position_size_pct: 30, leverage_cap: 1 },
    allowed_signals: ["momentum", "RSI"],
  },
  league: {
    name: "High Risk",
    asset_universe: ["BTC", "ETH", "SOL"],
    max_drawdown_pct: 25,
    max_leverage: 1,
    allowed_signals: ["momentum", "RSI"],
  },
  portfolio: {
    cashWei: "1000000000000000000", // 1 0G
    totalValueWei: "1000000000000000000",
    positions: [],
  },
  prices: {
    BTC: { usd: 61250.5, change_24h_pct: 3.1, source: "coingecko", as_of: new Date().toISOString() },
    ETH: { usd: 3210.0, change_24h_pct: -0.8, source: "coingecko", as_of: new Date().toISOString() },
    SOL: { usd: 172.4, change_24h_pct: 4.5, source: "coingecko", as_of: new Date().toISOString() },
  },
  recent_trades: [],
  now_iso: new Date().toISOString(),
}

// ── Live call ───────────────────────────────────────────────────────────────
async function callCompute() {
  const url = `${COMPUTE_BASE_URL}/chat/completions`
  const body = {
    model: COMPUTE_MODEL,
    messages: [
      { role: "system", content: TRADER_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(dummySnapshot) },
    ],
    max_tokens: 512,
    temperature,
    stream: false,
    verify_tee: VERIFY_TEE,
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${COMPUTE_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`compute HTTP ${res.status}: ${text.slice(0, 200)}`)
  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`compute returned non-JSON envelope: ${text.slice(0, 200)}`)
  }
  const content =
    normalize(json.choices?.[0]?.message?.content) ||
    json.choices?.[0]?.text ||
    normalize(json.content) ||
    json.output_text ||
    ""
  const teeVerified = Boolean(
    json.trace?.tee_verified ?? json.choices?.[0]?.trace?.tee_verified ?? json.tee_verified,
  )
  return { content: content.trim(), teeVerified, responseId: json.id ?? null }
}

function normalize(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => (typeof part === "string" ? part : part?.text ?? ""))
    .join("")
}

// ── Run ─────────────────────────────────────────────────────────────────────
let parsedOk = 0
let schemaOk = 0
let failed = 0

console.log(`[test-decide-live] runs=${runs} model=${COMPUTE_MODEL} temp=${temperature} tee=${VERIFY_TEE}`)
console.log(`[test-decide-live] base=${COMPUTE_BASE_URL}`)
console.log("─".repeat(72))

for (let i = 1; i <= runs; i++) {
  const startedAt = Date.now()
  try {
    const { content, teeVerified, responseId } = await callCompute()
    const ms = Date.now() - startedAt

    console.log(`\n# run ${i} · ${ms}ms · tee=${teeVerified} · id=${responseId ?? "n/a"}`)
    console.log(`raw → ${truncate(content, 400)}`)

    const parsed = parseUntilJson(content)
    if (Object.keys(parsed).length === 0) {
      console.log("parse → {} (no recoverable object)")
      failed += 1
      continue
    }
    parsedOk += 1
    console.log(`parse → ${JSON.stringify(parsed)}`)

    const result = decisionSchema.safeParse(parsed)
    if (!result.success) {
      const issues = result.error.issues.map((x) => `${x.path.join(".")}:${x.message}`).join("; ")
      console.log(`schema → REJECT (${issues})`)
      failed += 1
    } else {
      schemaOk += 1
      console.log(
        `schema → OK · action=${result.data.action} asset=${result.data.asset} qty=${result.data.quantity} px=${result.data.limit_price_usd} conf=${result.data.confidence}`,
      )
    }
  } catch (error) {
    failed += 1
    console.error(`# run ${i} FAILED: ${(error?.message ?? error).toString().slice(0, 240)}`)
  }
}

console.log("\n" + "─".repeat(72))
console.log(
  `summary · parsed=${parsedOk}/${runs} · schema_ok=${schemaOk}/${runs} · failed=${failed}/${runs}`,
)
process.exit(schemaOk === runs ? 0 : 1)

// ── helpers ─────────────────────────────────────────────────────────────────
function truncate(str, n) {
  if (!str) return ""
  return str.length > n ? `${str.slice(0, n)}…` : str
}

function parseFlag(name, fallback) {
  const hit = argv.find((a) => a.startsWith(`${name}=`))
  return hit ? hit.split("=")[1] : fallback
}

function loadDotenv(path) {
  let raw
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    return
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}
