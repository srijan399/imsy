"use client"

import { cn } from "@/lib/utils"

/** Narrow horizontal-scroll card (Signals / whitepaper deck). */
export function EditorialIssueCard({
  issueNumber,
  meta,
  title,
  note,
  className,
}: {
  issueNumber: number
  meta: string
  title: string
  note: string
  className?: string
}) {
  return (
    <article
      className={cn(
        "group relative flex-shrink-0 w-80",
        "transition-transform duration-500 ease-out",
        "hover:-translate-y-2",
        className,
      )}
    >
      <div className="relative bg-card border border-border/50 md:border-t md:border-l md:border-r-0 md:border-b-0 p-8">
        <div className="absolute -top-px left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

        <div className="flex items-baseline justify-between mb-8">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            No. {String(issueNumber).padStart(2, "0")}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/60 text-right max-w-[140px]">{meta}</span>
        </div>

        <h3 className="font-[var(--font-bebas)] text-4xl tracking-tight mb-4 group-hover:text-accent transition-colors duration-300">
          {title}
        </h3>

        <div className="w-12 h-px bg-accent/60 mb-6 group-hover:w-full transition-all duration-500" />

        <p className="font-mono text-xs text-muted-foreground leading-relaxed">{note}</p>

        <div className="absolute bottom-0 right-0 w-6 h-6 overflow-hidden pointer-events-none">
          <div className="absolute bottom-0 right-0 w-8 h-8 bg-background rotate-45 translate-x-4 translate-y-4 border-t border-l border-border/30" />
        </div>
      </div>

      <div className="absolute inset-0 -z-10 translate-x-1 translate-y-1 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
    </article>
  )
}
