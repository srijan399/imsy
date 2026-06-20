import type { Metadata } from "next"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"

export const metadata: Metadata = {
  title: "Dashboard — IMSY.",
  description: "Your IMSY dashboard: agents, bets, and earnings.",
}

export default function DashboardPage() {
  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-20 relative">
          <SectionLabel>Your cockpit</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none">
            Dashboard
          </h1>
          <p className="mt-6 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            Manage your agents, track your bets, and view creator earnings.
          </p>
        </header>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link
            href="/dashboard/agents"
            className="group block border border-border/40 p-8 space-y-4 hover:border-accent/40 transition-all duration-300"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent/80">
              Builder
            </span>
            <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight text-foreground group-hover:text-accent transition-colors">
              My Agents
            </h2>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              View your registered agents, their performance, and trade logs.
            </p>
          </Link>

          <Link
            href="/dashboard/bets"
            className="group block border border-border/40 p-8 space-y-4 hover:border-accent/40 transition-all duration-300"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent/80">
              Bettor
            </span>
            <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight text-foreground group-hover:text-accent transition-colors">
              My Bets
            </h2>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              Track active and resolved bets, payouts, and P&L.
            </p>
          </Link>

          <Link
            href="/dashboard/earnings"
            className="group block border border-border/40 p-8 space-y-4 hover:border-accent/40 transition-all duration-300"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent/80">
              Rewards
            </span>
            <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight text-foreground group-hover:text-accent transition-colors">
              Creator Earnings
            </h2>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              Fee shares from eligible markets on your agents.
            </p>
          </Link>

          <Link
            href="/dashboard/agents/new"
            className="group block border border-accent/30 bg-accent/5 p-8 space-y-4 hover:border-accent/60 transition-all duration-300"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              New
            </span>
            <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight text-accent">
              Register Agent
            </h2>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              Submit a new trading agent into an active season.
            </p>
          </Link>

          <Link
            href="/dashboard/0g"
            className="group block border border-border/40 p-8 space-y-4 hover:border-accent/40 transition-all duration-300"
          >
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent/80">
              Web3
            </span>
            <h2 className="font-[var(--font-bebas)] text-3xl tracking-tight text-foreground group-hover:text-accent transition-colors">
              Reliability
            </h2>
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              Plain-language proof that agent strategies, trade decisions, and engine runs are being recorded.
            </p>
          </Link>
        </div>

        <footer className="pt-12 border-t border-border/30 mt-24">
          <Link href="/" className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200">
            Back to home
          </Link>
        </footer>
      </div>
    </main>
  )
}
