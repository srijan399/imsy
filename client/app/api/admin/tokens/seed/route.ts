import { NextRequest, NextResponse } from "next/server"
import { ethers } from "ethers"
import { sandboxRouterAbi } from "@/lib/web3/abis"
import { getZGConfig } from "@/lib/0g/config"
import { seedTokens, type TokenSeed } from "@/lib/db/repositories/tokens"
import { requireAdmin } from "@/lib/auth/admin"

/// Symbol → asset_class. Synced with `web3/script/IMSYSandbox.s.sol`.
const ASSET_CLASS: Record<string, "stable" | "volatile" | "peg"> = {
  USD: "peg",
  USDC: "peg",
  BTC: "stable",
  ETH: "stable",
  SOL: "stable",
  DOGE: "volatile",
  PEPE: "volatile",
  BONK: "volatile",
  WIF: "volatile",
  MOON: "volatile",
  JEFE: "volatile",
  SCAM: "volatile",
  RUG: "volatile",
}

/**
 * Walk the sandbox router's `getRegisteredAssets`, decode each `bytes32` symbol,
 * and seed Mongo's TokenRegistry with the live `usdPriceOf` values. Idempotent.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const routerAddress = process.env.SANDBOX_ROUTER_ADDRESS
  if (!routerAddress || !ethers.isAddress(routerAddress)) {
    return NextResponse.json({ error: "SANDBOX_ROUTER_ADDRESS env required" }, { status: 500 })
  }

  const config = getZGConfig()
  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId)
  const router = new ethers.Contract(routerAddress, sandboxRouterAbi as unknown as ethers.InterfaceAbi, provider)

  const symbolsBytes = (await router.getRegisteredAssets()) as string[]
  const seeds: TokenSeed[] = []

  for (const symbolBytes of symbolsBytes) {
    let symbol: string
    try {
      symbol = ethers.decodeBytes32String(symbolBytes)
    } catch {
      continue
    }
    const tokenAddr = (await router.tokenOf(symbolBytes)) as string
    const usdPriceScaled = (await router.usdPriceOf(symbolBytes)) as bigint
    const priceUsd = Number(usdPriceScaled) / 1e18

    const klass = ASSET_CLASS[symbol] ?? "volatile"
    seeds.push({
      symbol,
      contract_address: tokenAddr,
      asset_class: klass,
      base_price_usd: priceUsd,
    })
  }

  const result = await seedTokens(seeds)
  return NextResponse.json({ ...result, count: seeds.length, symbols: seeds.map((s) => s.symbol) })
}
