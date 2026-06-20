import { explorerTxUrl } from "@/lib/0g/config"

export function ZGStorageBadge({
  rootHash,
  txHash,
  status,
  error,
}: {
  rootHash?: string
  txHash?: string | null
  status?: string
  error?: string
}) {
  if (!rootHash) return null

  const label = status === "uploaded" ? "0G Storage" : "0G pending"
  const shortRoot = rootHash.length > 22 ? `${rootHash.slice(0, 12)}...${rootHash.slice(-8)}` : rootHash

  return (
    <div className="inline-flex flex-wrap items-center gap-2 border border-border/40 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
      <span className={status === "uploaded" ? "text-emerald-400" : "text-amber-400"}>{label}</span>
      <span className="normal-case tracking-normal text-foreground">{shortRoot}</span>
      {txHash && (
        <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="text-accent hover:text-foreground">
          tx
        </a>
      )}
      {error && <span className="normal-case tracking-normal text-red-400">{error}</span>}
    </div>
  )
}
