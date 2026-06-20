"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { StatCard } from "@/components/shared/stat-card"
import { BettingPanel } from "@/components/markets/betting-panel"
import { ClaimPanel } from "@/components/markets/claim-panel"

export default function MarketDetailPage() {
  const params = useParams()
  const [market, setMarket] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/markets/${params.marketId}`)
      .then((r) => r.json())
      .then(setMarket)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [params.marketId])

  if (loading) {
    return (
      <main className="relative min-h-screen flex items-center justify-center">
        <p className="font-mono text-muted-foreground animate-pulse">Loading market...</p>
      </main>
    )
  }

  if (!market || market.error) {
    return (
      <main className="relative min-h-screen flex items-center justify-center">
        <p className="font-mono text-muted-foreground">Market not found</p>
      </main>
    )
  }

  const total = market.yes_pool + market.no_pool
  const yesPct = total > 0 ? (market.yes_pool / total) * 100 : 50

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="markets" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-16 relative">
          <SectionLabel>Top {market.tier} market · {market.status}</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-4xl md:text-6xl lg:text-7xl tracking-tight leading-none">
            {market.question}
          </h1>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <StatCard label="YES pool" value={`${market.yes_pool.toFixed(4)}`} suffix="0G" trend="up" />
          <StatCard label="NO pool" value={`${market.no_pool.toFixed(4)}`} suffix="0G" trend="down" />
          <StatCard label="Total volume" value={`${market.total_volume.toFixed(4)}`} suffix="0G" />
          <StatCard label="Implied YES" value={`${yesPct.toFixed(1)}%`} />
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            {/* Betting panel */}
            <BettingPanel
              contractAddress={market.contract_address as `0x${string}`}
              question={market.question}
              yesPool={market.yes_pool}
              noPool={market.no_pool}
              status={market.status}
              onBetPlaced={() => {
                fetch(`/api/markets/${params.marketId}`)
                  .then((r) => r.json())
                  .then(setMarket)
              }}
            />
            {/* Claim panel — visible only after resolution */}
            <ClaimPanel
              contractAddress={market.contract_address as `0x${string}`}
              outcome={market.outcome}
              resolved={market.status === "resolved"}
              onClaimed={() => {
                fetch(`/api/markets/${params.marketId}`)
                  .then((r) => r.json())
                  .then(setMarket)
              }}
            />
          </div>

          {/* Market info */}
          <div className="space-y-6">
            <div className="border border-border/40 p-6 space-y-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Market details
              </span>
              <div className="space-y-3 font-mono text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Contract</span>
                  <span className="text-foreground font-medium">
                    {market.deployment_tx_hash
                      ? `${market.contract_address.slice(0, 8)}...${market.contract_address.slice(-6)}`
                      : "Not deployed"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Chain</span>
                  <span className="text-foreground">0G Galileo ({market.chain_id})</span>
                </div>
                <div className="flex justify-between">
                  <span>Bettors</span>
                  <span className="text-foreground">{market.yes_count + market.no_count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className="text-foreground capitalize">{market.status}</span>
                </div>
                {market.outcome && (
                  <div className="flex justify-between">
                    <span>Outcome</span>
                    <span className={market.outcome === "yes" ? "text-emerald-400" : "text-red-400"}>
                      {market.outcome.toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="pt-12 border-t border-border/30 mt-24">
          <Link href="/markets" className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200">
            All markets
          </Link>
        </footer>
      </div>
    </main>
  )
}
