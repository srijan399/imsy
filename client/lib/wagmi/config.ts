import { getDefaultConfig } from "@rainbow-me/rainbowkit"
import { http } from "wagmi"
import type { Chain } from "viem"
import { ZG_GALILEO } from "@/lib/0g/config"

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? ZG_GALILEO.chainId)
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? ZG_GALILEO.rpcUrl
const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL ?? ZG_GALILEO.explorerUrl

export const zeroGChain: Chain = {
  id: chainId,
  name: ZG_GALILEO.name,
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
    public: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: { name: "0G Explorer", url: explorerUrl },
  },
  testnet: chainId !== 16661,
}

const projectId = process.env.NEXT_PUBLIC_WC_PROJECT_ID
if (!projectId) {
  // RainbowKit's getDefaultConfig requires a projectId for WalletConnect transports.
  // Surface a clear runtime error rather than silently falling back to a broken config.
  console.warn(
    "[wagmi] NEXT_PUBLIC_WC_PROJECT_ID is missing. Wallet connections via WalletConnect will fail until it is set.",
  )
}

export const wagmiConfig = getDefaultConfig({
  appName: "IMSY",
  projectId: projectId ?? "00000000000000000000000000000000",
  chains: [zeroGChain],
  transports: {
    [zeroGChain.id]: http(rpcUrl),
  },
  ssr: true,
})

export const FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS ?? "") as `0x${string}`
