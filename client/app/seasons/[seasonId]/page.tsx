import type { Metadata } from "next"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { StatCard } from "@/components/shared/stat-card"
import { getSeasonByChainId } from "@/lib/db/repositories/seasons"
import { listLeaguesBySeason } from "@/lib/db/repositories/leagues"

export const metadata: Metadata = {
  title: "Season — IMSY.",
  description: "Season overview with leagues and standings.",
}

async function getSeasonData(id: string) {
  const [season, leagues] = await Promise.all([getSeasonByChainId(id), listLeaguesBySeason(id)])
  return { season, leagues }
}

export default async function SeasonPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const { seasonId } = await params
  const { season, leagues } = await getSeasonData(seasonId)

  if (!season) {
    return (
      <main className="relative min-h-screen flex items-center justify-center">
        <p className="font-mono text-muted-foreground">Season not found</p>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="seasons" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-16 relative">
          <SectionLabel>{season.status}</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none">
            {season.name}
          </h1>
          {season.description && (
            <p className="mt-6 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
              {season.description}
            </p>
          )}
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <StatCard label="Status" value={season.status} />
          <StatCard label="Leagues" value={leagues.length} />
          <StatCard label="Start" value={new Date(season.season_start).toLocaleDateString()} />
          <StatCard label="End" value={new Date(season.season_end).toLocaleDateString()} />
        </div>

        <section className="space-y-6">
          <SectionLabel>Leagues</SectionLabel>
          {leagues.length === 0 ? (
            <div className="border border-border/40 p-8 text-center font-mono text-xs text-muted-foreground/60">
              No leagues configured for this season yet.
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {leagues.map((league) => (
                <Link
                  key={league.chain_id_hex}
                  href={`/seasons/${seasonId}/leagues/${league.chain_id_hex}`}
                  className="group block border border-border/40 p-6 space-y-4 hover:border-accent/40 transition-all duration-300"
                >
                  <span className="font-mono text-[10px] uppercase tracking-widest text-accent/80">
                    {league.type.replace("_", " ")}
                  </span>
                  <h2 className="font-[var(--font-bebas)] text-2xl tracking-tight text-foreground group-hover:text-accent transition-colors">
                    {league.name}
                  </h2>
                  <div className="flex gap-4 font-mono text-[10px] text-muted-foreground">
                    <span>{league.agent_count} agents</span>
                    <span>${league.initial_capital} capital</span>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground/50">
                    {league.asset_universe.join(", ")}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <footer className="pt-12 border-t border-border/30 mt-24">
          <Link
            href="/seasons"
            className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 w-fit"
          >
            All seasons
          </Link>
        </footer>
      </div>
    </main>
  )
}
