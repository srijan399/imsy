import "server-only"

import { ethers } from "ethers"
import { getZGConfig } from "@/lib/0g/config"
import { factoryAbi, marketAbi, getFactoryAddress } from "@/lib/web3/contracts"

const marketInterface = new ethers.Interface(marketAbi as unknown as ethers.InterfaceAbi)
const factoryInterface = new ethers.Interface(factoryAbi as unknown as ethers.InterfaceAbi)

export interface DeployMarketInput {
  seasonId: string
  agentCreator: string
  question: string
  bettingCloseTimestamp: number
}

export interface DeployMarketResult {
  contractAddress: string
  txHash: string
  blockNumber: number
}

export interface VerifiedBetTransaction {
  txHash: string
  blockNumber: number
  walletAddress: string
  contractAddress: string
  side: "yes" | "no"
  stakeWei: bigint
  stake: number
}

function getProvider() {
  const config = getZGConfig()
  return new ethers.JsonRpcProvider(config.rpcUrl, config.chainId)
}

function getSigner() {
  const config = getZGConfig()
  if (!config.privateKey) throw new Error("PRIVATE_KEY is required for contract writes")
  return new ethers.Wallet(config.privateKey, getProvider())
}

function getRequiredFactoryAddress() {
  const address = getFactoryAddress()
  if (!address) throw new Error("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS is required")
  if (!ethers.isAddress(address)) throw new Error("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS is invalid")
  return ethers.getAddress(address)
}

function parseStakeWei(stake: number | string) {
  const value = typeof stake === "number" ? stake.toString() : stake
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Stake must be a positive decimal amount")
  const wei = ethers.parseEther(value)
  if (wei <= BigInt(0)) throw new Error("Stake must be a positive number")
  return wei
}

export async function deployMarketContract(input: DeployMarketInput): Promise<DeployMarketResult> {
  const signer = getSigner()
  const factory = new ethers.Contract(getRequiredFactoryAddress(), factoryAbi as unknown as ethers.InterfaceAbi, signer)
  const platformFeeBps = BigInt(process.env.MARKET_PLATFORM_FEE_BPS ?? 200)
  const creatorShareBps = BigInt(process.env.MARKET_CREATOR_SHARE_BPS ?? 2500)

  const tx = await factory.deployMarket(
    ethers.id(input.seasonId),
    ethers.getAddress(input.agentCreator),
    input.question,
    BigInt(input.bettingCloseTimestamp),
    platformFeeBps,
    creatorShareBps,
  )
  const receipt = await tx.wait()
  if (!receipt || receipt.status !== 1) throw new Error("Market deployment transaction failed")

  for (const log of receipt.logs) {
    try {
      const parsed = factoryInterface.parseLog(log)
      if (parsed?.name === "MarketDeployed") {
        return {
          contractAddress: ethers.getAddress(parsed.args.market),
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        }
      }
    } catch {
      // Ignore logs from child contracts and unrelated addresses.
    }
  }

  throw new Error("MarketDeployed event not found in deployment receipt")
}

export async function readMarketContractSnapshot(contractAddress: string) {
  if (!ethers.isAddress(contractAddress)) throw new Error("Market contract address is invalid")

  const provider = getProvider()
  const code = await provider.getCode(contractAddress)
  if (code === "0x") throw new Error("Market contract is not deployed")

  const market = new ethers.Contract(contractAddress, marketAbi as unknown as ethers.InterfaceAbi, provider)
  const [yesPool, noPool, yesBps, noBps, resolved, outcome, bettingCloseTimestamp] = await Promise.all([
    market.yesPool(),
    market.noPool(),
    market.impliedYesProbability(),
    market.impliedNoProbability(),
    market.resolved(),
    market.outcome().catch(() => false),
    market.bettingCloseTimestamp(),
  ])

  const now = Math.floor(Date.now() / 1000)
  const status = resolved ? "resolved" : Number(bettingCloseTimestamp) <= now ? "locked" : "open"
  const yes = Number(ethers.formatEther(yesPool))
  const no = Number(ethers.formatEther(noPool))

  return {
    yes_pool: yes,
    no_pool: no,
    total_volume: Number((yes + no).toFixed(6)),
    implied_yes_bps: Number(yesBps),
    implied_no_bps: Number(noBps),
    status: status as "open" | "locked" | "resolved",
    outcome: resolved ? ((outcome as boolean) ? "yes" : "no") : null,
    betting_close_timestamp: Number(bettingCloseTimestamp),
  }
}

export async function verifyBetTransaction(input: {
  txHash: string
  walletAddress: string
  contractAddress: string
  side: "yes" | "no"
  stake: number | string
}): Promise<VerifiedBetTransaction> {
  if (!ethers.isHexString(input.txHash, 32)) throw new Error("tx_hash must be a real transaction hash")
  if (!ethers.isAddress(input.walletAddress)) throw new Error("wallet_address is invalid")
  if (!ethers.isAddress(input.contractAddress)) throw new Error("Market contract address is invalid")

  const expectedStakeWei = parseStakeWei(input.stake)
  const provider = getProvider()
  const [tx, receipt] = await Promise.all([
    provider.getTransaction(input.txHash),
    provider.getTransactionReceipt(input.txHash),
  ])
  if (!tx || !receipt) throw new Error("Transaction not found on configured chain")
  if (receipt.status !== 1) throw new Error("Transaction failed on-chain")
  if (!tx.to || ethers.getAddress(tx.to) !== ethers.getAddress(input.contractAddress)) {
    throw new Error("Transaction was not sent to this market contract")
  }
  if (ethers.getAddress(tx.from) !== ethers.getAddress(input.walletAddress)) {
    throw new Error("Transaction sender does not match connected wallet")
  }
  if (tx.value !== expectedStakeWei) throw new Error("Transaction stake does not match indexed stake")

  const parsed = marketInterface.parseTransaction({ data: tx.data, value: tx.value })
  const expectedMethod = input.side === "yes" ? "betYes" : "betNo"
  if (parsed?.name !== expectedMethod) throw new Error(`Transaction did not call ${expectedMethod}`)

  return {
    txHash: tx.hash,
    blockNumber: receipt.blockNumber,
    walletAddress: ethers.getAddress(tx.from).toLowerCase(),
    contractAddress: ethers.getAddress(input.contractAddress),
    side: input.side,
    stakeWei: tx.value,
    stake: Number(ethers.formatEther(tx.value)),
  }
}

export async function resolveMarketContract(contractAddress: string, outcome: "yes" | "no") {
  if (!ethers.isAddress(contractAddress)) throw new Error("Market contract address is invalid")

  const signer = getSigner()
  const market = new ethers.Contract(contractAddress, marketAbi as unknown as ethers.InterfaceAbi, signer)
  const tx = await market.resolve(outcome === "yes")
  const receipt = await tx.wait()
  if (!receipt || receipt.status !== 1) throw new Error("Market resolution transaction failed")
  return { txHash: receipt.hash as string, blockNumber: receipt.blockNumber as number }
}

/* ── Factory views (server-side reads via JsonRpcProvider) ── */

export interface OnChainAgent {
  owner: string
  name: string
  strategyRoot: string
  cashUsd: bigint
  tradeCount: bigint
  createdAt: bigint
  exists: boolean
}

export interface OnChainPosition {
  asset: string
  qty: bigint
  avgPriceUsd: bigint
}

function getFactory(provider: ethers.Provider) {
  const address = getFactoryAddress()
  if (!address) throw new Error("NEXT_PUBLIC_MARKET_FACTORY_ADDRESS is required")
  return new ethers.Contract(address, factoryAbi as unknown as ethers.InterfaceAbi, provider)
}

export async function readAgentOnChain(agentId: number): Promise<OnChainAgent | null> {
  const factory = getFactory(getProvider())
  const result = await factory.getAgent(BigInt(agentId))
  if (!result.exists) return null
  return {
    owner: ethers.getAddress(result.owner).toLowerCase(),
    name: result.name as string,
    strategyRoot: result.strategyRoot as string,
    cashUsd: result.cashUsd as bigint,
    tradeCount: result.tradeCount as bigint,
    createdAt: result.createdAt as bigint,
    exists: true,
  }
}

export async function readAgentLeaguesOnChain(agentId: number): Promise<string[]> {
  const factory = getFactory(getProvider())
  const result = (await factory.getAgentLeagues(BigInt(agentId))) as string[]
  return result.map((id) => id.toLowerCase())
}

export async function readAgentAssetsOnChain(agentId: number): Promise<string[]> {
  const factory = getFactory(getProvider())
  const result = (await factory.getAgentAssets(BigInt(agentId))) as string[]
  return result.map((bytes32) => ethers.decodeBytes32String(bytes32))
}

export async function readAgentPositionOnChain(agentId: number, assetSymbol: string) {
  const factory = getFactory(getProvider())
  const assetBytes = ethers.encodeBytes32String(assetSymbol)
  const [qty, avgPriceUsd] = (await factory.getAgentPosition(BigInt(agentId), assetBytes)) as [bigint, bigint]
  return { asset: assetSymbol, qty, avgPriceUsd }
}

export async function verifyAgentRegistration(agentId: number): Promise<{ owner: string; strategyRoot: string }> {
  const agent = await readAgentOnChain(agentId)
  if (!agent) throw new Error("Agent not found on-chain")
  return { owner: agent.owner, strategyRoot: agent.strategyRoot }
}

export async function verifySeasonOnChain(seasonChainId: string): Promise<boolean> {
  const factory = getFactory(getProvider())
  const result = await factory.getSeason(seasonChainId)
  return Boolean(result.exists)
}

export async function verifyLeagueOnChain(
  leagueChainId: string,
): Promise<{ exists: boolean; seasonId: string; name: string }> {
  const factory = getFactory(getProvider())
  const result = await factory.getLeague(leagueChainId)
  return { exists: Boolean(result.exists), seasonId: result.seasonId as string, name: result.name as string }
}

export async function getFactoryOwner(address: string): Promise<boolean> {
  const factory = getFactory(getProvider())
  return Boolean(await factory.isOwner(ethers.getAddress(address)))
}
