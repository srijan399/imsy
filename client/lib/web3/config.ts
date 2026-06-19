import { ZG_GALILEO } from "@/lib/0g/config"

export const zeroGChain = {
  id: ZG_GALILEO.chainId,
  name: ZG_GALILEO.name,
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: {
    default: { http: [ZG_GALILEO.rpcUrl] },
    public: { http: [ZG_GALILEO.rpcUrl] },
  },
  blockExplorers: {
    default: { name: "0G Explorer", url: ZG_GALILEO.explorerUrl },
  },
} as const

export function getClientChainConfig() {
  return {
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? ZG_GALILEO.chainId),
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? ZG_GALILEO.rpcUrl,
    explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL ?? ZG_GALILEO.explorerUrl,
  }
}
