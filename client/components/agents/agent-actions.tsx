"use client"

import { useState } from "react"
import { useAccount } from "wagmi"
import {
  useDepositAgent,
  useSandboxUsdAddress,
  useTransferAgent,
  useWithdrawAgent,
} from "@/hooks/contracts/use-factory"
import { usdToScaled } from "@/lib/web3/peg"

interface Props {
  agentId: number
  ownerWallet: string
  leagues: string[]
}

const inp =
  "w-full bg-card border border-border/40 px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none"

const btn =
  "px-4 py-2 border border-accent text-accent font-mono text-[10px] uppercase tracking-widest hover:bg-accent/10 disabled:border-border/30 disabled:text-muted-foreground/40 disabled:cursor-not-allowed"

export function AgentActions({ agentId, ownerWallet, leagues: _leagues }: Props) {
  const { address } = useAccount()
  const isOwner = Boolean(address && address.toLowerCase() === ownerWallet.toLowerCase())
  const id = BigInt(agentId)
  const deposit = useDepositAgent(id)
  const withdraw = useWithdrawAgent(id)
  const transfer = useTransferAgent(id)
  const sUsd = useSandboxUsdAddress()
  const sUsdAddress = sUsd.data as `0x${string}` | undefined

  const [depositAmount, setDepositAmount] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [newOwner, setNewOwner] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  if (!isOwner) {
    return (
      <p className="border border-border/40 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Connect as {ownerWallet.slice(0, 8)}… to manage this agent.
      </p>
    )
  }

  async function handle(action: "deposit" | "withdraw" | "transfer") {
    setError(null)
    setBusy(action)
    try {
      if (action === "deposit") {
        if (!sUsdAddress) throw new Error("sUSD address not configured on factory")
        const scaled = usdToScaled(Number(depositAmount))
        if (scaled === 0n) throw new Error("Enter a positive USD amount")
        await deposit.submit(scaled, sUsdAddress)
      }
      if (action === "withdraw") {
        const scaled = usdToScaled(Number(withdrawAmount))
        if (scaled === 0n) throw new Error("Enter a positive USD amount")
        await withdraw.submit(scaled)
      }
      if (action === "transfer") await transfer.submit(newOwner as `0x${string}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="border border-border/40 p-6 grid md:grid-cols-3 gap-6">
      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Deposit sUSD</p>
        <input
          type="number"
          step="1"
          min="0"
          value={depositAmount}
          onChange={(e) => setDepositAmount(e.target.value)}
          placeholder="100000"
          className={inp}
        />
        <button
          type="button"
          onClick={() => handle("deposit")}
          disabled={!depositAmount || busy === "deposit"}
          className={btn}
        >
          {busy === "deposit" ? "Approving + sending…" : "Deposit"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Withdraw sUSD</p>
        <input
          type="number"
          step="1"
          min="0"
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          placeholder="50000"
          className={inp}
        />
        <button
          type="button"
          onClick={() => handle("withdraw")}
          disabled={!withdrawAmount || busy === "withdraw"}
          className={btn}
        >
          {busy === "withdraw" ? "Sending…" : "Withdraw"}
        </button>
      </div>

      <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Transfer ownership</p>
        <input
          type="text"
          value={newOwner}
          onChange={(e) => setNewOwner(e.target.value)}
          placeholder="0x…"
          className={inp}
        />
        <button
          type="button"
          onClick={() => handle("transfer")}
          disabled={!newOwner.startsWith("0x") || newOwner.length !== 42 || busy === "transfer"}
          className={btn}
        >
          {busy === "transfer" ? "Sending…" : "Transfer"}
        </button>
      </div>

      {error && <p className="md:col-span-3 font-mono text-[10px] text-red-400">{error}</p>}
    </section>
  )
}
