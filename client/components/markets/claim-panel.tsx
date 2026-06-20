"use client"

import { useState } from "react"
import { useAccount, useChainId, useSwitchChain, usePublicClient } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { formatEther } from "viem"
import { useClaim, useUserBets, useMarketSnapshot } from "@/hooks/contracts/use-market"
import { getClientChainConfig } from "@/lib/web3/config"
import { waitForTransactionReceiptSafe } from "@/lib/web3/wait"

interface Props {
  contractAddress: `0x${string}`
  outcome: "yes" | "no" | null | undefined
  resolved: boolean
  onClaimed?: (txHash: string) => void
}

const btn =
  "w-full py-3 font-mono text-xs uppercase tracking-widest border transition-all duration-200 disabled:cursor-not-allowed"

export function ClaimPanel({ contractAddress, outcome, resolved, onClaimed }: Props) {
  if (!resolved) {
    return (
      <div className="border border-border/40 p-6 space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Claim</span>
        <p className="font-mono text-xs text-muted-foreground">
          Market is not resolved yet. Claim becomes available after resolution.
        </p>
      </div>
    )
  }

  return <ResolvedClaimPanel contractAddress={contractAddress} outcome={outcome} onClaimed={onClaimed} />
}

function ResolvedClaimPanel({
  contractAddress,
  outcome,
  onClaimed,
}: {
  contractAddress: `0x${string}`
  outcome: "yes" | "no" | null | undefined
  onClaimed?: (txHash: string) => void
}) {
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const publicClient = usePublicClient()
  const expectedChainId = getClientChainConfig().chainId
  const { yesWei, noWei, claimed, isLoading, refetch } = useUserBets(contractAddress, address)
  const claim = useClaim(contractAddress)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<string | null>(null)

  if (!address) {
    return (
      <div className="border border-border/40 p-6 space-y-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Claim</span>
        <p className="font-mono text-xs text-muted-foreground">Connect a wallet to check your payout.</p>
        <ConnectButton />
      </div>
    )
  }

  if (chainId !== expectedChainId) {
    return (
      <div className="border border-border/40 p-6 space-y-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Claim</span>
        <p className="font-mono text-xs text-muted-foreground">
          Wrong network. Switch to chain {expectedChainId} to claim.
        </p>
        <button
          type="button"
          onClick={() => switchChain({ chainId: expectedChainId })}
          disabled={switching}
          className={`${btn} border-accent text-accent hover:bg-accent/10`}
        >
          {switching ? "Switching…" : "Switch network"}
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="border border-border/40 p-6 space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Claim</span>
        <p className="font-mono text-xs text-muted-foreground animate-pulse">Loading your position…</p>
      </div>
    )
  }

  const userWinSide = outcome === "yes" ? yesWei : outcome === "no" ? noWei : 0n
  const userLoseSide = outcome === "yes" ? noWei : outcome === "no" ? yesWei : 0n
  const hasWinningStake = userWinSide > 0n
  const hasAnyStake = yesWei > 0n || noWei > 0n

  if (claimed) {
    return (
      <div className="border border-border/40 p-6 space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Claim</span>
        <p className="font-mono text-xs text-emerald-400">Payout already claimed.</p>
        <p className="font-mono text-[10px] text-muted-foreground">
          Your YES stake: {formatEther(yesWei)} 0G · NO stake: {formatEther(noWei)} 0G
        </p>
      </div>
    )
  }

  if (!hasAnyStake) {
    return (
      <div className="border border-border/40 p-6 space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Claim</span>
        <p className="font-mono text-xs text-muted-foreground">
          You did not stake on this market. Outcome: {outcome?.toUpperCase() ?? "unresolved"}.
        </p>
      </div>
    )
  }

  if (!hasWinningStake) {
    return (
      <div className="border border-border/40 p-6 space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Claim</span>
        <p className="font-mono text-xs text-red-400">
          Bet lost. Your stake on the losing side: {formatEther(userLoseSide)} 0G.
        </p>
      </div>
    )
  }

  async function handle() {
    setError(null)
    setBusy(true)
    setTxHash(null)
    try {
      if (!publicClient) throw new Error("RPC client not ready")
      const { hash } = await claim.submit()
      const receipt = await waitForTransactionReceiptSafe(publicClient, { hash })
      if (receipt.status !== "success") throw new Error("Claim transaction failed on-chain")
      setTxHash(hash)
      await refetch()
      onClaimed?.(hash)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border border-emerald-500/40 bg-emerald-500/5 p-6 space-y-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-400">Claim available</span>
      <div className="space-y-1 font-mono text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Outcome</span>
          <span className="text-emerald-400">{outcome?.toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Your winning stake</span>
          <span className="text-foreground">{formatEther(userWinSide)} 0G</span>
        </div>
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-2">
          Payout = (your stake / winning pool) × (total pool − 2% platform fee).
        </p>
      </div>
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className={`${btn} border-emerald-500 text-emerald-400 hover:bg-emerald-500/10`}
      >
        {busy ? "Claiming…" : "Claim payout"}
      </button>
      {txHash && (
        <p className="font-mono text-[10px] text-emerald-400 break-all">
          Claim tx: {txHash}
        </p>
      )}
      {error && <p className="font-mono text-[10px] text-red-400 leading-relaxed">{error}</p>}
    </div>
  )
}
