"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount } from "wagmi"
import { SectionLabel } from "@/components/marketing-section-label"
import { MarketingHeader } from "@/components/marketing-header"
import { DEMO_EARNINGS } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

interface EarningRow {
  tx_hash: string
  agent_id: number
  season_chain_id_hex: string
  agent?: { name?: string; agent_id?: number; season_chain_id_hex?: string } | null
  eligible_market_contracts?: string[]
  earned_amount: number
  total_fee_pool?: number
  creator_share_rate?: number
  status: string
  calculated_at?: string
}

interface SeasonMeta {
  chain_id_hex: string
  name: string
  status: string
}

function LoadingSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-16 font-mono text-xs text-muted-foreground">
      <span className="inline-block size-4 border border-accent/60 border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  )
}

export default function EarningsPage() {
  const { address } = useAccount()
  const [earnings, setEarnings] = useState<EarningRow[]>([])
  const [seasons, setSeasons] = useState<Record<string, SeasonMeta>>({})
  const [loading, setLoading] = useState(false)
  const demoMode = isDemoDataEnabled()

  useEffect(() => {
    // Load season metadata for labels
    fetch("/api/seasons")
      .then((r) => r.json())
      .then((rows: SeasonMeta[]) => {
        const map: Record<string, SeasonMeta> = {}
        if (Array.isArray(rows)) {
          for (const s of rows) map[s.chain_id_hex.toLowerCase()] = s
        }
        setSeasons(map)
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!address) {
      setEarnings(demoMode
        ? DEMO_EARNINGS.map((earning) => ({
          ...earning,
          calculated_at: earning.calculated_at.toISOString(),
        })) as EarningRow[]
        : [])
      return
    }
    setLoading(true)
    fetch(`/api/users/me/earnings?wallet=${address}`)
      .then((r) => r.json())
      .then((data) => setEarnings(Array.isArray(data) ? data : []))
      .catch(() => setEarnings([]))
      .finally(() => setLoading(false))
  }, [address, demoMode])

  // Group earnings by season
  const grouped = earnings.reduce<Record<string, EarningRow[]>>((acc, e) => {
    const key = (e.season_chain_id_hex ?? "unknown").toLowerCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(e)
    return acc
  }, {})

  const totalEarned = earnings.reduce((sum, e) => sum + (e.earned_amount ?? 0), 0)

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full max-w-4xl">
        <SectionLabel>Rewards</SectionLabel>
        <h1 className="mt-4 mb-2 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight leading-none">
          Creator Earnings
        </h1>
        <p className="font-mono text-xs text-muted-foreground mb-12">
          Fee shares from eligible markets across all seasons your agents participated in.
        </p>

        {!address && (
          <div className="mb-6 border border-accent/30 bg-accent/5 p-4 flex flex-wrap items-center justify-between gap-4">
            <p className="font-mono text-xs text-muted-foreground">
              {demoMode ? "Showing demo creator rewards. Connect your wallet to load real payouts." : "Connect your wallet to load real payouts."}
            </p>
            <ConnectButton />
          </div>
        )}

        {loading ? (
          <LoadingSpinner label="Fetching earnings…" />
        ) : earnings.length === 0 ? (
          <div className="border border-border/40 p-12 text-center">
            <p className="font-mono text-xs text-muted-foreground">
              No earnings yet. Build agents that attract two-sided markets.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Summary row */}
            <div className="border border-border/40 p-6 flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">All-time earnings</p>
                <p className="font-[var(--font-bebas)] text-4xl tracking-tight text-emerald-400">{totalEarned.toFixed(4)} 0G</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Seasons</p>
                <p className="font-mono text-2xl text-foreground">{Object.keys(grouped).length}</p>
              </div>
            </div>

            {/* Per-season breakdown */}
            {Object.entries(grouped).map(([seasonHex, rows]) => {
              const seasonMeta = seasons[seasonHex]
              const seasonTotal = rows.reduce((sum, e) => sum + (e.earned_amount ?? 0), 0)
              return (
                <div key={seasonHex} className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-mono text-xs text-foreground font-bold">
                        {seasonMeta?.name ?? "Unknown Season"}
                      </p>
                      <p className="font-mono text-[10px] text-muted-foreground break-all">{seasonHex}</p>
                    </div>
                    <p className="font-mono text-sm text-emerald-400 shrink-0">{seasonTotal.toFixed(4)} 0G</p>
                  </div>
                  <div className="border border-border/40 divide-y divide-border/30">
                    {rows.map((e) => (
                      <div key={e.tx_hash} className="p-5 flex items-center justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <p className="font-mono text-sm text-foreground truncate">
                            {e.agent?.name ?? `Agent #${e.agent?.agent_id ?? e.agent_id ?? "?"}`}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {e.eligible_market_contracts?.length ?? 0} eligible market{(e.eligible_market_contracts?.length ?? 0) !== 1 ? "s" : ""}
                            {e.total_fee_pool != null && (
                              <span> · fee pool {Number(e.total_fee_pool).toFixed(4)} 0G</span>
                            )}
                            {e.creator_share_rate != null && (
                              <span> · {(Number(e.creator_share_rate) * 100).toFixed(1)}% share</span>
                            )}
                          </p>
                          {e.calculated_at && (
                            <p className="font-mono text-[10px] text-muted-foreground/60">
                              {new Date(e.calculated_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-lg text-emerald-400">{Number(e.earned_amount).toFixed(4)} 0G</p>
                          <p className="font-mono text-[10px] text-muted-foreground">{e.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
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
