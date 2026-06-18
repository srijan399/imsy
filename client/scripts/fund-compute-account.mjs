import "dotenv/config"
import { Contract, JsonRpcProvider, Wallet, parseEther } from "ethers"
import dotenv from "dotenv"

// Load Next-style local env file.
dotenv.config({ path: ".env.local" })

const DEFAULT_RPC_URL = "https://evmrpc-testnet.0g.ai"
const DEFAULT_PROVIDER_ADDRESS = "0xa48f01287233509FD694a22Bf840225062E67836"
const DEFAULT_INFERENCE_CONTRACT_ADDRESS = "0xa79F4c8311FF93C06b8CfB403690cc987c93F91E"

const rpcUrl = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? DEFAULT_RPC_URL
const privateKey = process.env.PRIVATE_KEY

// Some docs/scripts call this the settlement contract.
const contractAddress =
  process.env.ZG_COMPUTE_SETTLEMENT_CONTRACT_ADDRESS ??
  process.env.ZERO_G_COMPUTE_CONTRACT_ADDRESS ??
  process.env.ZG_COMPUTE_INFERENCE_CONTRACT_ADDRESS ??
  DEFAULT_INFERENCE_CONTRACT_ADDRESS

const providerAddress =
  process.env.ZG_COMPUTE_PROVIDER_ADDRESS ??
  process.env.ZERO_G_COMPUTE_PROVIDER_ADDRESS ??
  DEFAULT_PROVIDER_ADDRESS

const depositAmount = process.env.ZG_COMPUTE_DEPOSIT_A0GI ?? "0.01"

if (!privateKey) {
  console.error("Missing PRIVATE_KEY in client/.env.local")
  process.exit(1)
}

const normalizedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`

const GET_ACCOUNT_ABI = [
  "function getAccount(address user, address provider) view returns (tuple(address user,address provider,uint256 nonce,uint256 balance,uint256 pendingRefund,uint256 generation))",
]

const SETTLEMENT_ABI = [
  // Common variants seen across 0G versions:
  "function depositFund(address provider) payable",
  "function deposit(address provider, uint256 amount) payable",
]

async function hasAccount(servingContract, user, provider) {
  try {
    await servingContract.getAccount(user, provider)
    return true
  } catch {
    return false
  }
}

async function main() {
  const provider = new JsonRpcProvider(rpcUrl)
  const wallet = new Wallet(normalizedPrivateKey, provider)

  console.log("RPC:", rpcUrl)
  console.log("User:", wallet.address)
  console.log("Provider:", providerAddress)
  console.log("Contract:", contractAddress)

  const readContract = new Contract(contractAddress, GET_ACCOUNT_ABI, provider)

  const alreadyExists = await hasAccount(readContract, wallet.address, providerAddress)
  if (alreadyExists) {
    console.log("Compute account already exists ✓")
    return
  }

  console.log("Compute account missing; sending deposit tx…")

  const writeContract = new Contract(contractAddress, SETTLEMENT_ABI, wallet)
  const value = parseEther(depositAmount)

  let tx
  try {
    tx = await writeContract.depositFund(providerAddress, { value })
  } catch (err1) {
    try {
      tx = await writeContract.deposit(providerAddress, value, { value })
    } catch (err2) {
      console.error("Neither depositFund nor deposit call succeeded.")
      console.error("depositFund error:", err1?.message ?? err1)
      console.error("deposit error:", err2?.message ?? err2)
      process.exit(1)
    }
  }

  console.log("Deposit tx:", tx.hash)
  const receipt = await tx.wait()
  console.log("Mined in block:", receipt.blockNumber)

  const nowExists = await hasAccount(readContract, wallet.address, providerAddress)
  if (!nowExists) {
    console.error("Deposit mined but account still missing. You may be using the wrong contract address.")
    console.error("Set ZG_COMPUTE_SETTLEMENT_CONTRACT_ADDRESS in client/.env.local and retry.")
    process.exit(1)
  }

  console.log("Account funded/initialized ✓")
}

main().catch((error) => {
  console.error(error?.stack ?? String(error))
  process.exit(1)
})
