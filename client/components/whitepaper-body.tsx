"use client"

import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { SectionLabel } from "@/components/marketing-section-label"
import "katex/dist/katex.min.css"

function stripSectionFence(md: string) {
  return md
    .replace(/^\s*---\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function titleSlug(rawLine: string) {
  return rawLine.replace(/^\d+\.\s*/, "").trim()
}

/** Short mono label — not the same as the doc heading. */
const WHITEPAPER_TAGLINES: Record<string, string> = {
  __preamble__: "Cold open",
  Abstract: "Speed-run the thesis",
  Introduction: "Paper over promises",
  "System Architecture": "Stacks & streams",
  "The Agent Subsystem": "Agents on rails",
  "Market Protocol & Mathematics": "Pools & payouts",
  "Cryptographic Verifiability": "Prove the black box",
  "Economic Model & Incentives": "Who eats the fee",
  "Future Extensibility": "Next-season energy",
}

function sectionTagline(slug: string) {
  return WHITEPAPER_TAGLINES[slug] ?? "Deep dive"
}

const bodyComponents: Components = {
  h1: ({ children }) => (
    <h1 className="font-[var(--font-bebas)] text-5xl md:text-7xl lg:text-8xl tracking-tight leading-none text-foreground">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 mb-4 font-[var(--font-bebas)] text-2xl md:text-4xl tracking-tight text-foreground scroll-mt-28">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-10 mb-3 font-[var(--font-bebas)] text-xl md:text-3xl tracking-tight text-foreground/95">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mb-4 font-mono text-sm text-muted-foreground leading-relaxed last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-medium text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-muted-foreground/90">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="my-8 border-l-2 border-accent pl-6 py-1 space-y-2 [&_p]:text-foreground/85 [&_p]:font-mono [&_p]:text-sm">
      {children}
    </blockquote>
  ),
  hr: () => null,
  ul: ({ children }) => (
    <ul className="my-4 ml-1 list-disc pl-6 space-y-2 font-mono text-sm text-muted-foreground leading-relaxed marker:text-accent">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-4 ml-1 list-decimal pl-6 space-y-3 font-mono text-sm text-muted-foreground leading-relaxed marker:text-accent">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes("language-")
    if (isBlock) {
      return (
        <code
          className={`block my-4 overflow-x-auto rounded border border-border/40 bg-card/40 p-4 font-mono text-xs text-foreground ${className ?? ""}`}
          {...props}
        >
          {children}
        </code>
      )
    }
    return (
      <code
        className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-accent [overflow-wrap:anywhere]"
        {...props}
      >
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="mb-4 overflow-x-auto rounded border border-border/40 bg-card/40 p-4">{children}</pre>
  ),
}

function MarkdownChunk({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={bodyComponents}
    >
      {children}
    </ReactMarkdown>
  )
}

export function WhitepaperBody({ source }: { source: string }) {
  const chunks = source.split(/^## /m)
  const [preambleRaw, ...sectionRaw] = chunks
  const preamble = stripSectionFence(preambleRaw.trim().replace(/^#\s+[^\n]+(\n+|$)/m, "").trim())

  const sections = sectionRaw.map((block) => {
    const trimmed = block.trim()
    const nl = trimmed.indexOf("\n")
    const titleLine = nl === -1 ? trimmed : trimmed.slice(0, nl)
    const body = stripSectionFence(nl === -1 ? "" : trimmed.slice(nl + 1))
    return { titleLine, body, slug: titleSlug(titleLine) }
  })

  return (
    <article className="max-w-none pb-8 [&_.katex]:text-foreground [&_.katex-display]:my-6 [&_.katex-display]:block [&_.katex-display]:max-w-full [&_.katex-display]:overflow-x-auto">
      {preamble ? (
        <section className="mb-20 space-y-4">
          <SectionLabel>00 / {WHITEPAPER_TAGLINES.__preamble__}</SectionLabel>
          <MarkdownChunk>{preamble}</MarkdownChunk>
        </section>
      ) : null}

      {sections.map((sec, i) => {
        const num = String(i + 1).padStart(2, "0")
        return (
          <section key={`${num}-${sec.slug}`} className="mb-20 space-y-4">
            <SectionLabel>
              {num} / {sectionTagline(sec.slug)}
            </SectionLabel>
            <h2 className="font-[var(--font-bebas)] text-3xl md:text-5xl tracking-tight text-foreground scroll-mt-28">
              {sec.titleLine}
            </h2>
            {sec.body ? <MarkdownChunk>{sec.body}</MarkdownChunk> : null}
          </section>
        )
      })}
    </article>
  )
}
