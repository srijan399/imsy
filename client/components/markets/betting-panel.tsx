"use client"

import { useState } from "react"
import { useAccount, usePublicClient } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { cn } from "@/lib/utils"
import { usePlaceBet } from "@/hooks/contracts/use-market"
import { waitForTransactionReceiptSafe } from "@/lib/web3/wait"

interface BettingPanelProps {
  contractAddress: `0x${string}`
  question: string
  yesPool: number
  noPool: number
  status: string
  onBetPlaced?: (side: "yes" | "no", amount: number, txHash: string) => void
}

export function BettingPanel({
  contractAddress,
  question,
  yesPool,
  noPool,
  status,
  onBetPlaced,
}: BettingPanelProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const placeBet = usePlaceBet(contractAddress)

  const [side, setSide] = useState<"yes" | "no">("yes")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = yesPool + noPool
  const yesPct = total > 0 ? (yesPool / total) * 100 : 50
  const noPct = 100 - yesPct

  const userStake = parseFloat(amount) || 0
  const newTotal = total + userStake

  const potentialPayout = userStake > 0
    ? side === "yes"
      ? (userStake / (yesPool + userStake)) * (newTotal * 0.98)
      : (userStake / (noPool + userStake)) * (newTotal * 0.98)
    : 0

  const isOpen = status === "open"

  async function handleBet() {
    if (!isOpen || userStake <= 0 || !address || !publicClient) return
    setLoading(true)
    setError(null)

    try {
      const { hash } = await placeBet.submit(side, amount)
      const receipt = await waitForTransactionReceiptSafe(publicClient, { hash })
      if (receipt.status !== "success") throw new Error("Bet transaction failed")

      const response = await fetch("/api/bets/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          market_contract: contractAddress,
          side,
          stake: amount,
          tx_hash: hash,
          implied_odds_at_bet: side === "yes" ? yesPct : noPct,
        }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Bet indexing failed" }))
        throw new Error(body.error ?? "Bet indexing failed")
      }

      onBetPlaced?.(side, userStake, hash)
      setAmount("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bet failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="border border-border/40 p-6 space-y-6">
      <div className="space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Place bet</span>
        <p className="font-mono text-sm text-foreground">{question}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setSide("yes")}
          className={cn(
            "p-3 border font-mono text-sm uppercase tracking-wider transition-all duration-200",
            side === "yes"
              ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
              : "border-border/40 text-muted-foreground hover:border-emerald-500/50",
          )}
        >
          YES · {yesPct.toFixed(0)}%
        </button>
        <button
          onClick={() => setSide("no")}
          className={cn(
            "p-3 border font-mono text-sm uppercase tracking-wider transition-all duration-200",
            side === "no"
              ? "border-red-500 text-red-400 bg-red-500/10"
              : "border-border/40 text-muted-foreground hover:border-red-500/50",
          )}
        >
          NO · {noPct.toFixed(0)}%
        </button>
      </div>

      <div className="space-y-1">
        <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Stake (0G)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          className="w-full bg-card border border-border/40 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none transition-colors"
          disabled={!isOpen}
        />
      </div>

      {userStake > 0 && (
        <div className="flex justify-between font-mono text-xs text-muted-foreground border-t border-border/30 pt-3">
          <span>Est. payout</span>
          <span className="text-foreground">{potentialPayout.toFixed(4)} 0G</span>
        </div>
      )}

      {!address ? (
        <ConnectButton />
      ) : (
        <button
          onClick={handleBet}
          disabled={!isOpen || userStake <= 0 || loading}
          className={cn(
            "w-full py-3 font-mono text-xs uppercase tracking-widest border transition-all duration-200",
            isOpen && userStake > 0
              ? side === "yes"
                ? "border-emerald-500 text-emerald-400 hover:bg-emerald-500/10"
                : "border-red-500 text-red-400 hover:bg-red-500/10"
              : "border-border/30 text-muted-foreground/40 cursor-not-allowed",
          )}
        >
          {loading ? "Confirming..." : !isOpen ? "Market closed" : `Bet ${side.toUpperCase()}`}
        </button>
      )}
      {error && <p className="font-mono text-[10px] leading-relaxed text-red-400">{error}</p>}
    </div>
  )
}
