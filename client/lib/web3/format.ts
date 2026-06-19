import { ethers } from "ethers"

export function shortWallet(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatNativeBalanceDisplay(wei: bigint) {
  const n = Number(ethers.formatEther(wei))
  if (!Number.isFinite(n)) return ethers.formatEther(wei).slice(0, 12)
  if (n === 0) return "0"
  if (n > 0 && n < 0.0001) return "<0.0001"
  if (n < 1) return n.toFixed(4).replace(/\.?0+$/, "") || "0"
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
