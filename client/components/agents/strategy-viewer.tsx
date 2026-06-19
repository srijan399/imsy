"use client"

import { useEffect, useState } from "react"
import {
  normalizeAgentStrategy,
  STRATEGY_LIST_FIELDS,
  STRATEGY_TEXT_FIELDS,
  type AgentStrategy,
  type StrategyListFieldKey,
} from "@/lib/agents/strategy"

interface StrategyResponse {
  agent_id: number
  strategy_root: string | null
  on_chain_strategy_root: string | null
  zg_storage_status?: string
  source: "0g-storage" | "mongo-only" | "local-hash-only" | "unavailable"
  verified: boolean
  doc?: unknown
  raw?: string
  error?: string
}

const STATUS_STYLE: Record<StrategyResponse["source"], string> = {
  "0g-storage": "border-emerald-500/40 text-emerald-400",
  "mongo-only": "border-amber-500/40 text-amber-400",
  "local-hash-only": "border-amber-500/40 text-amber-400",
  unavailable: "border-red-500/40 text-red-400",
}

const STATUS_LABEL: Record<StrategyResponse["source"], string> = {
  "0g-storage": "Verified from 0G Storage",
  "mongo-only": "0G download failed",
  "local-hash-only": "Local hash only — not on 0G Storage",
  unavailable: "Unavailable",
}

export function StrategyViewer({ agentId }: { agentId: number }) {
  const [data, setData] = useState<StrategyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/agents/${agentId}/strategy`)
      .then(async (res) => {
        const body = (await res.json()) as StrategyResponse | { error: string }
        if (!res.ok) throw new Error("error" in body ? body.error : "Strategy fetch failed")
        if (!cancelled) setData(body as StrategyResponse)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [agentId])

  if (loading) {
    return (
      <div className="border border-border/40 p-6 font-mono text-xs text-muted-foreground animate-pulse">
        Loading strategy from 0G Storage…
      </div>
    )
  }

  if (error) {
    return (
      <div className="border border-red-500/40 p-6 font-mono text-xs text-red-400">{error}</div>
    )
  }

  if (!data) return null

  const statusClass = STATUS_STYLE[data.source]
  const statusLabel = STATUS_LABEL[data.source]
  const strategy = data.doc ? normalizeAgentStrategy(data.doc) : null
  const rootMatches =
    data.strategy_root && data.on_chain_strategy_root
      ? data.strategy_root.toLowerCase() === data.on_chain_strategy_root.toLowerCase()
      : null

  return (
    <div className="border border-border/40 p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Strategy</span>
        <span className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 font-mono text-xs text-muted-foreground">
        <div>
          <p className="text-muted-foreground/60">Strategy root (DB)</p>
          <p className="text-foreground break-all">{data.strategy_root ?? "—"}</p>
        </div>
        <div>
          <p className="text-muted-foreground/60">Strategy root (on-chain)</p>
          <p className="text-foreground break-all">{data.on_chain_strategy_root ?? "—"}</p>
        </div>
      </div>

      {rootMatches !== null && (
        <p className={`font-mono text-[10px] ${rootMatches ? "text-emerald-400" : "text-red-400"}`}>
          {rootMatches ? "DB root matches on-chain root." : "WARNING: DB root differs from on-chain root."}
        </p>
      )}

      {data.error && (
        <p className="font-mono text-[10px] text-amber-400 leading-relaxed">{data.error}</p>
      )}

      {strategy && (
        <StrategyPlaybookView strategy={strategy} />
      )}

      {data.source === "0g-storage" && (
        <p className="font-mono text-[10px] text-muted-foreground/60 leading-relaxed">
          Downloaded directly from 0G Storage by root hash. Content {data.verified ? "matches" : "does not match"} the
          recorded sha256 commitment.
        </p>
      )}
    </div>
  )
}

function StrategyPlaybookView({ strategy }: { strategy: AgentStrategy }) {
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[1fr_0.75fr] gap-4">
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Public description</p>
          <p className="text-sm leading-relaxed text-foreground">{strategy.description}</p>
        </div>
        <div className="space-y-2 font-mono text-xs text-muted-foreground">
          <p>
            Signals
            <span className="block mt-1 text-foreground">{strategy.allowed_signals.join(", ")}</span>
          </p>
          <p>
            Assets
            <span className="block mt-1 text-foreground">{strategy.asset_universe.join(", ")}</span>
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <RiskMetric label="Drawdown cap" value={`${strategy.risk_profile.max_drawdown_pct}%`} />
        <RiskMetric label="Position cap" value={`${strategy.risk_profile.max_position_size_pct}%`} />
        <RiskMetric label="Leverage cap" value={`${strategy.risk_profile.leverage_cap}x`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {STRATEGY_TEXT_FIELDS.map((field) => {
          const value = strategy.playbook[field.key]
          if (!value) return null
          return (
            <div key={field.key} className="border border-border/30 p-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">{field.label}</p>
              <p className="text-sm leading-relaxed text-foreground">{value}</p>
            </div>
          )
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {STRATEGY_LIST_FIELDS.map((field) => (
          <RuleList key={field.key} title={field.label} items={strategy.playbook[field.key]} fieldKey={field.key} />
        ))}
      </div>
    </div>
  )
}

function RiskMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border/30 p-3 font-mono text-xs">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 text-foreground">{value}</p>
    </div>
  )
}

function RuleList({ title, items, fieldKey }: { title: string; items: string[]; fieldKey: StrategyListFieldKey }) {
  if (!items.length) return null
  const tone = fieldKey === "disallowed_actions" ? "marker:text-red-400" : "marker:text-accent"
  return (
    <div className="border border-border/30 p-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-3">{title}</p>
      <ul className={`list-disc pl-4 space-y-2 text-sm leading-relaxed text-foreground ${tone}`}>
        {items.map((item, index) => (
          <li key={`${fieldKey}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
