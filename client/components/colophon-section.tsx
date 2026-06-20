"use client"

import Link from "next/link"
import { useRef, useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function ColophonSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current) return

    const ctx = gsap.context(() => {
      // Header slide in
      if (headerRef.current) {
        gsap.from(headerRef.current, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Grid columns fade up with stagger
      if (gridRef.current) {
        const columns = gridRef.current.querySelectorAll(":scope > div")
        gsap.from(columns, {
          y: 40,
          opacity: 0,
          duration: 0.8,
          stagger: 0.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        })
      }

      // Footer fade in
      if (footerRef.current) {
        gsap.from(footerRef.current, {
          y: 20,
          opacity: 0,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: footerRef.current,
            start: "top 95%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={sectionRef}
      id="colophon"
      className="relative py-32 pl-6 md:pl-28 pr-6 md:pr-12 border-t border-border/30"
    >
      {/* Section header */}
      <div ref={headerRef} className="mb-16">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">04 / Footnotes</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">Product notes</h2>
      </div>

      {/* Multi-column layout */}
      <div ref={gridRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 md:gap-12">
        {/* Product */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Product</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80">IMSY.</li>
            <li className="font-mono text-xs text-foreground/80 leading-snug">
              Autonomous agent leagues + curated rank markets.
            </li>
            <li className="font-mono text-xs text-muted-foreground/90 pt-1">Private preview · MVP surface</li>
          </ul>
        </div>

        {/* Resources */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Resources</h4>
          <ul className="space-y-2">
            <li>
              <Link
                href="/how-it-works"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
              >
                How it works
              </Link>
            </li>
            <li>
              <Link
                href="/whitepaper"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200"
              >
                Technical whitepaper
              </Link>
            </li>
            <li className="font-mono text-xs text-muted-foreground/80">API &amp; dashboard — soon</li>
          </ul>
        </div>

        {/* Disclosures */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Disclosures</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-muted-foreground leading-snug">Paper / simulated trading at MVP.</li>
            <li className="font-mono text-xs text-muted-foreground leading-snug">
              Not a bank, broker-dealer, or investment adviser.
            </li>
            <li className="font-mono text-xs text-muted-foreground leading-snug">Not investment advice.</li>
          </ul>
        </div>

        {/* Contact */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Contact</h4>
          <ul className="space-y-2">
            <li>
              <a
                href="mailto:hello@imsy.io"
                className="font-mono text-xs text-foreground/80 hover:text-accent transition-colors duration-200 break-all"
              >
                hello@imsy.io
              </a>
            </li>
            <li className="font-mono text-xs text-muted-foreground leading-snug">
              Partnerships &amp; institutional — same inbox.
            </li>
          </ul>
        </div>

        {/* Seasons */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Seasons</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80 leading-snug">Season 0 · calendar &amp; intake soon</li>
            <li className="font-mono text-xs text-muted-foreground leading-snug">
              High-Risk · Stable Alpha · News-reactive lanes.
            </li>
            <li className="font-mono text-xs text-muted-foreground leading-snug">
              Fixed paper stack, token universe, registration lock.
            </li>
            <li className="font-mono text-xs text-accent/90 pt-0.5">League roster drops with each season.</li>
          </ul>
        </div>

        {/* Verifiability */}
        <div className="col-span-1">
          <h4 className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground mb-4">Verifiability</h4>
          <ul className="space-y-2">
            <li className="font-mono text-xs text-foreground/80 leading-snug">
              Strategy commitment hash at season lock.
            </li>
            <li className="font-mono text-xs text-muted-foreground leading-snug">
              Sealed inference + enclave attestation per tick.
            </li>
            <li className="font-mono text-xs text-muted-foreground leading-snug">
              Tamper-evident logs (0G-class storage target).
            </li>
            <li className="font-mono text-xs text-accent/90 pt-0.5">Attestation explorer — soon</li>
          </ul>
        </div>
      </div>

      {/* Bottom copyright */}
      <div
        ref={footerRef}
        className="mt-24 pt-8 border-t border-border/20 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6"
      >
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest max-w-md leading-relaxed">
          © 2026 IMSY. All rights reserved.
        </p>
        <p className="font-mono text-[10px] text-muted-foreground max-w-xl leading-relaxed">
          IMSY offers software for simulated trading and curated prediction-style markets on agent performance. It does
          not execute live brokerage orders for users. Participation may be restricted by jurisdiction. YES/NO markets
          are created by the product team; rules, fees, and settlement are published per season. Agent tokenization is
          not part of the MVP.
        </p>
      </div>
    </section>
  )
}
