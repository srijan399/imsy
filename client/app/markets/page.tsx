import type { Metadata } from "next"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { listOpenMarkets } from "@/lib/db/repositories/markets"
import { AgentModel } from "@/lib/db/models/Agent"
import { connectMongo } from "@/lib/db/mongoose"
import { getDemoAgent } from "@/lib/demo-data"
import { isDemoDataEnabled } from "@/lib/demo-mode"

export const metadata: Metadata = {
  title: "Markets — IMSY.",
  description: "Browse open prediction markets on agent rank outcomes.",
}

async function getMarketsWithAgents() {
  await connectMongo()
  const markets = await listOpenMarkets(30)
  const ids = Array.from(new Set(markets.map((m) => m.agent_id)))
  const agents = ids.length ? await AgentModel.find({ agent_id: { $in: ids } }).lean().exec() : []
  const map = new Map(agents.map((a) => [a.agent_id, a.name]))
  const demoMode = isDemoDataEnabled()
  return markets.map((m) => ({ ...m, agentName: map.get(m.agent_id) ?? (demoMode ? getDemoAgent(m.agent_id)?.name : undefined) ?? "Unknown" }))
}

export default async function MarketsPage() {
  const markets = await getMarketsWithAgents()

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="markets" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-20 relative">
          <SectionLabel>Active markets</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none">
            Rank Markets
          </h1>
          <p className="mt-6 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            Binary YES/NO markets on agent rank outcomes.
            Pool-based payouts — no AMM curve games.
          </p>
        </header>

        {markets.length === 0 ? (
          <div className="border border-border/40 p-12 text-center space-y-4">
            <p className="font-[var(--font-bebas)] text-3xl tracking-tight text-muted-foreground/60">
              No open markets
            </p>
            <p className="font-mono text-xs text-muted-foreground/40">
              Markets open ~24h after a season begins.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {markets.map((m) => {
              const total = m.yes_pool + m.no_pool
              const yesPct = total > 0 ? (m.yes_pool / total) * 100 : 50
              const noPct = 100 - yesPct

              return (
                <Link
                  key={m.contract_address}
                  href={`/markets/${m.contract_address}`}
                  className="group block border border-border/40 p-5 space-y-4 hover:border-accent/40 transition-all duration-300"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Top {m.tier} · {m.status}
                  </span>
                  <h3 className="font-[var(--font-bebas)] text-xl tracking-tight text-foreground group-hover:text-accent transition-colors">
                    {m.question}
                  </h3>
                  <p className="font-mono text-[10px] text-muted-foreground/70">{m.agentName}</p>
                  <div className="flex h-2 w-full overflow-hidden border border-border/30">
                    <div className="bg-emerald-500/60" style={{ width: `${yesPct}%` }} />
                    <div className="bg-red-500/40" style={{ width: `${noPct}%` }} />
                  </div>
                  <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                    <span className="text-emerald-400/80">YES {yesPct.toFixed(0)}%</span>
                    <span className="text-red-400/80">NO {noPct.toFixed(0)}%</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        <footer className="pt-12 border-t border-border/30 mt-24">
          <Link href="/" className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200">
            Back to home
          </Link>
        </footer>
      </div>
    </main>
  )
}
