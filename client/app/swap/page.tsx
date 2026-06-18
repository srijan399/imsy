"use client"

import { useState } from "react"
import Link from "next/link"
import { formatEther, parseEther } from "viem"
import { useAccount, useBalance, usePublicClient } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { MarketingHeader } from "@/components/marketing-header"
import { SectionLabel } from "@/components/marketing-section-label"
import {
  useSandboxRouterAddress,
  useSandboxUsdAddress,
  useSwapNativeForUsd,
  useSwapUsdForNative,
  useUsdBalance,
} from "@/hooks/contracts/use-factory"
import { formatUsdCompact, USD_PER_NATIVE, usdToScaled } from "@/lib/web3/peg"
import { waitForTransactionReceiptSafe } from "@/lib/web3/wait"

const inp =
  "w-full bg-card border border-border/40 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none transition-colors"

const btn =
  "w-full py-3 font-mono text-xs uppercase tracking-widest border border-accent text-accent hover:bg-accent/10 disabled:border-border/30 disabled:text-muted-foreground/40 disabled:cursor-not-allowed"

export default function SwapPage() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const router = useSandboxRouterAddress()
  const usd = useSandboxUsdAddress()
  const nativeBal = useBalance({ address })
  const usdBal = useUsdBalance(address)

  const routerAddress = router.data as `0x${string}` | undefined
  const sUsdAddress = usd.data as `0x${string}` | undefined

  const buy = useSwapNativeForUsd(routerAddress)
  const sell = useSwapUsdForNative(routerAddress, sUsdAddress)

  const [buyAmount, setBuyAmount] = useState("0.001")
  const [sellAmount, setSellAmount] = useState("1000000")
  const [busy, setBusy] = useState<"buy" | "sell" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastTx, setLastTx] = useState<string | null>(null)

  async function doBuy() {
    setError(null)
    setBusy("buy")
    setLastTx(null)
    try {
      if (!publicClient) throw new Error("RPC not ready")
      const wei = parseEther(buyAmount)
      const { hash } = await buy.submit({ amountWei: wei })
      const receipt = await waitForTransactionReceiptSafe(publicClient, { hash })
      if (receipt.status !== "success") throw new Error("buy failed")
      setLastTx(hash)
      await usdBal.refetch()
      await nativeBal.refetch()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function doSell() {
    setError(null)
    setBusy("sell")
    setLastTx(null)
    try {
      if (!publicClient) throw new Error("RPC not ready")
      const usdScaled = usdToScaled(Number(sellAmount))
      if (usdScaled === 0n) throw new Error("Enter a positive amount")
      const { hash } = await sell.submit({ amountUsdScaled: usdScaled })
      const receipt = await waitForTransactionReceiptSafe(publicClient, { hash })
      if (receipt.status !== "success") throw new Error("sell failed")
      setLastTx(hash)
      await usdBal.refetch()
      await nativeBal.refetch()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const usdPreview = (() => {
    try {
      const n = Number(buyAmount)
      if (!Number.isFinite(n) || n <= 0) return "—"
      return formatUsdCompact(BigInt(Math.floor(n * USD_PER_NATIVE * 1_000_000)) * 10n ** 12n)
    } catch {
      return "—"
    }
  })()

  const nativePreview = (() => {
    try {
      const usd = Number(sellAmount)
      if (!Number.isFinite(usd) || usd <= 0) return "—"
      const native = usd / USD_PER_NATIVE
      return `${native.toFixed(8)} 0G`
    } catch {
      return "—"
    }
  })()

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="dashboard" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full max-w-3xl space-y-12">
        <header>
          <SectionLabel>Sandbox swap</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">Buy sandbox USD</h1>
          <p className="mt-4 max-w-xl font-mono text-xs text-muted-foreground leading-relaxed">
            Convert native testnet 0G into <code>sUSD</code> at the fixed sandbox peg{" "}
            <span className="text-foreground">1 0G = {USD_PER_NATIVE.toLocaleString()} USD</span>. sUSD is a sandbox
            ERC-20 minted by the IMSY router; it is not a real stablecoin. Use it to fund agents and watch the live
            chart go nuclear.
          </p>
        </header>

        {!address ? (
          <div className="border border-border/40 p-6 space-y-3">
            <p className="font-mono text-xs text-muted-foreground">Connect a wallet to swap.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 font-mono text-xs">
              <div className="border border-border/40 p-4">
                <p className="text-muted-foreground/60">Wallet 0G</p>
                <p className="text-foreground text-sm">
                  {nativeBal.data ? `${formatEther(nativeBal.data.value)} 0G` : "—"}
                </p>
              </div>
              <div className="border border-border/40 p-4">
                <p className="text-muted-foreground/60">Wallet sUSD</p>
                <p className="text-foreground text-sm">
                  {usdBal.data !== undefined ? formatUsdCompact(usdBal.data as bigint) : "—"}
                </p>
              </div>
            </div>

            <section className="grid md:grid-cols-2 gap-6">
              <div className="border border-border/40 p-6 space-y-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Get sandbox USD
                </p>
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block">
                  Native (0G)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={buyAmount}
                  onChange={(e) => setBuyAmount(e.target.value)}
                  className={inp}
                />
                <p className="font-mono text-[10px] text-muted-foreground/70">
                  Receive ≈ <span className="text-foreground">{usdPreview}</span> sUSD
                </p>
                <button type="button" onClick={doBuy} disabled={busy !== null} className={btn}>
                  {busy === "buy" ? "Swapping…" : "Buy sUSD"}
                </button>
              </div>

              <div className="border border-border/40 p-6 space-y-4">
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  Cash out to 0G
                </p>
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block">
                  USD amount
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(e.target.value)}
                  className={inp}
                />
                <p className="font-mono text-[10px] text-muted-foreground/70">
                  Receive ≈ <span className="text-foreground">{nativePreview}</span>. Subject to router native reserves.
                </p>
                <button type="button" onClick={doSell} disabled={busy !== null} className={btn}>
                  {busy === "sell" ? "Swapping…" : "Sell sUSD"}
                </button>
              </div>
            </section>

            {lastTx && (
              <p className="font-mono text-[10px] text-emerald-400 break-all">tx: {lastTx}</p>
            )}
            {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
          </>
        )}

        <footer className="pt-12 border-t border-border/30 mt-16">
          <Link
            href="/dashboard"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Dashboard
          </Link>
        </footer>
      </div>
    </main>
  )
}
