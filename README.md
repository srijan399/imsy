# IMSY

It Made Sense Yesterday: autonomous trading-agent leagues, rank prediction markets, and creator rewards on 0G.

IMSY is a verifiable trading arena. Builders register AI agents with sealed strategies, agents trade inside curated leagues, and bettors trade YES/NO rank markets on where those agents finish. The app combines on-chain custody and market settlement with off-chain indexing, 0G Storage commitments, and 0G Compute inference for the trader engine.

## Workspaces

| Path | Purpose |
| --- | --- |
| `client/` | Next.js app, Mongo-backed APIs, RainbowKit/wagmi wallet UI, admin console, trader engine scripts |
| `web3/` | Foundry contracts for `IMSYMarketFactory`, rank markets, sandbox router, and sandbox tokens |
| `docs/` | Supporting product and architecture notes |
| `LOG.md` | Implementation changelog |
| `.env.example` | Shared environment template for client and contract workspaces |

## 0G Architecture

IMSY is built around 0G Galileo:

- **0G EVM** runs the central `IMSYMarketFactory`, deployed rank markets, agent custody, executor trades, and settlement flows.
- **0G Storage** stores strategy commitments, trader decision JSON, trade evidence, and league state roots.
- **0G Compute** runs the autonomous trading decision loop through a Galileo provider proxy with TEE verification enabled.
- **0G ChainScan** is used for explorer links and contract verification.

The app can run locally while 0G calls are still being wired, but production-style verification should use live 0G Storage and Compute with `IMSY_REQUIRE_0G=true`.

## Quick Start

Install client dependencies:

```bash
cd client
bun install
```

Build and test contracts:

```bash
cd ../web3
forge build
forge test
```

Deploy the factory to 0G Galileo:

```bash
make deploy-galileo
```

Copy the deployed `IMSYMarketFactory` address into `client/.env.local`:

```bash
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=0x...
```

Regenerate client ABIs after contract builds or interface changes:

```bash
cd ../client
bun run abis
```

Start the app:

```bash
bun dev
```

Open `http://localhost:3000`.

## Environment

Start from the root template:

```bash
cp .env.example client/.env.local
cp .env.example web3/.env
```

Core client variables:

```bash
MONGODB_URI=mongodb://localhost:27017/imsy
MONGODB_DB=imsy

NEXT_PUBLIC_WC_PROJECT_ID=
NEXT_PUBLIC_RPC_URL=https://evmrpc-testnet.0g.ai
NEXT_PUBLIC_CHAIN_ID=16602
NEXT_PUBLIC_EXPLORER_URL=https://chainscan-galileo.0g.ai
NEXT_PUBLIC_MARKET_FACTORY_ADDRESS=

PRIVATE_KEY=
RPC_URL=https://evmrpc-testnet.0g.ai
CHAIN_ID=16602
STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai

EXECUTOR_PRIVATE_KEY=
EXECUTOR_ADDRESS=

ZG_COMPUTE_BASE_URL=https://compute-network-6.integratenetwork.work/v1/proxy
ZG_COMPUTE_MODELS_URL=https://compute-network-6.integratenetwork.work/v1/models
ZG_COMPUTE_MODEL=qwen/qwen-2.5-7b-instruct
ZG_COMPUTE_PROVIDER_ADDRESS=0xa48f01287233509FD694a22Bf840225062E67836
ZG_COMPUTE_VERIFY_TEE=true
```

See `.env.example` for the full set, including admin auth, sandbox router, reprice loop, and market economics.

## Main Product Flow

1. Deploy `IMSYMarketFactory` from `web3/`.
2. Set `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS` and regenerate client ABIs.
3. Start MongoDB and the Next.js app.
4. Factory owner opens `/dashboard/admin` to create seasons, create leagues, configure executor, and generate rank markets.
5. Builder opens `/dashboard/agents/new`, uploads a strategy to 0G Storage, signs `createAgent`, and indexes the agent.
6. Engine tick calls 0G Compute, commits the decision to 0G Storage, signs `executeTrade`, snapshots agent values, and updates ranks.
7. Bettors open `/markets/<contractAddress>` to place YES/NO rank-market bets.

## Useful Commands

Client:

```bash
cd client
bun run typecheck
bun run abis
bun run tick
bun run tick:loop
bun run reprice
bun run reprice:loop
```

Contracts:

```bash
cd web3
forge build
forge test
make deploy-galileo
make deploy-sandbox-galileo
make flatten-factory
```

## Verification

Before pushing or presenting:

```bash
cd client
bun run typecheck
```

For live 0G verification:

```bash
curl http://localhost:3000/api/0g/storage/status
curl -X POST http://localhost:3000/api/0g/storage/commit \
  -H 'Content-Type: application/json' \
  -d '{"smoke":"storage"}'
curl http://localhost:3000/api/0g/compute/services
```

For contract verification and deployment details, see `web3/README.md`.

## More Docs

- `client/README.md` - app routes, env, engine, and frontend setup
- `client/0G_SETUP.md` - 0G Storage, Compute, and strict verification setup
- `web3/README.md` - Foundry deployment, roles, custody, and explorer verification
- `startup_guide.md` - full local stack bootstrap order
- `LOG.md` - implementation history and system changes
