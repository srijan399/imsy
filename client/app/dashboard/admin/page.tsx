"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useAccount, usePublicClient } from "wagmi"
import { ConnectButton } from "@rainbow-me/rainbowkit"
import { decodeEventLog } from "viem"
import { MarketingHeader } from "@/components/marketing-header"
import { SectionLabel } from "@/components/marketing-section-label"
import {
  useCreateLeague,
  useCreateSeason,
  useFactoryExecutor,
  useIsFactoryOwner,
  useLeagues,
  useSeasons,
  useSetExecutor,
} from "@/hooks/contracts/use-factory"
import { factoryAbi } from "@/lib/web3/abis"

const inp =
  "w-full bg-card border border-border/40 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-accent focus:outline-none transition-colors"

const btn =
  "px-6 py-3 border border-accent text-accent font-mono text-xs uppercase tracking-widest hover:bg-accent/10 disabled:border-border/30 disabled:text-muted-foreground/40 disabled:cursor-not-allowed"

function LoadingSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 p-6 font-mono text-xs text-muted-foreground">
      <span className="inline-block size-4 border border-accent/60 border-t-transparent rounded-full animate-spin" />
      {label}
    </div>
  )
}

export default function AdminPage() {
  const { address } = useAccount()
  const { data: isOwner, isLoading: isOwnerLoading } = useIsFactoryOwner()
  const publicClient = usePublicClient()

  if (!address) {
    return (
      <main className="relative min-h-screen">
        <MarketingHeader current="admin" />
        <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
        <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full max-w-3xl space-y-6">
          <SectionLabel>Admin</SectionLabel>
          <h1 className="font-[var(--font-bebas)] text-5xl tracking-tight">Connect a factory owner wallet</h1>
          <ConnectButton />
        </div>
      </main>
    )
  }

  if (isOwnerLoading) {
    return (
      <main className="relative min-h-screen">
        <MarketingHeader current="admin" />
        <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
        <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full max-w-3xl">
          <SectionLabel>Admin</SectionLabel>
          <LoadingSpinner label="Checking permissions…" />
        </div>
      </main>
    )
  }

  if (!isOwner) {
    return (
      <main className="relative min-h-screen">
        <MarketingHeader current="admin" />
        <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
        <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full max-w-3xl">
          <SectionLabel>Admin</SectionLabel>
          <h1 className="font-[var(--font-bebas)] text-5xl tracking-tight mb-6">Not authorised</h1>
          <p className="font-mono text-xs text-muted-foreground">
            The connected wallet is not a factory owner. Ask an existing owner to add it via `addOwner`.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="relative min-h-screen">
      <MarketingHeader current="admin" />
      <div className="grid-bg fixed inset-0 opacity-30" aria-hidden="true" />
      <div className="relative z-10 pt-28 pb-24 pl-6 md:pl-28 pr-6 md:pr-12 w-full max-w-4xl space-y-12">
        <header>
          <SectionLabel>Admin</SectionLabel>
          <h1 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight leading-none">Console</h1>
        </header>

        <SeasonsSection publicClient={publicClient} />
        <LeaguesSection publicClient={publicClient} />
        <MarketsSection />
        <ExecutorSection />

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

function SeasonsSection({ publicClient }: { publicClient: ReturnType<typeof usePublicClient> }) {
  const { address } = useAccount()
  const { seasons, isLoading: isSeasonsLoading, refetch: refetchSeasons } = useSeasons()
  const createSeason = useCreateSeason()
  const [form, setForm] = useState({
    name: "",
    description: "",
    season_start: "",
    season_end: "",
    betting_lock_hours_before_end: 6,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // DB-side seasons list for duplicate name check
  const [dbSeasons, setDbSeasons] = useState<{ name: string }[]>([])
  useEffect(() => {
    fetch("/api/seasons")
      .then((r) => r.json())
      .then((rows) => setDbSeasons(Array.isArray(rows) ? rows : []))
      .catch(() => undefined)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Client-side duplicate name check
    const nameTrimmed = form.name.trim()
    const isDuplicate = dbSeasons.some(
      (s) => s.name.toLowerCase() === nameTrimmed.toLowerCase()
    )
    if (isDuplicate) {
      setError(`A season named "${nameTrimmed}" already exists`)
      return
    }

    setBusy(true)
    try {
      if (!publicClient) throw new Error("Public client not ready")
      const start = new Date(form.season_start)
      const end = new Date(form.season_end)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("Invalid dates")
      const { hash, seasonId } = await createSeason.submit({ name: nameTrimmed, start, end })
      await publicClient.waitForTransactionReceipt({ hash })
      const slug = nameTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      const res = await fetch("/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain_id_hex: seasonId,
          name: nameTrimmed,
          slug,
          description: form.description,
          registration_start: new Date().toISOString(),
          registration_end: form.season_start,
          season_start: form.season_start,
          season_end: form.season_end,
          betting_lock_hours_before_end: form.betting_lock_hours_before_end,
          created_by_wallet: address,
          tx_hash: hash,
          created_on_chain_at: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Indexing failed" }))
        throw new Error(body.error ?? "Indexing failed")
      }
      const newSeason = await res.json().catch(() => null)
      // Update DB seasons list so duplicate check stays fresh
      if (newSeason) setDbSeasons((prev) => [...prev, newSeason])
      setSuccess(`Season "${nameTrimmed}" created successfully`)
      setForm({ name: "", description: "", season_start: "", season_end: "", betting_lock_hours_before_end: 6 })
      // Immediately refresh on-chain list; also retry after 3s in case RPC is slow
      refetchSeasons()
      setTimeout(() => refetchSeasons(), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <SectionLabel>Seasons</SectionLabel>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-4 border border-border/40 p-6">
        <input
          className={inp}
          placeholder="Season name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className={inp}
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          className={inp}
          type="datetime-local"
          value={form.season_start}
          onChange={(e) => setForm({ ...form, season_start: e.target.value })}
          required
        />
        <input
          className={inp}
          type="datetime-local"
          value={form.season_end}
          onChange={(e) => setForm({ ...form, season_end: e.target.value })}
          required
        />
        <input
          className={inp}
          type="number"
          min={0}
          max={168}
          placeholder="Betting lock hours before end"
          value={form.betting_lock_hours_before_end}
          onChange={(e) => setForm({ ...form, betting_lock_hours_before_end: Number(e.target.value) })}
        />
        <div className="md:col-span-2 flex items-center gap-4 flex-wrap">
          <button type="submit" disabled={busy} className={btn}>
            {busy ? "Submitting…" : "Create season"}
          </button>
          {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
          {success && <p className="font-mono text-[10px] text-emerald-400">{success}</p>}
        </div>
      </form>

      <div className="border border-border/40 divide-y divide-border/30">
        {isSeasonsLoading ? (
          <LoadingSpinner label="Loading seasons…" />
        ) : seasons.length === 0 ? (
          <div className="p-4 font-mono text-[10px] text-muted-foreground/60">No seasons yet</div>
        ) : (
          seasons.map((s) => (
            <div key={s.id} className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
              <span className="text-foreground">{s.name}</span>
              <span className="text-muted-foreground break-all">{s.id}</span>
              <span className="text-muted-foreground">
                {new Date(Number(s.start) * 1000).toLocaleDateString()}
              </span>
              <span className="text-muted-foreground">
                {new Date(Number(s.end) * 1000).toLocaleDateString()}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function LeaguesSection({ publicClient }: { publicClient: ReturnType<typeof usePublicClient> }) {
  const { seasons, isLoading: isSeasonsLoading } = useSeasons()
  const { leagues, isLoading: isLeaguesLoading, refetch: refetchLeagues } = useLeagues()
  const createLeague = useCreateLeague()

  // Fetch DB seasons to filter by status
  const [activeSeasonIds, setActiveSeasonIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    fetch("/api/seasons")
      .then((r) => r.json())
      .then((rows: { chain_id_hex: string; status: string }[]) => {
        if (!Array.isArray(rows)) return
        setActiveSeasonIds(
          new Set(rows.filter((s) => s.status === "active" || s.status === "registration").map((s) => s.chain_id_hex.toLowerCase()))
        )
      })
      .catch(() => undefined)
  }, [])

  // Only seasons that are active in the DB
  const activeSeasons = seasons.filter((s) => activeSeasonIds.has(s.id.toLowerCase()))

  const [form, setForm] = useState({
    seasonId: "",
    name: "",
    type: "high_risk",
    asset_universe: "BTC,ETH,SOL",
    allowed_signals: "momentum,RSI",
    max_drawdown_pct: 20,
    max_leverage: 1,
    initial_capital: 1000,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setBusy(true)
    try {
      if (!publicClient) throw new Error("Public client not ready")
      const { hash, leagueId } = await createLeague.submit({
        seasonId: form.seasonId as `0x${string}`,
        name: form.name,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      // Verify event landed; not strictly required, but a guard against stale RPCs.
      let confirmed = false
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics })
          if (parsed.eventName === "LeagueCreated") {
            confirmed = true
            break
          }
        } catch {}
      }
      if (!confirmed) throw new Error("LeagueCreated event missing in receipt")

      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain_id_hex: leagueId,
          season_chain_id_hex: form.seasonId,
          name: form.name,
          type: form.type,
          asset_universe: form.asset_universe.split(",").map((s) => s.trim()).filter(Boolean),
          allowed_signals: form.allowed_signals.split(",").map((s) => s.trim()).filter(Boolean),
          max_drawdown_pct: form.max_drawdown_pct,
          max_leverage: form.max_leverage,
          initial_capital: form.initial_capital,
          tx_hash: hash,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Indexing failed" }))
        throw new Error(body.error ?? "Indexing failed")
      }
      setSuccess(`League "${form.name}" created successfully`)
      setForm({ ...form, name: "" })
      // Auto-refresh on-chain leagues list
      // Immediately refresh on-chain list; also retry after 3s in case RPC is slow
      refetchLeagues()
      setTimeout(() => refetchLeagues(), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <SectionLabel>Leagues</SectionLabel>
      <form onSubmit={submit} className="grid md:grid-cols-2 gap-4 border border-border/40 p-6">
        <select
          className={inp}
          value={form.seasonId}
          onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
          required
          disabled={isSeasonsLoading}
        >
          <option value="">
            {isSeasonsLoading ? "Loading seasons…" : activeSeasons.length === 0 ? "No active seasons" : "Select season"}
          </option>
          {activeSeasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className={inp}
          placeholder="League name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <select
          className={inp}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          <option value="high_risk">high_risk</option>
          <option value="stable_alpha">stable_alpha</option>
          <option value="news_reactive">news_reactive</option>
          <option value="macro">macro</option>
          <option value="speed">speed</option>
          <option value="custom">custom</option>
        </select>
        <input
          className={inp}
          placeholder="Asset universe (csv)"
          value={form.asset_universe}
          onChange={(e) => setForm({ ...form, asset_universe: e.target.value })}
        />
        <input
          className={inp}
          placeholder="Allowed signals (csv)"
          value={form.allowed_signals}
          onChange={(e) => setForm({ ...form, allowed_signals: e.target.value })}
        />
        <div className="grid grid-cols-3 gap-3">
          <input
            className={inp}
            type="number"
            placeholder="Max DD %"
            value={form.max_drawdown_pct}
            onChange={(e) => setForm({ ...form, max_drawdown_pct: Number(e.target.value) })}
          />
          <input
            className={inp}
            type="number"
            placeholder="Lev"
            value={form.max_leverage}
            onChange={(e) => setForm({ ...form, max_leverage: Number(e.target.value) })}
          />
          <input
            className={inp}
            type="number"
            placeholder="Capital"
            value={form.initial_capital}
            onChange={(e) => setForm({ ...form, initial_capital: Number(e.target.value) })}
          />
        </div>
        <div className="md:col-span-2 flex items-center gap-4 flex-wrap">
          <button type="submit" disabled={busy} className={btn}>
            {busy ? "Submitting…" : "Create league"}
          </button>
          {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
          {success && <p className="font-mono text-[10px] text-emerald-400">{success}</p>}
        </div>
      </form>

      <div className="border border-border/40 divide-y divide-border/30">
        {isLeaguesLoading ? (
          <LoadingSpinner label="Loading leagues…" />
        ) : leagues.length === 0 ? (
          <div className="p-4 font-mono text-[10px] text-muted-foreground/60">No leagues yet</div>
        ) : (
          leagues.map((l) => (
            <div key={l.id} className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 font-mono text-xs">
              <span className="text-foreground">{l.name}</span>
              <span className="text-muted-foreground break-all">{l.id}</span>
              <span className="text-muted-foreground break-all">{l.seasonId}</span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function MarketsSection() {
  const { address: adminWallet } = useAccount()
  const { leagues, isLoading: isLeaguesLoading } = useLeagues()
  const [leagueId, setLeagueId] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [lockedMarkets, setLockedMarkets] = useState<any[]>([])
  const [loadingLocked, setLoadingLocked] = useState(false)
  const [lockedError, setLockedError] = useState<string | null>(null)
  const [resolving, setResolving] = useState<Record<string, boolean>>({})
  const [resolveResult, setResolveResult] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)

  async function refreshLocked() {
    if (!adminWallet) return
    setLoadingLocked(true)
    setLockedError(null)
    try {
      const res = await fetch("/api/admin/markets/locked?limit=200", {
        headers: { "x-admin-wallet": adminWallet },
      })
      const body = await res.json().catch(() => ({ error: "Failed to parse response" }))
      if (!res.ok) throw new Error(body.error ?? "Failed to load locked markets")
      setLockedMarkets(body.markets ?? [])
    } catch (err) {
      setLockedError((err as Error).message)
      setLockedMarkets([])
    } finally {
      setLoadingLocked(false)
    }
  }

  useEffect(() => {
    refreshLocked()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminWallet])

  async function resolveMarket(contract: string) {
    if (!adminWallet) return
    setResolveError(null)
    setResolveResult(null)
    setResolving((s) => ({ ...s, [contract]: true }))
    try {
      const res = await fetch(`/api/markets/${contract}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-wallet": adminWallet },
        body: "{}",
      })
      const body = await res.json().catch(() => ({ error: "Failed to parse response" }))
      if (!res.ok) throw new Error(body.error ?? "Resolution failed")
      setResolveResult(`Resolved ${contract} → ${String(body.outcome ?? "?").toUpperCase()} (tx ${body.tx_hash ?? ""})`)
      setLockedMarkets((ms) => ms.filter((m) => String(m.contract_address).toLowerCase() !== contract.toLowerCase()))
    } catch (err) {
      setResolveError((err as Error).message)
    } finally {
      setResolving((s) => {
        const next = { ...s }
        delete next[contract]
        return next
      })
    }
  }

  async function generate() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/markets/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-wallet": adminWallet ?? "" },
        body: JSON.stringify({ league_id: leagueId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Generation failed")
      setResult(body.message ?? "Done")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <SectionLabel>Markets</SectionLabel>
      <div className="border border-border/40 p-6 space-y-3">
        <select
          className={inp}
          value={leagueId}
          onChange={(e) => setLeagueId(e.target.value)}
          disabled={isLeaguesLoading}
        >
          <option value="">{isLeaguesLoading ? "Loading leagues…" : "Select league"}</option>
          {leagues.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={generate} disabled={!leagueId || busy} className={btn}>
          {busy ? "Deploying…" : "Generate rank markets"}
        </button>
        {result && <p className="font-mono text-[10px] text-emerald-400">{result}</p>}
        {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
      </div>

      <div className="border border-border/40 p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-xs text-foreground">Resolve closed markets</p>
            <p className="font-mono text-[10px] text-muted-foreground">
              Shows only markets that are closed for betting (locked) and not yet resolved.
            </p>
          </div>
          <button type="button" onClick={refreshLocked} disabled={!adminWallet || loadingLocked} className={btn}>
            {loadingLocked ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {lockedError && <p className="font-mono text-[10px] text-red-400">{lockedError}</p>}
        {resolveResult && <p className="font-mono text-[10px] text-emerald-400">{resolveResult}</p>}
        {resolveError && <p className="font-mono text-[10px] text-red-400">{resolveError}</p>}

        <div className="border border-border/40 divide-y divide-border/30">
          {loadingLocked ? (
            <LoadingSpinner label="Loading locked markets…" />
          ) : lockedMarkets.length === 0 ? (
            <div className="p-4 font-mono text-[10px] text-muted-foreground/60">
              No closed unresolved markets
            </div>
          ) : (
            lockedMarkets.map((m) => (
              <div key={m.contract_address} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-mono text-xs text-foreground">{m.question}</p>
                    <p className="font-mono text-[10px] text-muted-foreground break-all">
                      {m.contract_address} · tier {m.tier} · closes {new Date(Number(m.betting_close_timestamp) * 1000).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => resolveMarket(m.contract_address)}
                    disabled={Boolean(resolving[m.contract_address])}
                    className={btn}
                  >
                    {resolving[m.contract_address] ? "Resolving…" : "Resolve"}
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 font-mono text-[10px] text-muted-foreground">
                  <span>YES {Number(m.yes_pool ?? 0).toFixed(4)} 0G</span>
                  <span>NO {Number(m.no_pool ?? 0).toFixed(4)} 0G</span>
                  <span>Total {Number(m.total_volume ?? 0).toFixed(4)} 0G</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function ExecutorSection() {
  const { data: executor } = useFactoryExecutor()
  const setExecutor = useSetExecutor()
  const [addr, setAddr] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      if (!addr.startsWith("0x") || addr.length !== 42) throw new Error("Address invalid")
      await setExecutor.submit(addr as `0x${string}`)
      setAddr("")
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <SectionLabel>Executor</SectionLabel>
      <div className="border border-border/40 p-6 space-y-3">
        <p className="font-mono text-xs text-muted-foreground">
          Current: <span className="text-foreground break-all">{(executor as string) ?? "(not set)"}</span>
        </p>
        <div className="flex gap-3 items-center">
          <input
            className={inp}
            placeholder="0x… (new executor)"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
          />
          <button type="button" onClick={submit} disabled={busy} className={btn}>
            {busy ? "Sending…" : "Update"}
          </button>
        </div>
        {error && <p className="font-mono text-[10px] text-red-400">{error}</p>}
      </div>
    </section>
  )
}
