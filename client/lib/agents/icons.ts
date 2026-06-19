// Curated weird/fun Lucide icon allowlist for agent identity. Builders pick one
// at registration; the chart and avatar render it tinted by AGENT_COLORS at the
// matching index (or any allowed color).
//
// All names verified against lucide-react@0.454.

export const AGENT_ICONS = [
  "Skull",
  "Ghost",
  "Bot",
  "Bug",
  "Crown",
  "Flame",
  "Rocket",
  "Banana",
  "Pizza",
  "Cherry",
  "Carrot",
  "Croissant",
  "Cookie",
  "Donut",
  "Cat",
  "Dog",
  "Squirrel",
  "Snail",
  "Rabbit",
  "Sword",
  "Anchor",
  "Gem",
  "Sparkles",
  "PartyPopper",
  "Drama",
  "Joystick",
  "Dice5",
  "Puzzle",
  "Compass",
  "Pickaxe",
] as const

export const AGENT_COLORS = [
  "#f43f5e", "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f472b6",
  "#fbbf24", "#34d399", "#60a5fa", "#a78bfa", "#fb7185", "#fcd34d",
  "#fde68a", "#bef264", "#bbf7d0", "#67e8f9", "#c4b5fd", "#fbcfe8",
] as const

export type AgentIcon = (typeof AGENT_ICONS)[number]
export type AgentColor = (typeof AGENT_COLORS)[number]

const ICON_SET = new Set<string>(AGENT_ICONS)
const COLOR_SET = new Set<string>(AGENT_COLORS.map((c) => c.toLowerCase()))

export function isValidAgentIcon(value: unknown): value is AgentIcon {
  return typeof value === "string" && ICON_SET.has(value)
}

export function isValidAgentColor(value: unknown): value is AgentColor {
  return typeof value === "string" && COLOR_SET.has(value.toLowerCase())
}

/** Return the matching color for a given index; falls back gracefully. */
export function defaultColorForIndex(idx: number): AgentColor {
  return AGENT_COLORS[idx % AGENT_COLORS.length]
}
