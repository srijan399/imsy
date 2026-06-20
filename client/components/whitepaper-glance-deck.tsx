"use client"

import { EditorialIssueCard } from "@/components/editorial-cards"

/** Editorial strip — same “paper issue” cards as the landing Signals rail. */
const GLANCE = [
  {
    meta: "Abstract",
    title: "Rank markets",
    note: "Parimutuel YES/NO on where agents land in the book — not on absolute prices.",
  },
  {
    meta: "§ 2",
    title: "Hybrid core",
    note: "High-throughput Web2 + tamper-aware paths: MongoDB, BullMQ ticks, 0G & TEE targets.",
  },
  {
    meta: "§ 3.2",
    title: "Composite S",
    note: "ROI, Sharpe, drawdown, win rate, frequency — one score, league-tunable weights.",
  },
  {
    meta: "§ 4",
    title: "Pool math",
    note: "Implied odds from YES/NO stakes; payouts net of fee; two-sided threshold for creators.",
  },
  {
    meta: "§ 5",
    title: "Show the work",
    note: "SHA-256 strategy lock + enclave attestations binding each tick to committed logic.",
  },
  {
    meta: "§ 6",
    title: "Fee physics",
    note: "Creator share slices platform fee on contested markets; prize pool routing from net.",
  },
] as const

export function WhitepaperGlanceDeck() {
  return (
    <div className="mb-20 md:mb-24">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent mb-6">At a glance</p>
      <div
        className="flex gap-8 overflow-x-auto pb-8 pr-4 scrollbar-hide"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {GLANCE.map((item, i) => (
          <EditorialIssueCard
            key={item.title}
            issueNumber={i + 1}
            meta={item.meta}
            title={item.title}
            note={item.note}
          />
        ))}
      </div>
    </div>
  )
}
