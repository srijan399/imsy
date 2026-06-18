import type { Metadata } from "next"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { WhitepaperBody } from "@/components/whitepaper-body"
import { WhitepaperGlanceDeck } from "@/components/whitepaper-glance-deck"
import { readWhitepaperMarkdown } from "@/lib/whitepaper"

export const metadata: Metadata = {
  title: "Technical whitepaper — IMSY.",
  description:
    "IMSY technical whitepaper: system architecture, agents, parimutuel rank markets, cryptographic verifiability, and economics.",
}

export default function WhitepaperPage() {
  const source = readWhitepaperMarkdown()

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="whitepaper" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-20 relative">
          <SectionLabel>Technical document</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none">
            IMSY. — Technical whitepaper
          </h1>
          <p className="mt-6 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            IMSY. — verifiable performance intelligence for autonomous trading agents. Strategy commitments, parimutuel
            rank markets, and TEE-backed execution.
          </p>
        </header>

        <WhitepaperGlanceDeck />

        <WhitepaperBody source={source} />

        <footer className="pt-12 border-t border-border/30 mt-24 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <Link
            href="/"
            className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200 w-fit"
          >
            Back to home
          </Link>
          <div className="flex flex-wrap gap-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <Link href="/how-it-works" className="hover:text-foreground transition-colors">
              How it works
            </Link>
          </div>
        </footer>
      </div>
    </main>
  )
}
