"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount } from "wagmi"
import { SectionLabel } from "@/components/marketing-section-label"
import { MarketingHeader } from "@/components/marketing-header"

interface BetRow {
  tx_hash: string
  side: "yes" | "no"
  stake: number
  status: "active" | "won" | "lost"
  market?: { question?: string; contract_address?: string }
  market_contract?: string
}

export default function MyBetsPage() {
  const { address } = useAccount()
  const [bets, setBets] = useState<BetRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) {
      setBets([])
      return
    }
    setLoading(true)
    fetch(`/api/bets/me?wallet=${address}`)
      .then((r) => r.json())
      .then((data) => setBets(Array.isArray(data) ? data : []))
      .catch(() => setBets([]))
      .finally(() => setLoading(false))
  }, [address])

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <SectionLabel>My bets</SectionLabel>
        <h1 className="mt-4 mb-12 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight leading-none">Bets</h1>
        {!address ? (
          <div className="border border-border/40 p-12 text-center space-y-4">
            <p className="font-mono text-xs text-muted-foreground">Connect your wallet to load your bets.</p>
            <ConnectButton />
          </div>
        ) : loading ? (
          <div className="flex items-center gap-3 p-16 font-mono text-xs text-muted-foreground">
            <span className="inline-block size-4 border border-accent/60 border-t-transparent rounded-full animate-spin" />
            Loading bets…
          </div>
        ) : bets.length === 0 ? (
          <div className="border border-border/40 p-12 text-center">
            <p className="font-mono text-xs text-muted-foreground">No bets placed yet.</p>
            <Link
              href="/markets"
              className="inline-block mt-4 border border-accent px-6 py-3 font-mono text-xs uppercase tracking-widest text-accent hover:bg-accent/10 transition-colors"
            >
              Browse markets
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bets.map((b) => (
              <Link
                key={b.tx_hash}
                href={`/markets/${b.market?.contract_address ?? b.market_contract ?? ""}`}
                className="block border border-border/40 p-6 hover:border-accent/40 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-sm text-foreground">{b.market?.question ?? b.market_contract}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {b.side.toUpperCase()} · {b.stake} 0G
                    </p>
                  </div>
                  <span
                    className={`px-2 py-0.5 font-mono text-[10px] uppercase border ${
                      b.status === "won"
                        ? "border-emerald-500/50 text-emerald-400"
                        : b.status === "lost"
                          ? "border-red-500/50 text-red-400"
                          : "border-border/40 text-muted-foreground"
                    }`}
                  >
                    {b.status}
                  </span>
                </div>
              </Link>
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
