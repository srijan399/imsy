"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount } from "wagmi"
import { SectionLabel } from "@/components/marketing-section-label"
import { MarketingHeader } from "@/components/marketing-header"
import { AgentIconRender } from "@/components/agents/icon-picker"
import { normalizeAgentStrategy, type AgentStrategy } from "@/lib/agents/strategy"
import { DEMO_AGENTS } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

interface AgentRow {
  agent_id: number
  name: string
  current_rank: number
  status: string
  performance: { roi_pct?: number }
  deposit_usd?: string
  icon?: string
  color?: string
  strategy?: AgentStrategy
}

export default function MyAgentsPage() {
  const { address } = useAccount()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(false)
  const demoMode = isDemoDataEnabled()

  useEffect(() => {
    if (!address) {
      setAgents(demoMode ? DEMO_AGENTS as AgentRow[] : [])
      return
    }
    setLoading(true)
    fetch(`/api/agents?wallet=${address}`)
      .then((r) => r.json())
      .then((data) => setAgents(Array.isArray(data) ? data : []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false))
  }, [address, demoMode])

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <SectionLabel>My agents</SectionLabel>
        <h1 className="mt-4 mb-12 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight leading-none">Agents</h1>
        {!address && (
          <div className="mb-6 border border-accent/30 bg-accent/5 p-4 flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-xs text-muted-foreground">
              {demoMode ? "Showing demo agents. Connect your wallet to load your real roster." : "Connect your wallet to load your agent roster."}
            </p>
            <ConnectButton />
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 p-16 font-mono text-xs text-muted-foreground">
            <span className="inline-block size-4 border border-accent/60 border-t-transparent rounded-full animate-spin" />
            Loading agents…
          </div>
        ) : agents.length === 0 ? (
          <div className="border border-border/40 p-12 text-center">
            <p className="font-mono text-xs text-muted-foreground">No agents registered yet.</p>
            <Link
              href="/dashboard/agents/new"
              className="inline-block mt-4 border border-accent px-6 py-3 font-mono text-xs uppercase tracking-widest text-accent hover:bg-accent/10 transition-colors"
            >
              Register agent
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {agents.map((a) => (
              <AgentListCard key={a.agent_id} agent={a} />
            ))}
          </div>
        )}
        <footer className="pt-12 border-t border-border/30 mt-16">
          <Link
            href="/dashboard"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Dashboard
          </Link>
        </footer>
      </div>
    </main>
  )
}

function AgentListCard({ agent }: { agent: AgentRow }) {
  const strategy = normalizeAgentStrategy(agent.strategy)
  const roi = agent.performance?.roi_pct ?? 0
  const headline = strategy.playbook.prime_directive || strategy.description

  return (
    <Link
      href={`/dashboard/agents/${agent.agent_id}`}
      className="block border border-border/40 p-6 hover:border-accent/40 transition-all"
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3
            className="font-[var(--font-bebas)] text-2xl tracking-tight flex items-center gap-2"
            style={{ color: agent.color || undefined }}
          >
            {agent.icon ? <AgentIconRender icon={agent.icon} color={agent.color || undefined} size={20} /> : null}
            <span>{agent.name}</span>
          </h3>
          <p className="font-mono text-[10px] text-muted-foreground">
            Agent #{agent.agent_id} · Rank #{agent.current_rank} · {agent.status}
          </p>
          {headline && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground">{headline}</p>}
          {strategy.allowed_signals.length > 0 && (
            <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {strategy.allowed_signals.join(" · ")}
            </p>
          )}
        </div>
        <div className="text-left md:text-right">
          <p className={`font-mono text-sm ${roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {roi >= 0 ? "+" : ""}
            {roi.toFixed(2)}%
          </p>
          <p className="font-mono text-[10px] text-muted-foreground">ROI</p>
        </div>
      </div>
    </Link>
  )
}
