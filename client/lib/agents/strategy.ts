export interface RiskProfile {
  max_drawdown_pct: number
  max_position_size_pct: number
  leverage_cap: number
}

export interface StrategyPlaybook {
  prime_directive: string
  trading_style: string
  entry_rules: string[]
  exit_rules: string[]
  risk_rules: string[]
  sizing_rules: string[]
  disallowed_actions: string[]
  evaluation_notes: string
}

export interface AgentStrategy {
  description: string
  playbook: StrategyPlaybook
  risk_profile: RiskProfile
  allowed_signals: string[]
  asset_universe: string[]
  version: number
  strategy_root?: string
  sha256_hash?: string
  zg_storage_status?: "uploaded" | "local_hash_only"
  zg_storage_tx_hash?: string | null
  zg_storage_error?: string
}

export const STRATEGY_VERSION = 2

export const RISK_PROFILE_DEFAULTS: RiskProfile = {
  max_drawdown_pct: 20,
  max_position_size_pct: 30,
  leverage_cap: 1,
}

export const EMPTY_STRATEGY_PLAYBOOK: StrategyPlaybook = {
  prime_directive: "",
  trading_style: "",
  entry_rules: [""],
  exit_rules: [""],
  risk_rules: [""],
  sizing_rules: [""],
  disallowed_actions: [""],
  evaluation_notes: "",
}

export function createEmptyStrategyPlaybook(): StrategyPlaybook {
  return {
    ...EMPTY_STRATEGY_PLAYBOOK,
    entry_rules: [...EMPTY_STRATEGY_PLAYBOOK.entry_rules],
    exit_rules: [...EMPTY_STRATEGY_PLAYBOOK.exit_rules],
    risk_rules: [...EMPTY_STRATEGY_PLAYBOOK.risk_rules],
    sizing_rules: [...EMPTY_STRATEGY_PLAYBOOK.sizing_rules],
    disallowed_actions: [...EMPTY_STRATEGY_PLAYBOOK.disallowed_actions],
  }
}

export const STRATEGY_TEXT_FIELDS = [
  {
    key: "prime_directive",
    label: "Prime directive",
    placeholder: "Protect capital first; compound only when momentum and risk agree.",
  },
  {
    key: "trading_style",
    label: "Trading style",
    placeholder: "Short-horizon momentum with defensive cash rotation during noisy markets.",
  },
  {
    key: "evaluation_notes",
    label: "Review notes",
    placeholder: "Favor patience after losses. Prefer fewer, cleaner trades over constant activity.",
  },
] as const

export const STRATEGY_LIST_FIELDS = [
  {
    key: "entry_rules",
    label: "Entry rules",
    placeholder: "Enter only after price confirms strength with an allowed signal.",
  },
  {
    key: "exit_rules",
    label: "Exit rules",
    placeholder: "Trim winners into strength before exposure exceeds the envelope.",
  },
  {
    key: "risk_rules",
    label: "Risk rules",
    placeholder: "Hold when drawdown approaches the league limit.",
  },
  {
    key: "sizing_rules",
    label: "Sizing rules",
    placeholder: "Start small; scale only after the position moves in favor.",
  },
  {
    key: "disallowed_actions",
    label: "Never do",
    placeholder: "Do not average down into a falling asset.",
  },
] as const

export type StrategyTextFieldKey = (typeof STRATEGY_TEXT_FIELDS)[number]["key"]
export type StrategyListFieldKey = (typeof STRATEGY_LIST_FIELDS)[number]["key"]

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export function parseDelimitedList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)
  if (typeof value !== "string") return []
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizeRuleList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean)
  if (typeof value === "string") return value.split("\n").map((item) => item.trim()).filter(Boolean)
  return []
}

function cleanNumber(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export function normalizeRiskProfile(input: unknown): RiskProfile {
  const profile = (input && typeof input === "object" ? input : {}) as Partial<RiskProfile>
  return {
    max_drawdown_pct: cleanNumber(profile.max_drawdown_pct, RISK_PROFILE_DEFAULTS.max_drawdown_pct),
    max_position_size_pct: cleanNumber(profile.max_position_size_pct, RISK_PROFILE_DEFAULTS.max_position_size_pct),
    leverage_cap: cleanNumber(profile.leverage_cap, RISK_PROFILE_DEFAULTS.leverage_cap),
  }
}

export function normalizeStrategyPlaybook(input: unknown): StrategyPlaybook {
  const playbook = (input && typeof input === "object" ? input : {}) as Partial<StrategyPlaybook>
  return {
    prime_directive: cleanText(playbook.prime_directive),
    trading_style: cleanText(playbook.trading_style),
    entry_rules: normalizeRuleList(playbook.entry_rules),
    exit_rules: normalizeRuleList(playbook.exit_rules),
    risk_rules: normalizeRuleList(playbook.risk_rules),
    sizing_rules: normalizeRuleList(playbook.sizing_rules),
    disallowed_actions: normalizeRuleList(playbook.disallowed_actions),
    evaluation_notes: cleanText(playbook.evaluation_notes),
  }
}

export function normalizeAgentStrategy(input: unknown): AgentStrategy {
  const strategy = (input && typeof input === "object" ? input : {}) as Partial<AgentStrategy>
  return {
    description: cleanText(strategy.description),
    playbook: normalizeStrategyPlaybook(strategy.playbook),
    risk_profile: normalizeRiskProfile(strategy.risk_profile),
    allowed_signals: parseDelimitedList(strategy.allowed_signals),
    asset_universe: parseDelimitedList(strategy.asset_universe),
    version: STRATEGY_VERSION,
    strategy_root: cleanText(strategy.strategy_root),
    sha256_hash: cleanText(strategy.sha256_hash),
    zg_storage_status: strategy.zg_storage_status,
    zg_storage_tx_hash: cleanText(strategy.zg_storage_tx_hash) || null,
    zg_storage_error: cleanText(strategy.zg_storage_error),
  }
}

export function validateStrategyForRegistration(strategy: AgentStrategy): string | null {
  if (!strategy.description) return "strategy description required"
  if (!strategy.playbook.prime_directive) return "prime directive required"
  if (!strategy.playbook.trading_style) return "trading style required"
  if (strategy.allowed_signals.length === 0) return "allowed_signals[] required"

  for (const field of STRATEGY_LIST_FIELDS) {
    if (strategy.playbook[field.key].length === 0) return `${field.label.toLowerCase()} required`
  }

  return null
}
