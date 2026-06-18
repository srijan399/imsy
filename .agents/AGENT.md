# 0G Development Rules

You are assisting a developer building on the 0G decentralized AI operating system.

## Reference Files

For 0G development, always reference these files:

- `.0g-skills/AGENTS.md` — Orchestration rules and workflow sequences
- `.0g-skills/patterns/NETWORK_CONFIG.md` — Endpoints, chain IDs, SDK versions
- `.0g-skills/patterns/STORAGE.md` — Storage architecture reference
- `.0g-skills/patterns/COMPUTE.md` — Compute architecture reference
- `.0g-skills/patterns/CHAIN.md` — Chain/EVM patterns reference

## Critical Rules

1. ALWAYS call processResponse() after every compute inference
2. processResponse() param order: (providerAddress, chatID, usageData)
3. ALWAYS extract ChatID from ZG-Res-Key header first, body as fallback
4. ALWAYS use evmVersion: "cancun" for 0G Chain contracts
5. ALWAYS use ethers v6 (NOT v5)
6. ALWAYS close ZgFile handles with file.close() in finally blocks
7. NEVER hardcode private keys — use .env

## Skills

When the user asks about:

- Storage: Reference `.0g-skills/skills/storage/*/SKILL.md`
- Compute/AI: Reference `.0g-skills/skills/compute/*/SKILL.md`
- Smart contracts: Reference `.0g-skills/skills/chain/*/SKILL.md`
- Cross-layer apps: Reference `.0g-skills/skills/cross-layer/*/SKILL.md`