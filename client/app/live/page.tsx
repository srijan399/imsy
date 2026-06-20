"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { LivePnlChart } from "@/components/leaderboard/live-pnl-chart"
import { SectionLabel } from "@/components/marketing-section-label"

interface LeagueRow {
  chain_id_hex: string
  name: string
  status: string
}

export default function LivePage() {
  return (
    <Suspense fallback={<LivePageShell />}>
      <LivePageContent />
    </Suspense>
  )
}

function LivePageContent() {
  const params = useSearchParams()
  const queryLeague = params.get("league")
  const [leagues, setLeagues] = useState<LeagueRow[]>([])
  const [selected, setSelected] = useState<string | null>(queryLeague)

  useEffect(() => {
    fetch("/api/leagues")
      .then((r) => r.json())
      .then((rows: LeagueRow[]) => {
        setLeagues(rows)
        if (!selected && rows.length > 0) setSelected(rows[0].chain_id_hex)
      })
      .catch(() => undefined)
  }, [selected])

  return (
    <main className="relative min-h-screen p-6 md:p-12 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <SectionLabel>Live arena</SectionLabel>
          <h1 className="mt-2 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight leading-none">
            PnL Theater
          </h1>
        </div>
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full min-w-[12rem] bg-card border border-border/40 px-3 py-2 font-mono text-xs text-foreground"
        >
          {leagues.map((l) => (
            <option key={l.chain_id_hex} value={l.chain_id_hex}>
              {l.name} · {l.status}
            </option>
          ))}
        </select>
      </header>
      {selected ? <LivePnlChart leagueId={selected} windowMs={2 * 60 * 60 * 1000} /> : (
        <p className="font-mono text-xs text-muted-foreground">Loading leagues…</p>
      )}
    </main>
  )
}

function LivePageShell() {
  return (
    <main className="relative min-h-screen p-6 md:p-12 space-y-6">
      <header>
        <SectionLabel>Live arena</SectionLabel>
        <h1 className="mt-2 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight leading-none">
          PnL Theater
        </h1>
      </header>
      <p className="font-mono text-xs text-muted-foreground">Loading leagues…</p>
    </main>
  )
}
