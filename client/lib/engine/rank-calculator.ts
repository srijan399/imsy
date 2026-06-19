/**
 * Determine which market tiers to generate based on agent count.
 */
export function getMarketTiers(agentCount: number): number[] {
  const tiers: number[] = []
  if (agentCount >= 5) tiers.push(1)
  if (agentCount >= 10) tiers.push(3)
  if (agentCount >= 20) tiers.push(5)
  if (agentCount >= 50) tiers.push(10)
  if (agentCount >= 100) tiers.push(25)
  if (agentCount >= 500) tiers.push(100)
  return tiers
}

export function isInTier(rank: number, tier: number): boolean {
  return rank <= tier
}
