import "server-only"

import { createHash } from "crypto"
import fs from "fs"
import os from "os"
import path from "path"
import { ethers } from "ethers"
import { Indexer, ZgFile } from "@0gfoundation/0g-storage-ts-sdk"
import { assertZGWriteConfig, getZGConfig } from "./config"
import { withWalletWriteLock } from "@/lib/web3/write-lock"

let cachedSigner:
  | {
      cacheKey: string
      config: ReturnType<typeof getZGConfig>
      provider: ethers.JsonRpcProvider
      baseSigner: ethers.Wallet
      indexer: Indexer
    }
  | undefined

export interface ZGStorageCommitment {
  sha256Hash: string
  rootHash: string
  txHash: string | null
  status: "uploaded" | "local_hash_only"
  error?: string
}

function sha256(data: string | Buffer) {
  return createHash("sha256").update(data).digest("hex")
}

function localCommitment(data: Buffer, error?: unknown): ZGStorageCommitment {
  const digest = sha256(data)
  return {
    sha256Hash: digest,
    rootHash: `local_0g_pending_${digest.slice(0, 32)}`,
    txHash: null,
    status: "local_hash_only",
    error: error instanceof Error ? error.message : undefined,
  }
}

function getSigner() {
  const config = getZGConfig()
  assertZGWriteConfig(config)

  const cacheKey = `${config.rpcUrl}|${config.storageIndexer}|${config.privateKey}`
  if (cachedSigner?.cacheKey === cacheKey) return cachedSigner

  const provider = new ethers.JsonRpcProvider(config.rpcUrl)
  const baseSigner = new ethers.Wallet(config.privateKey!, provider)

  cachedSigner = {
    cacheKey,
    config,
    provider,
    baseSigner,
    indexer: new Indexer(config.storageIndexer),
  }

  return cachedSigner
}

function errorText(error: unknown): string {
  if (!error) return ""
  const anyErr = error as { code?: unknown; message?: unknown; info?: unknown; error?: unknown }

  const candidates: unknown[] = [
    anyErr.code,
    anyErr.message,
    (anyErr.info as any)?.error?.message,
    (anyErr.error as any)?.message,
    error,
  ]

  const text = candidates
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

  return text
}

function isNonceExpiredLike(error: unknown): boolean {
  const text = errorText(error)

  return /NONCE_EXPIRED|nonce too low|nonce has already been used|already known|transaction already imported/i.test(text)
}

function isReplacementUnderpricedLike(error: unknown): boolean {
  const text = errorText(error)
  return /REPLACEMENT_UNDERPRICED|replacement fee too low|replacement transaction underpriced/i.test(text)
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function uploadResultTxHash(result: unknown): string | null {
  if (!result || typeof result !== "object") return null
  const candidate = result as { hash?: string; txHash?: string; transactionHash?: string }
  return candidate.txHash ?? candidate.hash ?? candidate.transactionHash ?? null
}

export async function uploadBufferToZG(data: Buffer, filename: string): Promise<ZGStorageCommitment> {
  const digest = sha256(data)
  let file: Awaited<ReturnType<typeof ZgFile.fromFilePath>> | null = null
  const tempPath = path.join(os.tmpdir(), `imsy-0g-${Date.now()}-${filename}`)

  try {
    const { config, provider, baseSigner, indexer } = getSigner()
    const signer = new ethers.NonceManager(baseSigner)
    fs.writeFileSync(tempPath, data)
    file = await ZgFile.fromFilePath(tempPath)

    const [tree, merkleErr] = await file.merkleTree()
    if (merkleErr) throw new Error(`Merkle tree failed: ${merkleErr}`)

    const rootHash = tree?.rootHash()
    if (!rootHash) throw new Error("Merkle tree returned empty root hash")

    const fileToUpload = file
    if (!fileToUpload) throw new Error("0G upload file handle was not initialized")

    // Upload with explicit options to avoid estimateGas revert.
    // The SDK's upload accepts (file, rpc, signer, uploadOpts, retryOpts, opts).
    // Setting a gasLimit prevents the SDK from calling estimateGas which fails
    // on the Flow contract when certain preconditions aren't met.
    const uploadOpts = {
      tags: "0x",
      finalityRequired: true,
      taskSize: 10,
      expectedReplica: 1,
      skipTx: false,
      fee: BigInt(0),
    }
    const retryOpts = {
      Retries: 3,
      Interval: 5,
      MaxGasPrice: 0,
    }
    const opts = {
      gasPrice: BigInt(0),
      gasLimit: BigInt(1_000_000),
    }

    const attemptUpload = async (signerToUse: ethers.Signer) =>
      withWalletWriteLock(async () => {
        const nonce = await provider.getTransactionCount(baseSigner.address, "pending")
        return indexer.upload(
          fileToUpload,
          config.rpcUrl,
          signerToUse as any,
          { ...uploadOpts, nonce: BigInt(nonce) },
          retryOpts,
          opts,
        )
      })

    let [tx, uploadErr] = await attemptUpload(signer)
    if (uploadErr && (isNonceExpiredLike(uploadErr) || isReplacementUnderpricedLike(uploadErr))) {
      // QuikNode / Galileo occasionally returns a stale pending nonce for a brief window,
      // causing nonce / replacement-underpriced errors. A fresh retry matches the manual
      // "Generate again" workaround without affecting other functionality.
      for (let attempt = 0; uploadErr && attempt < 3; attempt++) {
        await delay(750 * (attempt + 1))
        const retrySigner = new ethers.NonceManager(baseSigner)
        ;[tx, uploadErr] = await attemptUpload(retrySigner)
        if (uploadErr && !isNonceExpiredLike(uploadErr) && !isReplacementUnderpricedLike(uploadErr)) break
      }
    }

    if (uploadErr) {
      // If the error indicates the file was already submitted on-chain,
      // treat it as a success since the data is already stored.
      const errMsg = String((uploadErr as any).message ?? uploadErr)
      if (errMsg.includes("already uploaded and finalized")) {
        return {
          sha256Hash: digest,
          rootHash,
          txHash: null,
          status: "uploaded",
        }
      }
      throw new Error(`0G upload failed: ${errMsg}`)
    }

    return {
      sha256Hash: digest,
      rootHash,
      txHash: uploadResultTxHash(tx),
      status: "uploaded",
    }
  } catch (error) {
    if (process.env.IMSY_REQUIRE_0G === "true") throw error
    return localCommitment(data, error)
  } finally {
    if (file) await file.close()
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
}

export async function uploadJsonToZG(payload: unknown, filename: string) {
  return uploadBufferToZG(Buffer.from(JSON.stringify(payload, null, 0), "utf8"), filename)
}

export async function uploadStrategyCommitment(strategyConfig: unknown) {
  return uploadJsonToZG(strategyConfig, "strategy-commitment.json")
}

export async function uploadTradeLog(tradeEntry: unknown) {
  return uploadJsonToZG(tradeEntry, `trade-${Date.now()}.json`)
}

export async function uploadStateRoot(stateRoot: string, metadata: unknown) {
  return uploadJsonToZG({ stateRoot, metadata, timestamp: new Date().toISOString() }, `state-root-${Date.now()}.json`)
}

export async function downloadAndVerify(rootHash: string): Promise<Buffer> {
  const { config, indexer } = getSigner()
  const tempPath = path.join(os.tmpdir(), `imsy-0g-download-${Date.now()}`)

  try {
    const err = await indexer.download(rootHash, tempPath, true)
    if (err) throw err
    return fs.readFileSync(tempPath)
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
}
