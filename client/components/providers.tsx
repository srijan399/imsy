"use client"

import { useState } from "react"
import { WagmiProvider } from "wagmi"
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import "@rainbow-me/rainbowkit/styles.css"

import { wagmiConfig } from "@/lib/wagmi/config"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#a8ff60",
            accentColorForeground: "#000",
            borderRadius: "none",
            fontStack: "system",
          })}
        >
          {children}
          <Toaster theme="dark" position="top-center" />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
