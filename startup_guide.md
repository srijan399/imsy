# IMSY — startup guide

End-to-end order for a working local stack: **Foundry contracts** in `web3/`, **Next.js app** in `client/`, **MongoDB** for off-chain persistence, and a **funded executor wallet** for the trader engine.

## Status check

| Requirement | Notes |
|-------------|--------|
| MongoDB running | Local mongod or Atlas — see `MONGODB_URI` in `.env.example` |
| `client/.env.local` | `MONGODB_URI`, `MONGODB_DB`, `NEXT_PUBLIC_WC_PROJECT_ID`, `PRIVATE_KEY`, `EXECUTOR_PRIVATE_KEY`, `EXECUTOR_ADDRESS`, `ADMIN_API_TOKEN`, `SANDBOX_ROUTER_ADDRESS`, RPC + 0G storage/compute vars |
| `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS` | Set after deploying the factory from `web3/` |
| `SANDBOX_ROUTER_ADDRESS` | Set after `make deploy-sandbox-galileo`. Without it, trades fall back to ledger mode in the same factory contract. |
| `web3/.env` | `PRIVATE_KEY`, `ADDRESS_AS`, `ADDRESS_PP`, `EXECUTOR_ADDRESS`, `IMSY_FACTORY_ADDRESS` (only for sandbox deploy) |
| WalletConnect / Reown projectId | Free at https://cloud.reown.com — required for the RainbowKit Connect button. Add `http://localhost:3000` to the project allowlist for local dev. |

---

## Step 1 — Deploy contracts

```bash
cd web3
cp ../.env.example .env
# Edit .env: PRIVATE_KEY + ADDRESS_AS + ADDRESS_PP + EXECUTOR_ADDRESS
forge build
forge test
make deploy-galileo
```

The deploy script broadcasts `IMSYMarketFactory` and immediately calls `setExecutor(EXECUTOR_ADDRESS)` plus `addOwner(ADDRESS_AS)` / `addOwner(ADDRESS_PP)`.

Copy the deployed `IMSYMarketFactory` address into the client:

```bash
# client/.env.local
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=0x...
```

Regenerate the typed ABIs the Next app consumes:

```bash
cd ../client && bun run abis
```

---

## Step 1b — Deploy the sandbox economy (required)

The factory's `executeTrade(...)` is sUSD-quoted and routes through the sandbox
router. Without the sandbox stack you cannot register agents or trade.

```bash
cd web3
# .env: IMSY_FACTORY_ADDRESS=<factory address from step 1>
make deploy-sandbox-galileo
```

This deploys:
- `IMSYSandboxRouter` (USD-aware, `usdPerNative = 1e10`).
- `sUSD` token wired into the router and the factory (`setSandboxUsd`).
- 12 trading tokens: stable sBTC, sETH, sSOL, sUSDC + volatile sDOGE, sPEPE,
  sBONK, sWIF, sMOON, sJEFE, sSCAM, sRUG.
- Calls `factory.setSandboxRouter(router)` and `factory.approveDexRouter(router, true)`.
- Pre-funds the router with `SANDBOX_FUND_WEI` so the sUSD → 0G off-ramp on
  `/swap` can settle.

Copy the router address into the client:

```bash
# client/.env.local
SANDBOX_ROUTER_ADDRESS=0x...
```

Then regenerate ABIs so the new USD swap functions land in the client:

```bash
cd ../client && bun run abis
```

After the next `bun dev`, seed the Mongo `TokenRegistry` from on-chain state:

```bash
curl -X POST http://localhost:3000/api/admin/tokens/seed \
  -H "x-admin-token: $ADMIN_API_TOKEN"
```

---

## Step 2 — Start MongoDB

Local:

```bash
mongod --dbpath /usr/local/var/mongodb
```

Or run any Mongo-compatible service and point `MONGODB_URI` at it.

---

## Step 3 — Start the frontend

```bash
cd client
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

Connect a wallet via the RainbowKit button. The chain auto-prompts to switch to 0G Galileo (16602).

If the browser logs `NEXT_PUBLIC_WC_PROJECT_ID is missing`, create a Reown
project, set `NEXT_PUBLIC_WC_PROJECT_ID=<project id>` in `client/.env.local`,
and restart `bun dev`. If it logs `Origin http://localhost:3000 not found on
Allowlist`, open the project settings in Reown Cloud and add
`http://localhost:3000` to the allowlist.

---

## Step 4 — Bootstrap data (owner)

A factory owner connects their wallet, opens `/dashboard/admin`, and:

1. **Create season** — name + start/end. The page calls `factory.createSeason` and indexes the season in Mongo.
2. **Create league** — pick a season, set asset universe (csv), allowed signals, drawdown / leverage / capital. Calls `factory.createLeague` and indexes Mongo.
3. **Generate markets** — once enough agents are registered, click "Generate rank markets" to deploy `IMSYMarket` instances per (agent, tier).
4. **Executor** — confirm the trader executor address is correct or update it via `setExecutor`.

---

## Step 5 — Register an agent (builder)

A builder connects their wallet and opens `/dashboard/agents/new`. The page:

1. Uploads the strategy doc to 0G Storage (`POST /api/agents/upload-strategy`).
2. Signs `factory.createAgent(name, strategyRoot, leagueIds, { value: depositWei })`. The deposit is custodied by the central contract.
3. Indexes the new agent in Mongo (`POST /api/agents`) after on-chain verification.

The builder lands on `/dashboard/agents/<agentId>` with deposit / withdraw / transfer-ownership controls.

---

## Step 6 — Trader engine (cron-driven)

The engine has no in-process scheduler. A tick is one `POST /api/engine/tick`
with the admin token. Every tick takes a Mongo lock so concurrent fires cannot
collide.

### Local: bun script

```bash
cd client
export ADMIN_API_TOKEN=...   # same value the Next server reads
bun run tick                 # one-shot
bun run tick:loop            # foreground loop, 10 min default interval
```

Override the loop interval: `ENGINE_TICK_LOOP_MS=60000 bun run tick:loop`.
Override the target: `ENGINE_TICK_URL=https://yourapp.example/api/engine/tick bun run tick`.

### Local: crontab

```cron
*/10 * * * * cd /Users/you/imsy/client && ADMIN_API_TOKEN=xxx /usr/local/bin/node scripts/engine-tick.mjs >> /tmp/imsy-tick.log 2>&1
```

### Hosted: cronjob.org

Add a POST job hitting `https://<your-domain>/api/engine/tick` with header
`x-admin-token: <ADMIN_API_TOKEN>` on `*/10 * * * *`. The Mongo lock auto-expires
after 5 minutes so a stuck tick cannot block forever.

### Manual curl

```bash
curl -X POST http://localhost:3000/api/engine/tick \
  -H "x-admin-token: $ADMIN_API_TOKEN"
```

The legacy endpoint `POST /api/engine/start` with `{"action":"tick"}` still
works behind the same admin gate; `start`/`stop` are accepted but the scheduler
is no longer in-process.

Each tick pulls every active agent, reads sandbox prices from Mongo's
`TokenRegistry` (kept in sync by the reprice cron — see step 6b), calls 0G
Compute with `TRADER_SYSTEM_PROMPT`, then signs `executeTrade(...)` (sUSD
quoted) from the executor wallet. The factory pulls sUSD ↔ token through the
sandbox router so every successful trade is a real testnet ERC-20 swap.

---

## Step 6b — Reprice cron (drama)

A second cron drives the random-walk price oracle that updates router prices
for every registered token. Runs through `POST /api/engine/reprice-tick`,
admin-gated, lock-protected (lock name: `reprice_tick`).

```bash
cd client
bun run reprice                  # one-shot
bun run reprice:loop             # foreground 1-minute loop (override REPRICE_TICK_LOOP_MS)
```

cronjob.org schedule: `*/1 * * * *` POSTing
`https://<host>/api/engine/reprice-tick` with header
`x-admin-token: <ADMIN_API_TOKEN>`.

Each reprice tick:
- Walks every token in `TokenRegistry`.
- Stable assets drift ±1–3% with 25% trend reversal probability.
- Volatile assets drift ±10–30% with 50% reversal probability and a 30%
  chance of a 1.5–3× shock multiplier.
- `sUSDC` / `sUSD` are pegged and never move.
- Calls `router.setUsdPrice(symbol, priceUsdScaled)` from `PRIVATE_KEY`.
- Snapshots every active agent so the live PnL chart updates between engine
  ticks.

---

## Step 7 — Bet (anyone)

A bettor opens `/markets/<contractAddress>`, enters a stake, picks YES/NO, and signs the bet via wagmi. `/api/bets/index` verifies the on-chain transaction and persists the bet to Mongo.

---

## Quick reference

```bash
cd web3 && make deploy-galileo                    # deploy factory + wire executor + owners
cd client && bun run abis                         # regenerate typed ABIs
cd client && bun dev                              # start the app
curl -X POST localhost:3000/api/engine/start \
  -H "Content-Type: application/json" -d '{"action":"tick"}'
```
