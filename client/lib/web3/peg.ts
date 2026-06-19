// USD display utilities for the sandbox economy.
//
// The router stores a single fixed peg between native 0G and sUSD:
//   usdPerNative = 1e10 USD per 0G
// The engine and the UI both surface USD values as 1e18-scaled bigint strings
// (matching the contract). These helpers are display-only.

export const USD_PER_NATIVE = 10_000_000_000 // 1e10 USD per 1 0G
export const USD_SCALE = 10n ** 18n

/** Convert a 1e18-scaled USD bigint (or its string repr) to a Number for display. */
export function usdToNumber(scaled: bigint | string): number {
  const v = typeof scaled === "bigint" ? scaled : BigInt(scaled || "0")
  // Lose precision on the fractional 1e18 tail — fine for display.
  return Number(v / 10n ** 12n) / 1_000_000
}

/** Format a 1e18-scaled USD bigint with thousand separators + 2 decimals. */
export function formatUsd(scaled: bigint | string): string {
  const n = usdToNumber(scaled)
  if (!Number.isFinite(n)) return "—"
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

/** Compact display for big numbers, e.g. "$1.2B". */
export function formatUsdCompact(scaled: bigint | string): string {
  const n = usdToNumber(scaled)
  if (!Number.isFinite(n)) return "—"
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`
  return `$${n.toFixed(2)}`
}

/** Convert a USD number (e.g. 1_000_000) into the 1e18-scaled bigint the contract expects. */
export function usdToScaled(usd: number): bigint {
  if (!Number.isFinite(usd) || usd <= 0) return 0n
  // Two-step to avoid float underflow on very small fractions:
  const whole = Math.floor(usd)
  const frac = Math.round((usd - whole) * 1e6) // micro-USD precision
  return BigInt(whole) * USD_SCALE + (BigInt(frac) * USD_SCALE) / 1_000_000n
}

/** Native (1 0G = 1e18 wei) bigint → USD (1e18 scaled). */
export function nativeWeiToUsdScaled(nativeWei: bigint): bigint {
  return (nativeWei * BigInt(USD_PER_NATIVE) * USD_SCALE) / USD_SCALE / USD_SCALE
}

/** Inverse: USD scaled → native wei. Used when displaying off-ramp quotes. */
export function usdScaledToNativeWei(usdScaled: bigint): bigint {
  return (usdScaled * USD_SCALE) / (BigInt(USD_PER_NATIVE) * USD_SCALE)
}
