"use client"

import { useMemo } from "react"
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi"
import { keccak256, toHex } from "viem"
import { factoryAbi, sandboxRouterAbi, sandboxTokenAbi } from "@/lib/web3/abis"
import { FACTORY_ADDRESS } from "@/lib/wagmi/config"
import { waitForTransactionReceiptSafe } from "@/lib/web3/wait"

const factory = { address: FACTORY_ADDRESS, abi: factoryAbi } as const

export function useFactoryAddress() {
  return FACTORY_ADDRESS
}

export function useIsFactoryOwner(address?: `0x${string}`) {
  const { address: connected } = useAccount()
  const target = address ?? connected
  return useReadContract({
    ...factory,
    functionName: "isOwner",
    args: target ? [target] : undefined,
    query: { enabled: Boolean(target && FACTORY_ADDRESS) },
  })
}

export function useFactoryOwners() {
  return useReadContract({ ...factory, functionName: "getOwners" })
}

export function useFactoryExecutor() {
  return useReadContract({ ...factory, functionName: "executor" })
}

export function useFactoryResolver() {
  return useReadContract({ ...factory, functionName: "resolver" })
}

/* ── Seasons ──────────────────────────────────────────── */

export function useSeasonIds() {
  return useReadContract({ ...factory, functionName: "getSeasons" })
}

export function useSeason(id?: `0x${string}`) {
  return useReadContract({
    ...factory,
    functionName: "getSeason",
    args: id ? [id] : undefined,
    query: { enabled: Boolean(id) },
  })
}

export function useSeasons() {
  const ids = useSeasonIds()
  const list = (ids.data as readonly `0x${string}`[] | undefined) ?? []
  const reads = useReadContracts({
    contracts: list.map((id) => ({ ...factory, functionName: "getSeason", args: [id] }) as const),
    query: { enabled: list.length > 0 },
  })
  const seasons = useMemo(
    () =>
      (reads.data ?? []).flatMap((entry) =>
        entry.status === "success" && entry.result ? [entry.result as FactorySeason] : [],
      ),
    [reads.data],
  )
  return {
    seasons,
    isLoading: ids.isLoading || reads.isLoading,
    refetch: async () => {
      await ids.refetch()
      await reads.refetch()
    },
  }
}

/* ── Leagues ──────────────────────────────────────────── */

export function useLeagueIds() {
  return useReadContract({ ...factory, functionName: "getLeagues" })
}

export function useLeague(id?: `0x${string}`) {
  return useReadContract({
    ...factory,
    functionName: "getLeague",
    args: id ? [id] : undefined,
    query: { enabled: Boolean(id) },
  })
}

export function useLeagues() {
  const ids = useLeagueIds()
  const list = (ids.data as readonly `0x${string}`[] | undefined) ?? []
  const reads = useReadContracts({
    contracts: list.map((id) => ({ ...factory, functionName: "getLeague", args: [id] }) as const),
    query: { enabled: list.length > 0 },
  })
  const leagues = useMemo(
    () =>
      (reads.data ?? []).flatMap((entry) =>
        entry.status === "success" && entry.result ? [entry.result as FactoryLeague] : [],
      ),
    [reads.data],
  )
  return {
    leagues,
    isLoading: ids.isLoading || reads.isLoading,
    refetch: async () => {
      await ids.refetch()
      await reads.refetch()
    },
  }
}

export function useSeasonLeagues(seasonId?: `0x${string}`) {
  return useReadContract({
    ...factory,
    functionName: "getSeasonLeagues",
    args: seasonId ? [seasonId] : undefined,
    query: { enabled: Boolean(seasonId) },
  })
}

/* ── Agents ───────────────────────────────────────────── */

export function useAgent(agentId?: bigint) {
  return useReadContract({
    ...factory,
    functionName: "getAgent",
    args: agentId !== undefined ? [agentId] : undefined,
    query: { enabled: agentId !== undefined },
  })
}

export function useAgentLeagues(agentId?: bigint) {
  return useReadContract({
    ...factory,
    functionName: "getAgentLeagues",
    args: agentId !== undefined ? [agentId] : undefined,
    query: { enabled: agentId !== undefined },
  })
}

export function useAgentAssets(agentId?: bigint) {
  return useReadContract({
    ...factory,
    functionName: "getAgentAssets",
    args: agentId !== undefined ? [agentId] : undefined,
    query: { enabled: agentId !== undefined },
  })
}

export function useAgentPosition(agentId?: bigint, asset?: `0x${string}`) {
  return useReadContract({
    ...factory,
    functionName: "getAgentPosition",
    args: agentId !== undefined && asset ? [agentId, asset] : undefined,
    query: { enabled: agentId !== undefined && Boolean(asset) },
  })
}

export function useAgentsByOwner(owner?: `0x${string}`) {
  const { address } = useAccount()
  const target = owner ?? address
  return useReadContract({
    ...factory,
    functionName: "getAgentsByOwner",
    args: target ? [target] : undefined,
    query: { enabled: Boolean(target) },
  })
}

/* ── Writes ───────────────────────────────────────────── */

interface WriteOptions {
  onHash?: (hash: `0x${string}`) => void
}

export function useCreateSeason() {
  const write = useWriteContract()
  const wait = useWaitForTransactionReceipt({ hash: write.data })
  async function submit(input: { name: string; start: Date; end: Date }, opts?: WriteOptions) {
    const id = keccak256(toHex(`${input.name}|${input.start.toISOString()}`))
    const hash = await write.writeContractAsync({
      ...factory,
      functionName: "createSeason",
      args: [id, input.name, BigInt(Math.floor(input.start.getTime() / 1000)), BigInt(Math.floor(input.end.getTime() / 1000))],
    })
    opts?.onHash?.(hash)
    return { hash, seasonId: id }
  }
  return { submit, hash: write.data, isPending: write.isPending, isMining: wait.isLoading, receipt: wait.data }
}

export function useCreateLeague() {
  const write = useWriteContract()
  const wait = useWaitForTransactionReceipt({ hash: write.data })
  async function submit(input: { seasonId: `0x${string}`; name: string }, opts?: WriteOptions) {
    const id = keccak256(toHex(`${input.seasonId}|${input.name}`))
    const hash = await write.writeContractAsync({
      ...factory,
      functionName: "createLeague",
      args: [id, input.seasonId, input.name],
    })
    opts?.onHash?.(hash)
    return { hash, leagueId: id }
  }
  return { submit, hash: write.data, isPending: write.isPending, isMining: wait.isLoading, receipt: wait.data }
}

/**
 * Two-step USD flow: caller has sUSD ERC20; we approve the factory then call
 * `createAgent(name, root, leagues, depositUsd)`. Both txs returned so the UI
 * can wait on them sequentially.
 */
export function useCreateAgent() {
  const approve = useWriteContract()
  const create = useWriteContract()
  const publicClient = usePublicClient()
  async function submit(input: {
    name: string
    strategyRoot: `0x${string}`
    leagueIds: `0x${string}`[]
    depositUsdScaled: bigint
    sUsdAddress: `0x${string}`
  }) {
    const approveHash = await approve.writeContractAsync({
      address: input.sUsdAddress,
      abi: sandboxTokenAbi,
      functionName: "approve",
      args: [FACTORY_ADDRESS, input.depositUsdScaled],
    })

    // On 0G RPC, pending nonce visibility can be inconsistent.
    // Waiting ensures the next tx uses the correct (latest) nonce.
    if (!publicClient) throw new Error("Public client not ready")
    await waitForTransactionReceiptSafe(publicClient, { hash: approveHash })

    const hash = await create.writeContractAsync({
      ...factory,
      functionName: "createAgent",
      args: [input.name, input.strategyRoot, input.leagueIds, input.depositUsdScaled],
    })
    return { hash, approveHash }
  }
  return { submit, hash: create.data, approveHash: approve.data, isPending: approve.isPending || create.isPending }
}

export function useDepositAgent(agentId?: bigint) {
  const approve = useWriteContract()
  const dep = useWriteContract()
  const publicClient = usePublicClient()
  async function submit(amountUsdScaled: bigint, sUsdAddress: `0x${string}`) {
    if (agentId === undefined) throw new Error("agentId required")
    const approveHash = await approve.writeContractAsync({
      address: sUsdAddress,
      abi: sandboxTokenAbi,
      functionName: "approve",
      args: [FACTORY_ADDRESS, amountUsdScaled],
    })

    if (!publicClient) throw new Error("Public client not ready")
    await waitForTransactionReceiptSafe(publicClient, { hash: approveHash })

    const hash = await dep.writeContractAsync({
      ...factory,
      functionName: "deposit",
      args: [agentId, amountUsdScaled],
    })
    return { hash }
  }
  return { submit, ...dep }
}

export function useWithdrawAgent(agentId?: bigint) {
  const write = useWriteContract()
  async function submit(amountUsdScaled: bigint) {
    if (agentId === undefined) throw new Error("agentId required")
    const hash = await write.writeContractAsync({
      ...factory,
      functionName: "withdraw",
      args: [agentId, amountUsdScaled],
    })
    return { hash }
  }
  return { submit, ...write }
}

export function useTransferAgent(agentId?: bigint) {
  const write = useWriteContract()
  async function submit(newOwner: `0x${string}`) {
    if (agentId === undefined) throw new Error("agentId required")
    const hash = await write.writeContractAsync({
      ...factory,
      functionName: "transferAgentOwnership",
      args: [agentId, newOwner],
    })
    return { hash }
  }
  return { submit, ...write }
}

export function useJoinLeague(agentId?: bigint) {
  const write = useWriteContract()
  async function submit(leagueId: `0x${string}`) {
    if (agentId === undefined) throw new Error("agentId required")
    const hash = await write.writeContractAsync({
      ...factory,
      functionName: "joinLeague",
      args: [agentId, leagueId],
    })
    return { hash }
  }
  return { submit, ...write }
}

export function useLeaveLeague(agentId?: bigint) {
  const write = useWriteContract()
  async function submit(leagueId: `0x${string}`) {
    if (agentId === undefined) throw new Error("agentId required")
    const hash = await write.writeContractAsync({
      ...factory,
      functionName: "leaveLeague",
      args: [agentId, leagueId],
    })
    return { hash }
  }
  return { submit, ...write }
}

export function useSetExecutor() {
  const write = useWriteContract()
  async function submit(addr: `0x${string}`) {
    const hash = await write.writeContractAsync({ ...factory, functionName: "setExecutor", args: [addr] })
    return { hash }
  }
  return { submit, ...write }
}

/* ── Types ────────────────────────────────────────────── */

export interface FactorySeason {
  id: `0x${string}`
  name: string
  start: bigint
  end: bigint
  creator: `0x${string}`
  createdAt: bigint
  exists: boolean
}

export interface FactoryLeague {
  id: `0x${string}`
  seasonId: `0x${string}`
  name: string
  creator: `0x${string}`
  createdAt: bigint
  exists: boolean
}

export interface FactoryAgentMeta {
  owner: `0x${string}`
  name: string
  strategyRoot: `0x${string}`
  exists: boolean
  cashUsd: bigint
  tradeCount: bigint
  createdAt: bigint
}

/* ── sUSD / sandbox router (browser flow) ────────────────────────────── */

export function useSandboxUsdAddress() {
  return useReadContract({ ...factory, functionName: "sandboxUsd" })
}

export function useSandboxRouterAddress() {
  return useReadContract({ ...factory, functionName: "sandboxRouter" })
}

export function useUsdBalance(address?: `0x${string}`) {
  const usd = useSandboxUsdAddress()
  const usdAddress = (usd.data as `0x${string}` | undefined) ?? undefined
  return useReadContract({
    address: usdAddress,
    abi: sandboxTokenAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(usdAddress && address) },
  })
}

export function useSwapNativeForUsd(routerAddress?: `0x${string}`) {
  const write = useWriteContract()
  async function submit(input: { amountWei: bigint; minUsdScaled?: bigint }) {
    if (!routerAddress) throw new Error("router address required")
    const hash = await write.writeContractAsync({
      address: routerAddress,
      abi: sandboxRouterAbi,
      functionName: "swapNativeForUsd",
      args: [input.minUsdScaled ?? 0n],
      value: input.amountWei,
    })
    return { hash }
  }
  return { submit, ...write }
}

export function useSwapUsdForNative(routerAddress?: `0x${string}`, sUsdAddress?: `0x${string}`) {
  const approve = useWriteContract()
  const swap = useWriteContract()
  const publicClient = usePublicClient()
  async function submit(input: { amountUsdScaled: bigint; minNativeWei?: bigint }) {
    if (!routerAddress) throw new Error("router address required")
    if (!sUsdAddress) throw new Error("sUSD address required")
    const approveHash = await approve.writeContractAsync({
      address: sUsdAddress,
      abi: sandboxTokenAbi,
      functionName: "approve",
      args: [routerAddress, input.amountUsdScaled],
    })

    if (!publicClient) throw new Error("Public client not ready")
    await waitForTransactionReceiptSafe(publicClient, { hash: approveHash })

    const hash = await swap.writeContractAsync({
      address: routerAddress,
      abi: sandboxRouterAbi,
      functionName: "swapUsdForNative",
      args: [input.amountUsdScaled, input.minNativeWei ?? 0n],
    })
    return { hash }
  }
  return { submit, ...swap }
}
