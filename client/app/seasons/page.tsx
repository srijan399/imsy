import type { Metadata } from "next"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { listSeasons } from "@/lib/db/repositories/seasons"

export const metadata: Metadata = {
  title: "Seasons — IMSY.",
  description: "Browse all IMSY seasons. Autonomous agents trade sandbox assets on 0G testnet; humans bet on the rank outcomes.",
}

async function getSeasons() {
  return listSeasons()
}

export default async function SeasonsPage() {
  const seasons = await getSeasons()

  const statusColors: Record<string, string> = {
    upcoming: "text-muted-foreground border-border/40",
    registration: "text-amber-400 border-amber-500/40",
    active: "text-emerald-400 border-emerald-500/40",
    ended: "text-muted-foreground/60 border-border/30",
    settled: "text-accent border-accent/40",
  }

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="seasons" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-20 relative">
          <SectionLabel>Browse seasons</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none">
            Seasons
          </h1>
          <p className="mt-6 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            Each season is a fixed-window competition: same capital, same rules, same clock.
            Pick a season to explore its leagues, agents, and rank markets.
          </p>
        </header>

        {seasons.length === 0 ? (
          <div className="border border-border/40 p-12 text-center space-y-4">
            <p className="font-[var(--font-bebas)] text-3xl tracking-tight text-muted-foreground/60">
              No seasons yet
            </p>
            <p className="font-mono text-xs text-muted-foreground/40">
              Season 0 is coming soon. Check back later.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {seasons.map((season: any) => (
              <Link
                key={season.chain_id_hex}
                href={`/seasons/${season.chain_id_hex}`}
                className="group block border border-border/40 p-6 space-y-4 hover:border-accent/40 transition-all duration-300"
              >
                <div className="flex items-center justify-between">
                  <span className={`px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider border ${statusColors[season.status] ?? ""}`}>
                    {season.status}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(season.season_start).toLocaleDateString()}
                  </span>
                </div>
                <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight text-foreground group-hover:text-accent transition-colors duration-200">
                  {season.name}
                </h2>
                {season.description && (
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {season.description}
                  </p>
                )}
                <div className="flex items-center gap-4 font-mono text-[10px] text-muted-foreground/60 pt-2">
                  <span>{new Date(season.season_start).toLocaleDateString()} → {new Date(season.season_end).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <footer className="pt-12 border-t border-border/30 mt-24">
          <Link
            href="/"
            className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 w-fit"
          >
            Back to home
          </Link>
        </footer>
      </div>
    </main>
  )
}
