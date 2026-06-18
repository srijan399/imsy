# IMSY 0G setup guide

This project qualifies as a 0G app only when the live 0G paths are configured:

- **0G Storage** — sealed strategy commitments, per-tick decision JSON (`reasonHash`), trade logs, league state roots
- **0G Compute** — verified autonomous trader inference (TEE-attested chat completions)
- **0G Galileo EVM** — central trading + market factory contract, executor-driven `executeTrade`

The app still runs without live 0G by writing `local_hash_only` pending proofs. For demo judging, configure live 0G and set `IMSY_REQUIRE_0G=true`.

## 1. Install

```bash
bun install
cd ../web3 && forge build
cd ../client && bun run abis    # regenerate lib/web3/abis.ts from compiled artifacts
```

Key dependencies: `@0gfoundation/0g-storage-ts-sdk`, `ethers`, `viem`, `wagmi`, `@rainbow-me/rainbowkit`, `mongoose`.

## 2. Environment

Create `client/.env.local`. Never commit this file.

```bash
# Persistence (required)
MONGODB_URI=mongodb://localhost:27017/imsy
MONGODB_DB=imsy

# Wallet UI
NEXT_PUBLIC_WC_PROJECT_ID=...

# Server wallet (deploys, market resolution, 0G storage uploads)
PRIVATE_KEY=0x...
RPC_URL=https://evmrpc-testnet.0g.ai
CHAIN_ID=16602
STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai

# Browser-visible chain config
NEXT_PUBLIC_RPC_URL=https://evmrpc-testnet.0g.ai
NEXT_PUBLIC_CHAIN_ID=16602
NEXT_PUBLIC_EXPLORER_URL=https://chainscan-galileo.0g.ai
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=0x...

# Backend trade executor (only signer authorised to call executeTrade)
EXECUTOR_PRIVATE_KEY=0x...
EXECUTOR_ADDRESS=0x...

# 0G Compute
ZG_COMPUTE_API_KEY=app-sk-...
ZG_COMPUTE_BASE_URL=https://compute-network-6.integratenetwork.work/v1/proxy
ZG_COMPUTE_MODELS_URL=https://compute-network-6.integratenetwork.work/v1/models
ZG_COMPUTE_MODEL=qwen/qwen-2.5-7b-instruct
ZG_COMPUTE_PROVIDER_ADDRESS=0xa48f01287233509FD694a22Bf840225062E67836
ZG_COMPUTE_VERIFY_TEE=true

# Trader engine price oracle shim (testnet only)
COINGECKO_API_KEY=
COINGECKO_BASE_URL=https://api.coingecko.com/api/v3
EXECUTOR_VALUATION_USD_PER_0G=0.10

# Strict mode for judging
IMSY_REQUIRE_0G=true
```

Notes:

- `PRIVATE_KEY` may include or omit `0x`. The wallet must be funded on 0G Galileo.
- `ZG_COMPUTE_API_KEY` must be a signed `app-sk-...` token. Plain dashboard `sk-...` tokens are rejected. If absent, the app derives an ephemeral signed token from `PRIVATE_KEY`.
- The wallet still needs a funded 0G Compute ledger and provider sub-account on testnet. If inference says `account not exist`, fund and run `bun run fund:compute`.
- `router-api.0g.ai` / `pc.0g.ai` are rejected; the app is pinned to the Galileo testnet provider proxy.
- `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS` is the `IMSYMarketFactory` deployed from `web3/` (the same contract is now also the season + league + agent custody registry). See [web3/README.md](../web3/README.md).
- `EXECUTOR_PRIVATE_KEY` must correspond to the address passed at deploy time via `factory.setExecutor(...)`.

## 3. Storage smoke test

```bash
bun dev
curl -X POST http://localhost:3000/api/0g/storage/commit \
  -H 'Content-Type: application/json' \
  -d '{"smoke":"storage"}'
```

Success returns `{ status: "uploaded", rootHash: "...", txHash: "0x..." }`. `local_hash_only` means the SDK ran but live upload failed — inspect `error`.

## 4. Compute smoke test

Provider config:

```bash
curl http://localhost:3000/api/0g/compute/services
```

Free-form prompt:

```bash
curl -X POST http://localhost:3000/api/0g/compute/infer \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Return a single trading decision JSON for asset BTC, action hold, quantity 0."}'
```

Success returns `{ status: "verified", teeVerified: true, content: "..." }`. The `verify_tee: true` flag is sent by default and the response trace is parsed for TEE evidence.

If you see `account not exist`, fund the wallet then run `bun run fund:compute`.

## 5. End-to-end flow

1. Owner connects via the RainbowKit Connect button. Open `/dashboard/admin` → create a season → create a league (asset universe + signals).
2. Builder opens `/dashboard/agents/new` → fills the form including the **Initial deposit (0G)** field → submits. The page seals the strategy doc to 0G Storage, then signs `factory.createAgent(name, strategyRoot, leagueIds, { value: depositWei })`. After the receipt confirms, the new agent is indexed in Mongo and you are redirected to the agent detail page.
3. (Optional) `POST /api/markets/generate { league_id }` from the admin console deploys rank markets via `factory.deployMarket`.
4. Drive the trader engine:

   ```bash
   curl -X POST http://localhost:3000/api/engine/start \
     -H 'Content-Type: application/json' \
     -d '{"action":"tick"}'
   ```

   The tick:
   - Pulls every active agent from Mongo
   - Reads on-chain cash + positions
   - Composes the `TRADER_SYSTEM_PROMPT` with the strategy + portfolio + CoinGecko prices + recent trades
   - Calls 0G Compute with `verify_tee: true`
   - Uploads the decision JSON to 0G Storage to derive `reasonHash`
   - Signs `factory.executeTrade(agentId, action, asset, qty, priceWei, address(0), 0x, reasonHash)` from the executor wallet
   - Persists the trade to Mongo and refreshes league ranks
   - Commits a league state-root to 0G Storage

5. Bettor opens `/markets/<contractAddress>` and places a YES/NO bet. The wagmi flow signs `betYes`/`betNo` and `/api/bets/index` verifies the tx and persists the bet to Mongo.

## 6. Strict judging mode

```bash
IMSY_REQUIRE_0G=true
```

With strict mode on, missing or failed 0G Storage / Compute calls throw instead of recording local pending proofs.

## 7. Pre-demo verification

```bash
bun run typecheck
curl http://localhost:3000/api/0g/storage/status
curl -X POST http://localhost:3000/api/0g/storage/commit -H 'Content-Type: application/json' -d '{"demo":"proof"}'
curl -X POST http://localhost:3000/api/engine/start -H 'Content-Type: application/json' -d '{"action":"tick"}'
```

Minimum demo-ready result:

- storage commit returns `status: "uploaded"`
- engine tick returns at least one league with `results[].txHash` non-null and `success: true`
- compute result has `status: "verified"` if the testnet compute API key is configured and TEE verification succeeds

## 8. Mongo

The `.data/imsy.json` JSON store is gone. The Next API routes connect to MongoDB via `MONGODB_URI` on first request. Indexes are declared in `client/lib/db/models/*.ts`; Mongoose creates them on the first connection.
