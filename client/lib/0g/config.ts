export const ZG_GALILEO = {
  chainId: 16602,
  name: "0G Galileo Testnet",
  rpcUrl: "https://evmrpc-testnet.0g.ai",
  storageIndexer: "https://indexer-storage-testnet-turbo.0g.ai",
  explorerUrl: "https://chainscan-galileo.0g.ai",
} as const

export const ZG_GALILEO_COMPUTE = {
  baseUrl: "https://compute-network-6.integratenetwork.work/v1/proxy",
  modelsUrl: "https://compute-network-6.integratenetwork.work/v1/models",
  model: "qwen/qwen-2.5-7b-instruct",
  providerAddress: "0xa48f01287233509FD694a22Bf840225062E67836",
  inferenceContractAddress: "0xa79F4c8311FF93C06b8CfB403690cc987c93F91E",
  maxTokens: 4096,
  timeoutMs: 60_000,
} as const

export interface ZGRuntimeConfig {
  chainId: number
  rpcUrl: string
  storageIndexer: string
  explorerUrl: string
  privateKey?: string
  computeApiKey?: string
  computeBaseUrl: string
  computeModelsUrl: string
  computeModel: string
  computeProviderAddress: string
  computeInferenceContractAddress: string
  computeMaxTokens: number
  computeTimeoutMs: number
  computeVerifyTee: boolean
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function assertTestnetComputeUrl(value: string, envName: string) {
  const host = new URL(value).hostname
  if (host === "router-api.0g.ai" || host === "pc.0g.ai") {
    throw new Error(`[0g-compute] ${envName} must use a 0G Galileo testnet compute endpoint, not ${host}`)
  }
}

export function getZGConfig(): ZGRuntimeConfig {
  const privateKey = process.env.PRIVATE_KEY
  const computeBaseUrl = process.env.ZG_COMPUTE_BASE_URL ?? ZG_GALILEO_COMPUTE.baseUrl
  const computeModelsUrl = process.env.ZG_COMPUTE_MODELS_URL ?? ZG_GALILEO_COMPUTE.modelsUrl
  assertTestnetComputeUrl(computeBaseUrl, "ZG_COMPUTE_BASE_URL")
  assertTestnetComputeUrl(computeModelsUrl, "ZG_COMPUTE_MODELS_URL")

  return {
    chainId: Number(process.env.CHAIN_ID ?? process.env.NEXT_PUBLIC_CHAIN_ID ?? ZG_GALILEO.chainId),
    rpcUrl: process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? ZG_GALILEO.rpcUrl,
    storageIndexer: process.env.STORAGE_INDEXER ?? ZG_GALILEO.storageIndexer,
    explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL ?? ZG_GALILEO.explorerUrl,
    privateKey: privateKey ? (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) : undefined,
    computeApiKey: process.env.ZG_COMPUTE_API_KEY,
    computeBaseUrl,
    computeModelsUrl,
    computeModel: process.env.ZG_COMPUTE_MODEL ?? ZG_GALILEO_COMPUTE.model,
    computeProviderAddress: process.env.ZG_COMPUTE_PROVIDER_ADDRESS ?? ZG_GALILEO_COMPUTE.providerAddress,
    computeInferenceContractAddress:
      process.env.ZG_COMPUTE_INFERENCE_CONTRACT_ADDRESS ?? ZG_GALILEO_COMPUTE.inferenceContractAddress,
    computeMaxTokens: positiveNumber(process.env.ZG_COMPUTE_MAX_TOKENS, ZG_GALILEO_COMPUTE.maxTokens),
    computeTimeoutMs: positiveNumber(process.env.ZG_COMPUTE_TIMEOUT_MS, ZG_GALILEO_COMPUTE.timeoutMs),
    computeVerifyTee: process.env.ZG_COMPUTE_VERIFY_TEE !== "false",
  }
}

export function assertZGWriteConfig(config = getZGConfig()) {
  const missing = []
  if (!config.privateKey) missing.push("PRIVATE_KEY")
  if (!config.rpcUrl) missing.push("RPC_URL")
  if (!config.storageIndexer) missing.push("STORAGE_INDEXER")
  if (missing.length > 0) throw new Error(`[0g] Missing ${missing.join(", ")}`)
}

export function explorerTxUrl(txHash: string) {
  return `${getZGConfig().explorerUrl.replace(/\/$/, "")}/tx/${txHash}`
}

export function explorerAddressUrl(address: string) {
  return `${getZGConfig().explorerUrl.replace(/\/$/, "")}/address/${address}`
}
