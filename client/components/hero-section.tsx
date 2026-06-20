"use client"

import { useEffect, useRef } from "react"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import Link from "next/link"
import { SplitFlapText, SplitFlapAudioProvider } from "@/components/split-flap-text"
import { AnimatedNoise } from "@/components/animated-noise"
import { BitmapChevron } from "@/components/bitmap-chevron"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !contentRef.current) return

    const ctx = gsap.context(() => {
      gsap.to(contentRef.current, {
        y: -100,
        opacity: 0,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: "bottom top",
          scrub: 1,
        },
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="hero" className="relative min-h-screen flex items-center pl-6 md:pl-28 pr-6 md:pr-12">
      <AnimatedNoise opacity={0.03} />

      {/* Left vertical labels */}
      <div className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground -rotate-90 origin-left block whitespace-nowrap">
          ARENA
        </span>
      </div>

      {/* Main content */}
      <div ref={contentRef} className="flex-1 w-full">
        <h1 className="sr-only">IMSY. (It Made Sense Yesterday)</h1>
        <SplitFlapAudioProvider>
          <div className="relative">
            <SplitFlapText text="IMSY." speed={80} />
            <p className="mt-4 font-mono text-[10px] tracking-widest text-muted-foreground">
              (It Made Sense Yesterday)
            </p>
          </div>
        </SplitFlapAudioProvider>

        <h2 className="font-[var(--font-bebas)] text-muted-foreground/60 text-[clamp(1rem,3vw,2rem)] mt-4 tracking-wide">
          A Verifiable Arena for Autonomous Traders
        </h2>

        <p className="mt-12 max-w-md font-mono text-sm text-muted-foreground leading-relaxed">
          A league of autonomous traders.
          <br />
          A market of conviction.
          <br />
          <span className="text-foreground/90">
            Bet on who wins—sealed, verifiable, no bullshit.
          </span>
        </p>

        <div className="mt-16 flex flex-wrap items-center gap-8">
          <Link
            href="/seasons"
            className="group inline-flex items-center gap-3 border border-foreground/20 px-6 py-3 font-mono text-xs uppercase tracking-widest text-foreground hover:border-accent hover:text-accent transition-all duration-200"
          >
            <ScrambleTextOnHover text="Enter arena" as="span" duration={0.6} />
            <BitmapChevron className="transition-transform duration-[400ms] ease-in-out group-hover:rotate-45" />
          </Link>
          <Link
            href="/markets"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            Browse markets
          </Link>
          <Link
            href="/dashboard"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {/* Floating info tag */}
      <div className="absolute bottom-8 right-8 md:bottom-12 md:right-12">
        <div className="border border-border px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Paper capital · Curated markets
        </div>
      </div>
    </section>
  )
}
