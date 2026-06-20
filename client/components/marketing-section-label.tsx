import type { ReactNode } from "react"

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">{children}</span>
}
