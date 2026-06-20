"use client"

import { Wallet } from "lucide-react"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { cn } from "@/lib/utils"

export function WalletButton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <ConnectButton.Custom>
        {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted, authenticationStatus }) => {
          const ready = mounted && authenticationStatus !== "loading"
          const connected = ready && account && chain && (!authenticationStatus || authenticationStatus === "authenticated")

          if (!ready) {
            return <button type="button" className={baseBtn(false)} aria-hidden="true" />
          }

          if (!connected) {
            return (
              <button type="button" onClick={openConnectModal} className={baseBtn(false)} title="Connect wallet">
                <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 normal-case">Connect</span>
              </button>
            )
          }

          if (chain.unsupported) {
            return (
              <button type="button" onClick={openChainModal} className={baseBtn(true)} title="Switch network">
                <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="normal-case">Wrong network</span>
              </button>
            )
          }

          return (
            <button type="button" onClick={openAccountModal} className={baseBtn(true)} title="Wallet menu">
              <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 normal-case">
                <span className="truncate">{account.displayName}</span>
                {account.displayBalance && (
                  <>
                    <span className="text-muted-foreground" aria-hidden="true">·</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">{account.displayBalance}</span>
                  </>
                )}
              </span>
            </button>
          )
        }}
      </ConnectButton.Custom>
    </div>
  )
}

function baseBtn(connected: boolean) {
  return cn(
    "inline-flex h-9 max-w-full min-w-0 items-center gap-2 border px-3 font-mono text-[10px] uppercase tracking-widest transition-colors",
    connected
      ? "border-accent/50 text-accent hover:bg-accent/10"
      : "border-border/40 text-muted-foreground hover:border-accent/50 hover:text-foreground",
  )
}
