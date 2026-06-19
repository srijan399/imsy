"use client"

import { useReadContract, useReadContracts, useWriteContract } from "wagmi"
import { parseEther } from "viem"
import { marketAbi } from "@/lib/web3/abis"

export function useMarketSnapshot(address?: `0x${string}`) {
  const reads = useReadContracts({
    contracts: address
      ? [
          { address, abi: marketAbi, functionName: "yesPool" },
          { address, abi: marketAbi, functionName: "noPool" },
          { address, abi: marketAbi, functionName: "impliedYesProbability" },
          { address, abi: marketAbi, functionName: "impliedNoProbability" },
          { address, abi: marketAbi, functionName: "resolved" },
          { address, abi: marketAbi, functionName: "outcome" },
          { address, abi: marketAbi, functionName: "bettingCloseTimestamp" },
        ]
      : [],
    query: { enabled: Boolean(address) },
  })

  if (!address) return { snapshot: null, isLoading: false, refetch: () => undefined }

  const [yesPool, noPool, yesBps, noBps, resolved, outcome, close] = reads.data ?? []
  return {
    snapshot:
      yesPool && yesPool.status === "success"
        ? {
            yesPoolWei: yesPool.result as bigint,
            noPoolWei: noPool!.result as bigint,
            impliedYesBps: Number(yesBps!.result as bigint),
            impliedNoBps: Number(noBps!.result as bigint),
            resolved: resolved!.result as boolean,
            outcomeYes: outcome!.result as boolean,
            bettingCloseTimestamp: Number(close!.result as bigint),
          }
        : null,
    isLoading: reads.isLoading,
    refetch: reads.refetch,
  }
}

export function useUserBets(market?: `0x${string}`, user?: `0x${string}`) {
  const reads = useReadContracts({
    contracts:
      market && user
        ? [
            { address: market, abi: marketAbi, functionName: "yesBets", args: [user] },
            { address: market, abi: marketAbi, functionName: "noBets", args: [user] },
            { address: market, abi: marketAbi, functionName: "claimed", args: [user] },
          ]
        : [],
    query: { enabled: Boolean(market && user) },
  })
  return {
    yesWei: (reads.data?.[0]?.result as bigint | undefined) ?? 0n,
    noWei: (reads.data?.[1]?.result as bigint | undefined) ?? 0n,
    claimed: (reads.data?.[2]?.result as boolean | undefined) ?? false,
    isLoading: reads.isLoading,
    refetch: reads.refetch,
  }
}

export function usePlaceBet(market?: `0x${string}`) {
  const write = useWriteContract()
  async function submit(side: "yes" | "no", amountEth: string) {
    if (!market) throw new Error("Market address required")
    const hash = await write.writeContractAsync({
      address: market,
      abi: marketAbi,
      functionName: side === "yes" ? "betYes" : "betNo",
      value: parseEther(amountEth),
    })
    return { hash }
  }
  return { submit, hash: write.data, isPending: write.isPending, isMining: false, receipt: undefined }
}

export function useClaim(market?: `0x${string}`) {
  const write = useWriteContract()
  async function submit() {
    if (!market) throw new Error("Market address required")
    const hash = await write.writeContractAsync({
      address: market,
      abi: marketAbi,
      functionName: "claim",
    })
    return { hash }
  }
  return { submit, ...write }
}
