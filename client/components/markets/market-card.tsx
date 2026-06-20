"use client"

import { cn } from "@/lib/utils"
import Link from "next/link"

interface MarketCardProps {
  id: string
  question: string
  tier: number
  agentName?: string
  yesPool: number
  noPool: number
  status: "pending" | "open" | "locked" | "resolved"
  outcome?: "yes" | "no" | null
}

export function MarketCard({ id, question, tier, agentName, yesPool, noPool, status, outcome }: MarketCardProps) {
  const total = yesPool + noPool
  const yesPct = total > 0 ? (yesPool / total) * 100 : 50
  const noPct = total > 0 ? (noPool / total) * 100 : 50

  return (
    <Link
      href={`/markets/${id}`}
      className="group block border border-border/40 p-5 space-y-4 hover:border-accent/40 transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Top {tier} · {status}
          </span>
          <h3 className="font-[var(--font-bebas)] text-xl tracking-tight text-foreground group-hover:text-accent transition-colors duration-200">
            {question}
          </h3>
          {agentName && (
            <p className="font-mono text-[10px] text-muted-foreground/70">{agentName}</p>
          )}
        </div>
        {status === "resolved" && outcome && (
          <span className={cn(
            "px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border",
            outcome === "yes" ? "border-emerald-500/50 text-emerald-400" : "border-red-500/50 text-red-400",
          )}>
            {outcome}
          </span>
        )}
      </div>

      {/* Odds bar */}
      <div className="space-y-1">
        <div className="flex h-2 w-full overflow-hidden border border-border/30">
          <div
            className="bg-emerald-500/60 transition-all duration-500"
            style={{ width: `${yesPct}%` }}
          />
          <div
            className="bg-red-500/40 transition-all duration-500"
            style={{ width: `${noPct}%` }}
          />
        </div>
        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
          <span className="text-emerald-400/80">YES {yesPct.toFixed(0)}%</span>
          <span className="text-red-400/80">NO {noPct.toFixed(0)}%</span>
        </div>
      </div>

      {/* Volume */}
      <div className="font-mono text-[10px] text-muted-foreground/60">
        Vol: {total.toFixed(4)} 0G
      </div>
    </Link>
  )
}
