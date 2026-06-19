import "server-only"

import { connectMongo } from "@/lib/db/mongoose"
import { EngineLockModel } from "@/lib/db/models/EngineLock"

const DEFAULT_TTL_MS = 5 * 60 * 1000

/**
 * Acquire a named lock backed by a unique-indexed Mongo collection. Returns a
 * release function or null if the lock is already held by another process.
 *
 * The lock auto-expires via the TTL index after `ttlMs` so a crashed holder
 * cannot block forever. Callers should still call `release` on success.
 */
export async function acquireLock(
  name: string,
  options?: { ttlMs?: number; holder?: string },
): Promise<(() => Promise<void>) | null> {
  await connectMongo()
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)

  try {
    await EngineLockModel.create({
      name,
      locked_at: now,
      expires_at: expiresAt,
      holder: options?.holder,
    })
  } catch (error: unknown) {
    const code = (error as { code?: number })?.code
    if (code === 11000) {
      // Duplicate key — someone else holds it. Best-effort sweep of expired locks.
      const swept = await EngineLockModel.deleteOne({ name, expires_at: { $lt: now } })
      if (swept.deletedCount > 0) {
        return acquireLock(name, options)
      }
      return null
    }
    throw error
  }

  return async () => {
    await EngineLockModel.deleteOne({ name })
  }
}
