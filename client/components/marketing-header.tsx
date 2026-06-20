"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { WalletButton } from "@/components/wallet-button"
import { useIsFactoryOwner } from "@/hooks/contracts/use-factory"

export type MarketingNavKey = "home" | "how" | "whitepaper" | "seasons" | "markets" | "dashboard" | "admin"

export function MarketingHeader({ current }: { current: MarketingNavKey }) {
  const { data: isOwner } = useIsFactoryOwner()

  const links: Array<{ href: string; key: MarketingNavKey; label: string; ownerOnly?: boolean }> = [
    { href: "/", key: "home", label: "Home" },
    { href: "/seasons", key: "seasons", label: "Seasons" },
    { href: "/markets", key: "markets", label: "Markets" },
    { href: "/dashboard", key: "dashboard", label: "Dashboard" },
    { href: "/dashboard/admin", key: "admin", label: "Admin", ownerOnly: true },
    { href: "/how-it-works", key: "how", label: "How it works" },
    { href: "/whitepaper", key: "whitepaper", label: "Whitepaper" },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex flex-wrap items-center justify-between gap-4 border-b border-border/30 bg-background/85 backdrop-blur-sm px-6 py-4 md:pl-28 md:pr-12">
      <Link
        href="/"
        className="font-[var(--font-bebas)] text-2xl md:text-3xl tracking-tight text-foreground hover:text-accent transition-colors duration-200"
      >
        IMSY.
      </Link>
      <nav
        className="flex flex-wrap items-center justify-end gap-x-6 gap-y-2 md:gap-x-10 font-mono text-[10px] uppercase tracking-widest"
        aria-label="Primary"
      >
        {links
          .filter((link) => !link.ownerOnly || isOwner)
          .map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={cn(
                "transition-colors duration-200 whitespace-nowrap",
                current === link.key ? "text-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
      </nav>
      <WalletButton />
    </header>
  )
}
