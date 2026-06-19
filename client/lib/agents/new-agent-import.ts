import {
  normalizeAgentStrategy,
  validateStrategyForRegistration,
  type AgentStrategy,
} from "@/lib/agents/strategy"
import { AGENT_COLORS, AGENT_ICONS, isValidAgentColor, isValidAgentIcon, type AgentColor, type AgentIcon } from "@/lib/agents/icons"

export type NewAgentFormImport = {
  name: string
  /** May be empty string when not provided in JSON — user must pick from dropdown */
  league_id: string
  description: string
  playbook: AgentStrategy["playbook"]
  allowed_signals: string
  max_drawdown_pct: number
  max_position_size_pct: number
  leverage_cap: number
  deposit_usd: string
  icon: AgentIcon
  color: AgentColor
  /** When true, skip auto-overwriting deposit from league initial_capital */
  hadExplicitDeposit: boolean
}

export function parseNewAgentJsonFromText(raw: string): { ok: true; data: NewAgentFormImport } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: "Invalid JSON" }
  }
  return parseNewAgentJson(parsed)
}

export function parseNewAgentJson(parsed: unknown): { ok: true; data: NewAgentFormImport } | { ok: false; error: string } {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Root must be a JSON object" }
  }
  const o = parsed as Record<string, unknown>

  const name = typeof o.name === "string" ? o.name.trim() : ""
  // league_id is optional in JSON — user selects from dropdown in the form
  const league_id = typeof o.league_id === "string" ? o.league_id.trim().toLowerCase() : ""
  const description = typeof o.description === "string" ? o.description.trim() : ""

  if (!name) return { ok: false, error: "name is required" }

  const strategy = normalizeAgentStrategy({
    description,
    playbook: o.playbook,
    risk_profile: o.risk_profile,
    allowed_signals: o.allowed_signals,
    asset_universe: o.asset_universe ?? [],
  })
  const stratErr = validateStrategyForRegistration(strategy)
  if (stratErr) return { ok: false, error: stratErr }

  let deposit_usd = ""
  let hadExplicitDeposit = false
  if (Object.prototype.hasOwnProperty.call(o, "deposit_usd")) {
    hadExplicitDeposit = true
    if (typeof o.deposit_usd === "number" && Number.isFinite(o.deposit_usd)) {
      deposit_usd = String(o.deposit_usd)
    } else if (typeof o.deposit_usd === "string") {
      deposit_usd = o.deposit_usd.trim()
    }
  }

  const playbook = strategy.playbook
  const allowed_signals = strategy.allowed_signals.join(",")

  return {
    ok: true,
    data: {
      name,
      league_id,
      description: strategy.description,
      playbook: {
        prime_directive: playbook.prime_directive,
        trading_style: playbook.trading_style,
        entry_rules: [...playbook.entry_rules],
        exit_rules: [...playbook.exit_rules],
        risk_rules: [...playbook.risk_rules],
        sizing_rules: [...playbook.sizing_rules],
        disallowed_actions: [...playbook.disallowed_actions],
        evaluation_notes: playbook.evaluation_notes,
      },
      allowed_signals,
      max_drawdown_pct: strategy.risk_profile.max_drawdown_pct,
      max_position_size_pct: strategy.risk_profile.max_position_size_pct,
      leverage_cap: strategy.risk_profile.leverage_cap,
      deposit_usd,
      icon: isValidAgentIcon(o.icon) ? o.icon : AGENT_ICONS[0],
      color: isValidAgentColor(o.color) ? o.color : AGENT_COLORS[0],
      hadExplicitDeposit,
    },
  }
}

/** Skeleton for the JSON import textarea — league_id is optional; select from dropdown after importing */
export const EXAMPLE_NEW_AGENT_JSON = `{
  "name": "JSON-Bot-1",
  "description": "Imported agent strategy.",
  "playbook": {
    "prime_directive": "Protect capital; trade only on clear signals.",
    "trading_style": "Short-horizon momentum with quick exits.",
    "entry_rules": ["Enter when momentum and RSI align."],
    "exit_rules": ["Cut losses at defined threshold."],
    "risk_rules": ["Pause if drawdown nears cap."],
    "sizing_rules": ["Size positions within max % of portfolio."],
    "disallowed_actions": ["No averaging down without a new signal."],
    "evaluation_notes": "Prefer fewer, higher-conviction trades."
  },
  "allowed_signals": ["momentum", "RSI"],
  "risk_profile": {
    "max_drawdown_pct": 20,
    "max_position_size_pct": 30,
    "leverage_cap": 1
  },
  "deposit_usd": "100",
  "icon": "Bot",
  "color": "#f97316"
}`
