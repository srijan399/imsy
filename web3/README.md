# IMSY — Foundry (`web3/`)

Solidity sources for `IMSYMarket` and the central `IMSYMarketFactory` on 0G Galileo testnet (chain id **16602**). `IMSYMarketFactory` is now the single integration contract for the whole app: market deployment, owner-gated season + league registry, and per-agent custody (deposit / withdraw / executeTrade) for the autonomous trader engine. The Next.js app reads + writes via the same address.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- A funded 0G Galileo wallet ([faucet](https://faucet.0g.ai))

## Setup

```bash
cd web3
cp ../.env.example .env
# Required: PRIVATE_KEY, ADDRESS_AS, ADDRESS_PP, EXECUTOR_ADDRESS
```

`EXECUTOR_ADDRESS` must be the wallet whose private key the Next app uses as `EXECUTOR_PRIVATE_KEY` to sign `executeTrade(...)`.

## Build + test

```bash
forge build
forge test
```

Flatten for explorer verification:

```bash
make flatten-factory
# → IMSYMarketFactory_flat.sol
```

## Deploy

```bash
make deploy-galileo
```

The deploy script:

1. Deploys `new IMSYMarketFactory(msg.sender)` (deployer = initial multi-owner + resolver).
2. Calls `factory.setExecutor(EXECUTOR_ADDRESS)` so the executor wallet can drive `executeTrade`.
3. Calls `factory.addOwner(ADDRESS_AS)` and `factory.addOwner(ADDRESS_PP)` to seed the multi-owner set.

After it broadcasts, copy the factory address into `client/.env.local`:

```bash
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=0x...
```

To regenerate the typed ABIs the Next app consumes:

```bash
cd ../client && bun run abis
```

## Roles

| Role | Set via | Authority |
|------|---------|-----------|
| Multi-owner | `addOwner` / `removeOwner` / `transferOwnership` | createSeason, createLeague, deployMarket, setResolver, setExecutor, approveDexRouter, withdrawTreasury |
| Resolver | `setResolver(address)` | resolves child markets via `IMSYMarket.resolve` |
| Executor | `setExecutor(address)` | only signer authorised to call `executeTrade(agentId, ...)` |
| Agent owner | `createAgent(...)`, `transferAgentOwnership(agentId, newOwner)` | deposit / withdraw / join / leave league for that agent |

## Custody and trade execution

Agents are logical accounts inside the central contract. `createAgent(name, strategyRoot, leagueIds[])` is `payable` — the caller's `msg.value` is custodied internally as that agent's `cashWei`. Only the agent's owner can `deposit`, `withdraw`, `transferAgentOwnership`, `joinLeague`, or `leaveLeague`.

`executeTrade(agentId, action, asset, qty, priceWei, dexRouter, dexCalldata, reasonHash)` is `onlyExecutor` and `nonReentrant`:

- `dexRouter == address(0)` and `dexCalldata.length == 0` → ledger-only mode (testnet default). Updates internal `cashWei` and per-asset `Position{ qty, avgPriceWei }` deterministically using the executor-supplied price. Emits `TradeExecuted(..., success: true, simulated: true, reasonHash)`.
- `dexRouter != address(0)` → DEX mode. Requires `approvedDexRouter[dexRouter]`. Forwards ETH to the router on buys, otherwise relies on prior token approvals on sells. The contract credits the position on success; failure emits `success: false` with no balance changes.

Treasury accounting is isolated: the `receive()` fallback only credits `treasuryWei` (used by `withdrawTreasury`). Agent custody flows never hit `receive()`.

## Verify on [Galileo ChainScan](https://chainscan-galileo.0g.ai)

Bytecode mismatches usually mean the explorer used **different compiler settings** than `forge build`. This repo’s **`foundry.toml`** compiles with:

| Setting | Value |
|---------|--------|
| Solidity | **0.8.34** (full build string is in `out/.../IMSYMarketFactory.json` → `metadata.compiler.version`, e.g. `0.8.34+commit.80d5c536`) |
| EVM | **cancun** |
| Optimization | **enabled**, **200 runs** |
| Via IR | **true** (`via_ir = true` — required; disabling IR changes bytecode entirely) |

**Recommended:** verify with Foundry so settings match automatically:

```bash
cd web3
forge build
forge verify-contract \
  "$IMSY_FACTORY_ADDRESS" \
  src/IMSYMarketFactory.sol:IMSYMarketFactory \
  --chain 16602 \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --constructor-args "$(cast abi-encode "constructor(address)" "$RESOLVER_ADDRESS")" \
  --via-ir \
  --num-of-optimizations 200 \
  --compiler-version "0.8.34+commit.80d5c536" \
  --evm-version cancun \
  --watch
```

- `RESOLVER_ADDRESS` is the `address` passed to `constructor(address _resolver)` — for `script/IMSYMarket.s.sol`, that is the **deployer EOA** (`msg.sender` at deploy time).
- If your `solc` build commit differs slightly, copy the exact `compiler.version` string from `out/IMSYMarketFactory.sol/IMSYMarketFactory.json` metadata into `--compiler-version`.

**Manual (flattened) verification:** only if the explorer exposes **optimization on (200 runs)** and **via IR / Yul pipeline**. If it has no IR toggle, use **Standard JSON input** instead:

```bash
forge verify-contract 0x0000000000000000000000000000000000000001 \
  src/IMSYMarketFactory.sol:IMSYMarketFactory \
  --show-standard-json-input > /tmp/imsy-factory-standard-input.json
```

Paste that JSON on the explorer’s “Standard JSON” / contract verification form (address and constructor args still apply).

**Constructor args** (manual hex paste): ABI-encoded single `address`:

```bash
cast abi-encode "constructor(address)" 0xYourDeployerAddress
```

## Relation to the frontend

| Location | Role |
|----------|------|
| `web3/src/*.sol` | Canonical Solidity |
| `web3/out/*/IMSYMarketFactory.json` | Build artifact consumed by `client/scripts/extract-abis.mjs` |
| `client/lib/web3/abis.ts` | Auto-generated typed ABIs (`factoryAbi`, `marketAbi`) |
| `client/hooks/contracts/use-factory.ts`, `use-market.ts` | wagmi hooks |
| `client/lib/web3/server.ts` | server-side reads, market deploy, bet verification, market resolution |
| `client/lib/engine/execute.ts` | executor signer for `executeTrade` |

When the Solidity interface changes, run `forge build` then `bun run abis` from `client/` to refresh the typed ABIs.
