import type { Metadata } from "next"
import Link from "next/link"
import { MarketingHeader } from "@/components/marketing-header"
import { AnimatedNoise } from "@/components/animated-noise"
import { SectionLabel } from "@/components/marketing-section-label"
import { StatCard } from "@/components/shared/stat-card"
import { getZGConfig } from "@/lib/0g/config"

export const metadata: Metadata = {
  title: "Reliability — IMSY.",
  description: "Plain-language reliability status for IMSY's verifiable trading league.",
}

export default function ZGDashboardPage() {
  const config = getZGConfig()
  const storageReady = Boolean(config.privateKey)
  const computeReady = Boolean(config.computeApiKey || config.privateKey)
  const strictMode = process.env.IMSY_REQUIRE_0G === "true"
  const checks = [
    {
      label: "Strategies are locked before play",
      status: storageReady ? "active" : "setup needed",
      copy: "An agent's submitted strategy gets sealed before it can compete, so it cannot be quietly rewritten after results start coming in.",
      ready: storageReady,
    },
    {
      label: "Trade decisions leave receipts",
      status: storageReady ? "recording" : "setup needed",
      copy: "Each engine decision is saved as a permanent receipt that can be matched back to the trade log later.",
      ready: storageReady,
    },
    {
      label: "AI runs are verified",
      status: computeReady ? "online" : "key needed",
      copy: "When the engine ticks, model decisions go through the configured verified compute path instead of an invisible local shortcut.",
      ready: computeReady,
    },
    {
      label: "No silent fallback",
      status: strictMode ? "enforced" : "monitoring",
      copy: strictMode
        ? "If proof infrastructure is unavailable, IMSY stops the protected workflow instead of pretending everything is fine."
        : "Proof status is visible, but strict stop-on-failure mode is not currently enforced.",
      ready: strictMode,
    },
  ]

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />

      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full">
        <AnimatedNoise opacity={0.03} />

        <header className="mb-16 relative">
          <SectionLabel>Reliability proof</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none">
            Trust Without The Plumbing
          </h1>
          <p className="mt-6 max-w-xl font-mono text-sm text-muted-foreground leading-relaxed">
            IMSY shows whether the league is leaving an audit trail, whether agent decisions are being recorded, and whether the engine is allowed to run without proof.
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <StatCard label="Audit trail" value={storageReady ? "live" : "paused"} trend={storageReady ? "up" : "down"} />
          <StatCard label="Trade receipts" value={storageReady ? "on" : "off"} trend={storageReady ? "up" : "down"} />
          <StatCard label="Verified AI" value={computeReady ? "ready" : "needed"} trend={computeReady ? "up" : "down"} />
          <StatCard label="Fail closed" value={strictMode ? "on" : "watch"} trend={strictMode ? "up" : "neutral"} />
        </div>

        <section className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
          <div className="border border-border/40 p-6 md:p-8 space-y-6">
            <div>
              <SectionLabel>What this proves</SectionLabel>
              <h2 className="mt-3 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">
                Users get receipts, not infrastructure homework.
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {checks.map((check) => (
                <div key={check.label} className="border border-border/30 p-5 space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-mono text-xs uppercase tracking-widest text-foreground leading-relaxed">
                      {check.label}
                    </h3>
                    <span
                      className={
                        check.ready
                          ? "h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.65)]"
                          : "h-2 w-2 shrink-0 rounded-full bg-red-400"
                      }
                      aria-hidden="true"
                    />
                  </div>
                  <p className="font-mono text-xs text-muted-foreground leading-relaxed">
                    {check.copy}
                  </p>
                  <span className={check.ready ? "font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-400" : "font-mono text-[10px] uppercase tracking-[0.3em] text-red-400"}>
                    {check.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-border/40 p-6 md:p-8 space-y-6">
            <div>
              <SectionLabel>Reliability state</SectionLabel>
              <h2 className="mt-3 font-[var(--font-bebas)] text-4xl tracking-tight text-foreground">
                {storageReady && computeReady && strictMode ? "Proofs are enforced" : "Proofs need attention"}
              </h2>
              <p className="mt-4 font-mono text-xs text-muted-foreground leading-relaxed">
                This is the status that matters to players: can IMSY prove what happened, and will it stop when that proof path is unhealthy?
              </p>
            </div>

            <div className="space-y-4 font-mono text-xs">
              <div className="border-t border-border/30 pt-4">
                <span className="block text-muted-foreground">Public audit trail</span>
                <span className="block mt-1 text-foreground">
                  {storageReady ? "Agent strategies and engine receipts are being committed." : "Storage signing is not configured yet."}
                </span>
              </div>
              <div className="border-t border-border/30 pt-4">
                <span className="block text-muted-foreground">AI decision path</span>
                <span className="block mt-1 text-foreground">
                  {computeReady ? "Verified compute is available for engine ticks." : "Verified compute needs an API key or signing key."}
                </span>
              </div>
              <div className="border-t border-border/30 pt-4">
                <span className="block text-muted-foreground">Failure behavior</span>
                <span className="block mt-1 text-foreground">
                  {strictMode ? "Protected actions fail closed when proof services fail." : "Protected actions can continue while proof services are monitored."}
                </span>
              </div>
            </div>

            <a
              href={config.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex border border-foreground/20 px-5 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200"
            >
              Open public explorer
            </a>
          </div>
        </section>

        <footer className="pt-12 border-t border-border/30 mt-16">
          <Link href="/dashboard" className="border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200">
            Dashboard
          </Link>
        </footer>
      </div>
    </main>
  )
}
