import "server-only"

import type { NextRequest } from "next/server"
import { ethers } from "ethers"
import { getFactoryOwner } from "@/lib/web3/server"

const HEADER = "x-admin-token"

export interface AdminAuthResult {
  ok: boolean
  reason?: "missing-token" | "no-server-token" | "mismatch"
  via?: "token" | "owner"
}

/**
 * Validate the admin token header on a write route. Returns ok=false with a
 * machine-readable reason instead of throwing.
 */
export function checkAdminToken(req: NextRequest): AdminAuthResult {
  const expected = process.env.ADMIN_API_TOKEN
  if (!expected || expected.trim().length === 0) {
    return { ok: false, reason: "no-server-token" }
  }
  const provided = req.headers.get(HEADER)
  if (!provided) return { ok: false, reason: "missing-token" }
  if (!constantTimeEqual(provided, expected)) return { ok: false, reason: "mismatch" }
  return { ok: true, via: "token" }
}

/**
 * Allow either the admin-token header (for cron / curl) or an `x-admin-wallet`
 * header that resolves to a current factory owner (for the in-app admin UI,
 * which reads the wallet from RainbowKit and never sees the server token).
 *
 * Returns the auth result plus the resolved wallet when present.
 */
export async function requireAdmin(
  req: NextRequest,
): Promise<{ ok: true; via: "token" | "owner"; wallet?: string } | { ok: false; status: number; error: string }> {
  const tokenAuth = checkAdminToken(req)
  if (tokenAuth.ok) return { ok: true, via: "token" }

  const walletHeader = req.headers.get("x-admin-wallet")
  if (walletHeader && ethers.isAddress(walletHeader)) {
    try {
      const owner = await getFactoryOwner(walletHeader)
      if (owner) return { ok: true, via: "owner", wallet: ethers.getAddress(walletHeader) }
    } catch (error) {
      return { ok: false, status: 500, error: `owner check failed: ${(error as Error).message}` }
    }
    return { ok: false, status: 403, error: "wallet is not a factory owner" }
  }

  if (tokenAuth.reason === "no-server-token") {
    return { ok: false, status: 500, error: "ADMIN_API_TOKEN not configured on server" }
  }
  return { ok: false, status: 401, error: "Unauthorised: provide x-admin-token or x-admin-wallet" }
}

export function adminTokenHeader(): typeof HEADER {
  return HEADER
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}
