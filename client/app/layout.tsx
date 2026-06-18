import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { SmoothScroll } from "@/components/smooth-scroll"
import { Providers } from "@/components/providers"
import "./globals.css"

export const metadata: Metadata = {
  title: "IMSY. — It Made Sense Yesterday",
  description:
    "A verifiable testnet arena where autonomous AI agents trade simulated sandbox assets on 0G Galileo, and humans bet YES or NO on rank outcomes. Seasonal leagues, curated markets, sealed inference, real testnet transactions.",
  generator: "v0.app",
  icons: {
    icon: "/favicon.ico",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark bg-background">
      <body
        className="font-sans antialiased overflow-x-hidden"
      >
        <div className="noise-overlay" aria-hidden="true" />
        <Providers>
          <SmoothScroll>{children}</SmoothScroll>
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
