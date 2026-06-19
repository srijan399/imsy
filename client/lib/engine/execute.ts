import "server-only"

import { ethers } from "ethers"
import { factoryAbi } from "@/lib/web3/abis"
import { getFactoryAddress } from "@/lib/web3/contracts"
import { getZGConfig } from "@/lib/0g/config"
import { uploadJsonToZG } from "@/lib/0g/storage"
import { usdToScaled } from "@/lib/engine/prices"
import type { TraderDecision } from "@/lib/engine/decide"
import { withWalletWriteLock } from "@/lib/web3/write-lock"

const ACTION_CODE = { buy: 0, sell: 1, hold: 2 } as const

function getExecutorWallet() {
  const config = getZGConfig()
  const key = process.env.EXECUTOR_PRIVATE_KEY
  if (!key) throw new Error("EXECUTOR_PRIVATE_KEY is required to call executeTrade")
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId)
  return new ethers.Wallet(key, provider)
}

function assetToBytes32(symbol: string): `0x${string}` {
  return ethers.encodeBytes32String(symbol) as `0x${string}`
}

function errorText(error: unknown): string {
  if (!error) return ""
  const anyErr = error as { code?: unknown; message?: unknown; info?: unknown; error?: unknown }
  const candidates = [
    anyErr.code,
    anyErr.message,
    (anyErr.info as any)?.error?.message,
    (anyErr.error as any)?.message,
    error,
  ]
  return candidates
    .map((v) => {
      if (typeof v === "string") return v
      if (v instanceof Error) return v.message
      try {
        return JSON.stringify(v)
      } catch {
        return String(v)
      }
    })
    .filter(Boolean)
    .join(" | ")
}

function isNonceRace(error: unknown) {
  return /NONCE_EXPIRED|nonce too low|nonce has already been used|REPLACEMENT_UNDERPRICED|replacement transaction underpriced|replacement fee too low/i.test(
    errorText(error),
  )
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export interface ExecutedTrade {
  txHash: string
  blockNumber: number
  success: boolean
  simulated: boolean
  reasonHash: string
  zgRef: { rootHash: string; status: string; txHash: string | null; error?: string }
  priceUsd: bigint
}

export async function executeAgentTrade(input: {
  agentId: number
  decision: TraderDecision
  computeMeta: {
    model: string
    endpoint: string
    responseId: string | null
    teeVerified: boolean
    status: "verified" | "unverified" | "not_configured" | "failed"
  }
}): Promise<ExecutedTrade> {
  const { agentId, decision, computeMeta } = input

  const decisionDoc = {
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    decision,
    compute: computeMeta,
  }
  const zg = await uploadJsonToZG(decisionDoc, `decision-${agentId}-${Date.now()}.json`)

  const factoryAddress = getFactoryAddress()
  if (!factoryAddress) throw new Error("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS is required")

  const wallet = getExecutorWallet()
  const factory = new ethers.Contract(factoryAddress, factoryAbi as unknown as ethers.InterfaceAbi, wallet)

  const action = ACTION_CODE[decision.action]
  const assetBytes = assetToBytes32(decision.asset || "USD")
  const qty = decision.quantity > 0 ? ethers.parseUnits(decision.quantity.toString(), 18) : 0n
  const priceUsd = decision.limit_price_usd > 0 ? usdToScaled(decision.limit_price_usd) : 0n
  const reasonHash = ensureBytes32(zg.rootHash) ?? ethers.id(zg.sha256Hash)

  const sendTrade = () =>
    withWalletWriteLock(async () => {
      const nonce = await wallet.provider!.getTransactionCount(wallet.address, "pending")
      return factory.executeTrade(BigInt(agentId), action, assetBytes, qty, priceUsd, reasonHash, { nonce })
    })

  let tx: ethers.ContractTransactionResponse
  try {
    tx = await sendTrade()
  } catch (error) {
    if (!isNonceRace(error)) throw error
    await delay(750)
    tx = await sendTrade()
  }
  const receipt = await tx.wait()
  if (!receipt || receipt.status !== 1) throw new Error("executeTrade transaction failed")

  let success = true
  let simulated = false
  for (const log of receipt.logs) {
    try {
      const parsed = factory.interface.parseLog({ topics: log.topics, data: log.data })
      if (parsed?.name === "TradeExecuted") {
        success = parsed.args.success as boolean
        simulated = parsed.args.simulated as boolean
        break
      }
    } catch {}
  }

  return {
    txHash: receipt.hash as string,
    blockNumber: receipt.blockNumber as number,
    success,
    simulated,
    reasonHash,
    zgRef: { rootHash: zg.rootHash, status: zg.status, txHash: zg.txHash, error: zg.error },
    priceUsd,
  }
}

function ensureBytes32(value: string): `0x${string}` | null {
  if (!value) return null
  if (value.startsWith("0x") && value.length === 66) return value as `0x${string}`
  if (value.startsWith("0x") && value.length > 66) return value.slice(0, 66) as `0x${string}`
  return null
}
