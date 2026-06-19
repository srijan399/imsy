import type { Hash, PublicClient, TransactionReceipt } from "viem"

function stringifyError(error: unknown): string {
  if (!error) return ""
  if (typeof error === "string") return error
  if (error instanceof Error) {
    // viem errors reliably set `name` (e.g. TransactionReceiptNotFoundError),
    // but their message may omit the class name.
    return error.name ? `${error.name}: ${error.message}` : error.message
  }
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function isTransientReceiptLookupError(error: unknown): boolean {
  const text = stringifyError(error)

  // viem-specific not-found errors (normal while pending)
  if (/TransactionReceiptNotFoundError|TransactionNotFoundError/i.test(text)) return true

  // viem's message form for TransactionReceiptNotFoundError (name may be lost in some serializations)
  if (/Transaction receipt with hash .* could not be found/i.test(text)) return true

  // 0G RPC occasionally responds with a non-standard error instead of `null`.
  if (/no matching receipts found/i.test(text)) return true
  if (/missing or invalid parameters/i.test(text) && /eth_getTransactionReceipt/i.test(text)) return true

  return false
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForTransactionReceiptSafe(
  client: PublicClient,
  {
    hash,
    timeoutMs = 180_000,
    pollingIntervalMs = 1_500,
  }: {
    hash: Hash
    timeoutMs?: number
    pollingIntervalMs?: number
  },
): Promise<TransactionReceipt> {
  const startedAt = Date.now()
  let lastError: unknown

  // Keep polling `getTransactionReceipt` directly so we can treat
  // specific RPC glitches as "still pending".
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await client.getTransactionReceipt({ hash })
    } catch (error) {
      lastError = error
      if (!isTransientReceiptLookupError(error)) throw error
    }

    await sleep(pollingIntervalMs)
  }

  const suffix = lastError ? ` Last error: ${stringifyError(lastError)}` : ""
  throw new Error(`Timed out waiting for transaction receipt.${suffix}`)
}
