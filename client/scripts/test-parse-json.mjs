#!/usr/bin/env node
// Smoke-test the LLM-output parser + schema validator against representative
// junk a small model produces. Run with:
//   bun run scripts/test-parse-json.mjs
//
// Exits non-zero on any case where parser/schema disagrees with the expected
// outcome (parsed | rejected).

import { ALL, parseJSON } from "partial-json"
import { z } from "zod"

// ── Inline parser (mirror of client/lib/utils/parse-json.ts) ─────────────────
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

// ── Mirror of decisionSchema in client/lib/engine/decide.ts ─────────────────
const decisionSchema = z.object({
  action: z.enum(["buy", "sell", "hold"]),
  asset: z.string().min(1),
  quantity: z.number().nonnegative(),
  limit_price_usd: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400),
})

// ── Cases ────────────────────────────────────────────────────────────────────
const cases = [
  {
    name: "clean json (ideal output)",
    input: `{"action":"buy","asset":"BTC","quantity":0.001,"limit_price_usd":60000,"confidence":0.7,"reasoning":"momentum"}`,
    expect: "ok",
  },
  {
    name: "json wrapped in ```json fence",
    input:
      "```json\n{\"action\":\"sell\",\"asset\":\"ETH\",\"quantity\":0.05,\"limit_price_usd\":3200,\"confidence\":0.5,\"reasoning\":\"trim\"}\n```",
    expect: "ok",
  },
  {
    name: "leading prose then json",
    input:
      "Here is the decision: {\"action\":\"hold\",\"asset\":\"SOL\",\"quantity\":0,\"limit_price_usd\":0,\"confidence\":0.3,\"reasoning\":\"flat\"}",
    expect: "ok",
  },
  {
    name: "trailing prose after json",
    input:
      "{\"action\":\"buy\",\"asset\":\"BTC\",\"quantity\":0.0008,\"limit_price_usd\":61000,\"confidence\":0.6,\"reasoning\":\"trend\"} (note: based on 24h move)",
    expect: "ok",
  },
  {
    name: "newlines inside object",
    input:
      "{\n  \"action\": \"hold\",\n  \"asset\": \"BTC\",\n  \"quantity\": 0,\n  \"limit_price_usd\": 0,\n  \"confidence\": 0.4,\n  \"reasoning\": \"wait\"\n}",
    expect: "ok",
  },
  {
    name: "truncated json (partial-json should still recover)",
    input:
      `{"action":"buy","asset":"BTC","quantity":0.0005,"limit_price_usd":60500,"confidence":0.55,"reasoning":"momentum"`,
    expect: "ok",
  },
  {
    name: "wrong action enum",
    input: `{"action":"wait","asset":"BTC","quantity":0,"limit_price_usd":0,"confidence":0.4,"reasoning":"x"}`,
    expect: "reject",
  },
  {
    name: "missing field (confidence)",
    input: `{"action":"hold","asset":"BTC","quantity":0,"limit_price_usd":0,"reasoning":"x"}`,
    expect: "reject",
  },
  {
    name: "quantity as string instead of number",
    input: `{"action":"buy","asset":"BTC","quantity":"0.001","limit_price_usd":60000,"confidence":0.7,"reasoning":"x"}`,
    expect: "reject",
  },
  {
    name: "negative quantity",
    input: `{"action":"sell","asset":"BTC","quantity":-1,"limit_price_usd":60000,"confidence":0.7,"reasoning":"x"}`,
    expect: "reject",
  },
  {
    name: "complete junk",
    input: `Sure, I think we should buy some BTC because the chart looks good.`,
    expect: "reject",
  },
  {
    name: "empty string",
    input: ``,
    expect: "reject",
  },
  {
    name: "json wrapped in single backticks",
    input:
      "`{\"action\":\"buy\",\"asset\":\"ETH\",\"quantity\":0.1,\"limit_price_usd\":3000,\"confidence\":0.5,\"reasoning\":\"x\"}`",
    expect: "ok",
  },
  {
    name: "double-encoded json string",
    input:
      JSON.stringify(
        `{"action":"hold","asset":"BTC","quantity":0,"limit_price_usd":0,"confidence":0.4,"reasoning":"flat"}`,
      ),
    expect: "ok",
  },
  {
    name: "object inside array",
    input:
      `[{"action":"buy","asset":"BTC","quantity":0.001,"limit_price_usd":60000,"confidence":0.6,"reasoning":"x"}]`,
    // parseUntilJson returns the array (top-level). zod schema is object → reject.
    expect: "reject",
  },
]

let pass = 0
let fail = 0
for (const c of cases) {
  const parsed = parseUntilJson(c.input)
  const result = decisionSchema.safeParse(parsed)
  const got = result.success ? "ok" : "reject"
  const ok = got === c.expect
  if (ok) {
    pass += 1
    console.log(`✔ ${c.name}`)
  } else {
    fail += 1
    console.error(
      `✘ ${c.name}\n   expected=${c.expect} got=${got} parsed=${JSON.stringify(parsed)}\n   issues=${
        result.success ? "n/a" : result.error.issues.map((i) => `${i.path.join(".")}:${i.message}`).join("; ")
      }`,
    )
  }
}

console.log(`\n${pass} passed · ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
