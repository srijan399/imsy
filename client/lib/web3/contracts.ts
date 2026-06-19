// Re-exports: ABIs are auto-generated into ./abis.ts from the Foundry artifacts;
// this module is the single import surface used by both wagmi hooks (browser) and
// ethers helpers (server). Names are kept stable so callers don't need to care
// whether they consume the human-readable form (legacy) or the JSON ABI.
export { factoryAbi, marketAbi } from "./abis"

export function getFactoryAddress() {
  return process.env.NEXT_PUBLIC_MARKET_FACTORY_ADDRESS ?? ""
}
