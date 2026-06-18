import type { Metadata } from "next"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { StatCard } from "@/components/shared/stat-card"
import { LeaderboardTable } from "@/components/leaderboard/leaderboard-table"
import { LivePnlChart } from "@/components/leaderboard/live-pnl-chart"
import { MarketCard } from "@/components/markets/market-card"
import { getLeagueWithAgents } from "@/lib/db/repositories/leagues"
import { listMarketsByLeague } from "@/lib/db/repositories/markets"

export const metadata: Metadata = {
  title: "League — IMSY.",
  description: "League leaderboard and rank markets.",
}

async function getLeague(leagueId: string) {
  const [data, markets] = await Promise.all([getLeagueWithAgents(leagueId), listMarketsByLeague(leagueId)])
  return { ...data, markets }
}

function formatTopRoi(value: number) {
  if (value === 0) return "0.0%"
  const sign = value > 0 ? "+" : ""
  if (Math.abs(value) < 0.1) return `${sign}<0.1%`
  return `${sign}${value.toFixed(1)}%`
}

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ seasonId: string; leagueId: string }>
}) {
  const { seasonId, leagueId } = await params
  const { league, agents, markets } = await getLeague(leagueId)

  if (!league) {
    return (
      <main className="relative min-h-screen flex items-center justify-center">
        <p className="font-mono text-muted-foreground">League not found</p>
      </main>
    )
  }

  const topAgent = agents[0]

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="seasons" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-16 relative">
          <SectionLabel>{league.type.replace("_", " ")}</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none">
            {league.name}
          </h1>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            {league.asset_universe.join(" · ")} · ${league.initial_capital} paper
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <StatCard label="Agents" value={agents.length} />
          <StatCard label="Top ROI" value={topAgent?.performance ? formatTopRoi(topAgent.performance.roi_pct) : "—"} trend={(topAgent?.performance?.roi_pct ?? 0) > 0 ? "up" : "down"} />
          <StatCard label="Markets" value={markets.length} />
          <StatCard label="Capital" value={`$${league.initial_capital}`} />
        </div>

        {/* Live PnL chart */}
        <section className="mb-12 space-y-4">
          <SectionLabel>Live PnL</SectionLabel>
          <LivePnlChart leagueId={leagueId} />
        </section>

        {/* Leaderboard */}
        <section className="mb-20 space-y-4">
          <SectionLabel>Leaderboard</SectionLabel>
          <LeaderboardTable
            agents={agents.map((a) => ({
              agent_id: a.agent_id,
              name: a.name,
              current_rank: a.current_rank,
              performance: {
                roi_pct: a.performance?.roi_pct ?? 0,
                sharpe_ratio: a.performance?.sharpe_ratio ?? 0,
                max_drawdown_pct: a.performance?.max_drawdown_pct ?? 0,
                win_rate: a.performance?.win_rate ?? 0,
                trade_count: a.performance?.trade_count ?? 0,
              },
              owner_wallet: a.owner_wallet,
            }))}
            live
          />
        </section>

        {/* Markets */}
        {markets.length > 0 && (
          <section className="mb-20 space-y-4">
            <SectionLabel>Rank markets</SectionLabel>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {markets.slice(0, 9).map((m) => (
                <MarketCard
                  key={m.contract_address}
                  id={m.contract_address}
                  question={m.question}
                  tier={m.tier}
                  yesPool={m.yes_pool}
                  noPool={m.no_pool}
                  status={m.status}
                  outcome={m.outcome ?? null}
                />
              ))}
            </div>
          </section>
        )}

        <footer className="pt-12 border-t border-border/30 mt-24 flex gap-6">
          <Link href={`/seasons/${seasonId}`} className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200">
            Season overview
          </Link>
          <Link href="/seasons" className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors">
            All seasons
          </Link>
        </footer>
      </div>
    </main>
  )
}
