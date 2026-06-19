import "server-only"

import { createHash, randomBytes } from "crypto"
import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers"
import { getZGConfig } from "./config"

type ZGChatRole = "system" | "user" | "assistant"

export interface ZGComputeResult {
  content: string
  model: string
  endpoint: string
  responseId: string | null
  teeVerified: boolean
  status: "verified" | "unverified" | "not_configured" | "failed"
  usage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
  error?: string
}

interface ZGChatCompletionBody {
  id?: string
  choices?: Array<{
    message?: {
      content?: unknown
    }
    text?: string
    trace?: {
      tee_verified?: boolean
      teeVerified?: boolean
    }
  }>
  content?: unknown
  output_text?: string
  trace?: {
    tee_verified?: boolean
    teeVerified?: boolean
  }
  tee_verified?: boolean
  teeVerified?: boolean
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: {
    message?: string
  } | string
}

const REQUIRE_0G = process.env.IMSY_REQUIRE_0G === "true"
const EPHEMERAL_TOKEN_ID = 255
const EPHEMERAL_TOKEN_DURATION_MS = 24 * 60 * 60 * 1000
const EPHEMERAL_TOKEN_REFRESH_MS = 60 * 60 * 1000
const APP_SK_PREFIX = "app-sk-"

let cachedAuth:
  | {
    providerAddress: string
    userAddress: string
    token: string
    expiresAt: number
  }
  | undefined

function computeEndpoint(path: string) {
  return `${getZGConfig().computeBaseUrl.replace(/\/$/, "")}${path}`
}

function normalizeContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""

  return content
    .map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object" && "text" in part) return String(part.text ?? "")
      return ""
    })
    .join("")
}

function extractContent(body: ZGChatCompletionBody) {
  return (
    normalizeContent(body.choices?.[0]?.message?.content) ||
    body.choices?.[0]?.text ||
    normalizeContent(body.content) ||
    body.output_text ||
    ""
  ).trim()
}

function extractTeeVerified(body: ZGChatCompletionBody) {
  return Boolean(
    body.trace?.tee_verified ??
    body.trace?.teeVerified ??
    body.choices?.[0]?.trace?.tee_verified ??
    body.choices?.[0]?.trace?.teeVerified ??
    body.tee_verified ??
    body.teeVerified
  )
}

async function readJson(response: Response): Promise<ZGChatCompletionBody> {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text) as ZGChatCompletionBody
  } catch {
    throw new Error(`[0g-compute] Testnet compute returned non-JSON response: ${text.slice(0, 160)}`)
  }
}

function formatError(body: ZGChatCompletionBody, status: number) {
  if (typeof body.error === "string") return body.error
  return body.error?.message ?? `0G Galileo compute HTTP ${status}`
}

function isAppSk(value: string | undefined): value is string {
  return Boolean(value && value.startsWith(APP_SK_PREFIX))
}

function computeAccountMissingError(config: ReturnType<typeof getZGConfig>, userAddress: string, error?: unknown) {
  const parts: string[] = []
  parts.push(
    `[0g-compute] Compute account missing for user=${userAddress} provider=${config.computeProviderAddress} ` +
    `contract=${config.computeInferenceContractAddress}.`,
  )
  parts.push(
    "Fund the wallet on 0G Galileo and initialize the 0G Compute provider sub-account (the provider proxy requires this).",
  )
  parts.push(
    "If you only want local dev without live 0G, set IMSY_REQUIRE_0G=false to use the deterministic fallback.",
  )
  if (config.computeApiKey && !isAppSk(config.computeApiKey)) {
    parts.push(
      `Note: ZG_COMPUTE_API_KEY is set but is not an ${APP_SK_PREFIX}... token (it will be ignored by this app).`,
    )
  }
  if (error instanceof Error && error.message) {
    parts.push(`Details: ${error.message}`)
  }
  return new Error(parts.join(" "))
}

async function getInferenceAccountGenerationOrThrow(config: ReturnType<typeof getZGConfig>, userAddress: string) {
  const provider = new JsonRpcProvider(config.rpcUrl)
  const contract = new Contract(
    config.computeInferenceContractAddress,
    [
      "function getAccount(address user, address provider) view returns (tuple(address user,address provider,uint256 nonce,uint256 balance,uint256 pendingRefund,tuple(uint256 amount,uint256 createdAt,bool processed)[] refunds,string additionalInfo,bool acknowledged,uint256 validRefundsLength,uint256 generation,uint256 revokedBitmap))",
    ],
    provider,
  )

  try {
    const account = await contract.getAccount(userAddress, config.computeProviderAddress)
    return Number(account.generation ?? 0)
  } catch (error) {
    throw computeAccountMissingError(config, userAddress, error)
  }
}

async function getSessionGeneration(config: ReturnType<typeof getZGConfig>, userAddress: string) {
  return getInferenceAccountGenerationOrThrow(config, userAddress)
}

async function createEphemeralAppSk(config: ReturnType<typeof getZGConfig>) {
  if (!config.privateKey) throw new Error("[0g-compute] Missing PRIVATE_KEY for Galileo signed app-sk generation")

  const wallet = new Wallet(config.privateKey)
  const now = Date.now()
  const generation = await getSessionGeneration(config, wallet.address)
  const rawMessage = JSON.stringify({
    address: wallet.address,
    provider: config.computeProviderAddress,
    timestamp: now,
    expiresAt: now + EPHEMERAL_TOKEN_DURATION_MS,
    nonce: randomBytes(16).toString("hex"),
    generation,
    tokenId: EPHEMERAL_TOKEN_ID,
  })
  const messageHash = keccak256(toUtf8Bytes(rawMessage))
  const signature = await wallet.signMessage(Buffer.from(messageHash.slice(2), "hex"))

  return {
    userAddress: wallet.address,
    token: `app-sk-${Buffer.from(`${rawMessage}|${signature}`).toString("base64")}`,
    expiresAt: now + EPHEMERAL_TOKEN_DURATION_MS,
  }
}

async function getAuthorization(config: ReturnType<typeof getZGConfig>) {
  if (isAppSk(config.computeApiKey)) return `Bearer ${config.computeApiKey}`

  if (
    cachedAuth &&
    cachedAuth.providerAddress.toLowerCase() === config.computeProviderAddress.toLowerCase() &&
    cachedAuth.expiresAt > Date.now() + EPHEMERAL_TOKEN_REFRESH_MS
  ) {
    return `Bearer ${cachedAuth.token}`
  }

  const auth = await createEphemeralAppSk(config)
  cachedAuth = {
    providerAddress: config.computeProviderAddress,
    ...auth,
  }
  return `Bearer ${auth.token}`
}

function fallbackResult(prompt: string, error?: unknown): ZGComputeResult {
  const config = getZGConfig()
  const digest = createHash("sha256").update(prompt).digest("hex")

  return {
    content: `0G Compute pending. Deterministic local decision ${digest.slice(0, 12)}.`,
    model: config.computeModel,
    endpoint: config.computeBaseUrl,
    responseId: null,
    teeVerified: false,
    status: "not_configured",
    error: error instanceof Error ? error.message : undefined,
  }
}

export async function listComputeServices() {
  const config = getZGConfig()

  if (!config.computeApiKey && !config.privateKey) {
    return {
      configured: false,
      baseUrl: config.computeBaseUrl,
      modelsUrl: config.computeModelsUrl,
      model: config.computeModel,
      verifyTee: config.computeVerifyTee,
      models: null,
    }
  }

  const response = await fetch(config.computeModelsUrl, {
    headers: {
      Authorization: await getAuthorization(config),
    },
    signal: AbortSignal.timeout(config.computeTimeoutMs),
  })
  const body = await readJson(response)
  if (!response.ok) throw new Error(formatError(body, response.status))

  return {
    configured: true,
    baseUrl: config.computeBaseUrl,
    modelsUrl: config.computeModelsUrl,
    model: config.computeModel,
    verifyTee: config.computeVerifyTee,
    models: body,
  }
}

export async function runVerifiedInference(input: {
  messages: Array<{ role: ZGChatRole; content: string }>
  maxTokens?: number
  temperature?: number
}) {
  const config = getZGConfig()
  const prompt = input.messages.map((message) => `${message.role}: ${message.content}`).join("\n")

  if (!config.computeApiKey && !config.privateKey) {
    const error = new Error("[0g-compute] Missing ZG_COMPUTE_API_KEY or PRIVATE_KEY")
    if (REQUIRE_0G) throw error
    return fallbackResult(prompt, error)
  }

  try {
    const response = await fetch(computeEndpoint("/chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: await getAuthorization(config),
      },
      body: JSON.stringify({
        model: config.computeModel,
        messages: input.messages,
        max_tokens: input.maxTokens ?? config.computeMaxTokens,
        temperature: input.temperature ?? 0.2,
        stream: false,
        verify_tee: config.computeVerifyTee,
      }),
      signal: AbortSignal.timeout(config.computeTimeoutMs),
    })

    const body = await readJson(response)
    if (!response.ok) throw new Error(formatError(body, response.status))

    const content = extractContent(body)
    if (!content) throw new Error("[0g-compute] Testnet compute response did not include assistant content")

    const teeVerified = extractTeeVerified(body)

    return {
      content,
      model: config.computeModel,
      endpoint: config.computeBaseUrl,
      responseId: body.id ?? null,
      teeVerified,
      status: teeVerified ? "verified" : "unverified",
      usage: body.usage
        ? {
          promptTokens: body.usage.prompt_tokens,
          completionTokens: body.usage.completion_tokens,
          totalTokens: body.usage.total_tokens,
        }
        : undefined,
    } satisfies ZGComputeResult
  } catch (error) {
    if (REQUIRE_0G) throw error
    return {
      ...fallbackResult(prompt, error),
      status: "failed",
    } satisfies ZGComputeResult
  }
}
