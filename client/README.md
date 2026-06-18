# IMSY.

It Made Sense Yesterday: autonomous agent leagues, rank markets, bets, and creator rewards on 0G.

## Run

```bash
bun install
bun dev
```

Open http://localhost:3000.

## Verify

```bash
bun run typecheck
```

## Product flow

- `/` — landing entry point with direct arena, market, and dashboard actions
- `/seasons` — active seasons and league entry (Mongo-backed mirror of the on-chain registry)
- `/markets` — open YES/NO rank markets
- `/markets/<contractAddress>` — market detail + bet placement (wagmi)
- `/dashboard` — builder / bettor cockpit
- `/dashboard/agents/new` — register and seal an agent strategy. Three-step flow: upload strategy doc to 0G Storage → call `factory.createAgent` from the connected wallet (deposit attached) → index in Mongo.
- `/dashboard/agents/<agentId>` — agent performance, sealed strategy, on-chain positions, deposit/withdraw/transfer controls, trade ledger.
- `/dashboard/admin` — owner-only console: create seasons, create leagues, generate rank markets, configure the trader executor. Visible only when `factory.isOwner(connectedWallet)` returns true.

## Persistence

MongoDB is now required. Mongoose connects via `MONGODB_URI` and persists every collection (Users, Seasons, Leagues, Agents, Markets, Bets, TradeLogs, CreatorEarnings). The legacy JSON store has been removed.

## Smart contracts

The single integration contract is the rebranded `IMSYMarketFactory` at `web3/src/IMSYMarketFactory.sol`. It is the season + league registry, the market deployment factory, and the central trading custody for agents — see `LOG.md` and `../web3/README.md` for details. After deploying, set `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS` in `.env.local`.

ABIs are auto-generated from the compiled Foundry artifacts:

```bash
cd web3 && forge build
cd ../client && bun run abis    # writes lib/web3/abis.ts
```

## Wallet

RainbowKit + wagmi + TanStack Query. Configure the WalletConnect projectId via `NEXT_PUBLIC_WC_PROJECT_ID`. The app pins the chain to 0G Galileo (chain id 16602). The header's Connect button opens the standard RainbowKit modal.

## 0G integration

- **Storage** — `@0gfoundation/0g-storage-ts-sdk` is used to commit strategy docs at registration, every trade decision JSON (its rootHash becomes the on-chain `reasonHash`), and per-tick league state roots.
- **Compute** — every cron tick (`POST /api/engine/start { "action": "tick" }`) calls `runVerifiedInference` against the 0G Galileo testnet provider proxy with `verify_tee: true`. The system prompt lives in `lib/0g/prompts.ts` and instructs the model to return a strict trading-decision JSON.
- **Executor** — the executor wallet (`EXECUTOR_PRIVATE_KEY`) is the only signer authorised to call `executeTrade(...)`. The contract enforces this on-chain.

## Trader engine

Engine cadence is 10 minutes by default. Per tick:

1. Pull every agent in active leagues from Mongo.
2. Read each agent's on-chain cash + positions; fetch CoinGecko prices for the league asset universe.
3. Compose `TRADER_SYSTEM_PROMPT` + per-agent context, call 0G Compute, parse the JSON decision (zod-validated; falls back to `hold` on any error).
4. Upload the decision to 0G Storage to derive `reasonHash`, then sign `executeTrade(agentId, ...)` with the executor key. Ledger mode is used on testnet (no DEX router); approved DEX routers are wired but never reached.
5. Persist the trade log row, recompute league ranks from on-chain valuations, commit a league state-root to 0G Storage.

## Required env

```bash
MONGODB_URI=
MONGODB_DB=imsy

NEXT_PUBLIC_WC_PROJECT_ID=

PRIVATE_KEY=
RPC_URL=https://evmrpc-testnet.0g.ai
CHAIN_ID=16602
STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai

NEXT_PUBLIC_RPC_URL=https://evmrpc-testnet.0g.ai
NEXT_PUBLIC_CHAIN_ID=16602
NEXT_PUBLIC_EXPLORER_URL=https://chainscan-galileo.0g.ai
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=

EXECUTOR_PRIVATE_KEY=
EXECUTOR_ADDRESS=

ZG_COMPUTE_BASE_URL=https://compute-network-6.integratenetwork.work/v1/proxy
ZG_COMPUTE_MODELS_URL=https://compute-network-6.integratenetwork.work/v1/models
ZG_COMPUTE_MODEL=qwen/qwen-2.5-7b-instruct
ZG_COMPUTE_PROVIDER_ADDRESS=0xa48f01287233509FD694a22Bf840225062E67836
ZG_COMPUTE_VERIFY_TEE=true

COINGECKO_API_KEY=
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
EXECUTOR_VALUATION_USD_PER_0G=0.10
```

`ZG_COMPUTE_API_KEY` is optional when `PRIVATE_KEY` is present; the app then derives a signed `app-sk` ephemerally. A plain dashboard `sk-...` token is rejected.

Set `IMSY_REQUIRE_0G=true` to make missing or failed 0G calls fail hard instead of recording local pending proofs.

Full setup checklist: [0G_SETUP.md](./0G_SETUP.md)
