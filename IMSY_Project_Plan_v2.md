# IMSY — Project Plan v2

> Current implementation audit + production-readiness gap list, written 2026-05-09 against the post-rewrite codebase. Supersedes the speculative bits of `IMSY_Project_Plan.md`.

---

## 0. TL;DR

What is real today: a single Solidity contract (`IMSYMarketFactory`) that doubles as season + league registry and central agent custody, a Next.js 16 app on RainbowKit + wagmi + Mongoose, an executor-driven trade ledger fed by a 0G Compute trader prompt, and a parimutuel YES/NO market system. Builders register agents with native 0G deposits, bettors place bets through wagmi, owners create seasons + leagues + markets through `/dashboard/admin`.

What is **not** production-grade today: trades are ledger-only (no real DEX), price feed is an env shim, the engine is a `setInterval` inside a Next route, the executor key has plenary trade authority with no on-chain bounds, the existing testnet deployment at `0x7e8749…` is the **old** factory and must be redeployed, half the API surface is unauthenticated, MongoDB writes never reconcile against on-chain state changes that happen outside the app, and there is no automated test, indexer, or observability layer at all.

This document is the audit + the roadmap to close that gap.

---

## 1. What is implemented

### 1.1 Smart contracts (`web3/src/IMSYMarketFactory.sol`)

Single 592-line contract with five responsibilities:

| Responsibility | Surface |
|----------------|---------|
| Multi-owner ownership | `addOwner`, `removeOwner`, `transferOwnership`, `getOwners`, `isOwner` |
| Resolver / executor / DEX router roles | `setResolver`, `setExecutor`, `approveDexRouter` |
| Season + league registry | `createSeason`, `createLeague`, `getSeason`, `getLeague`, `getSeasonLeagues`, `getSeasons`, `getLeagues` |
| Agent custody + accounting | `createAgent` (payable), `deposit`, `withdraw`, `transferAgentOwnership`, `joinLeague`, `leaveLeague`, `getAgent`, `getAgentLeagues`, `getAgentAssets`, `getAgentPosition`, `getAgentsByOwner` |
| Trade execution | `executeTrade(agentId, action, asset, qty, priceWei, dexRouter, dexCalldata, reasonHash)` (executor-only). Ledger mode when `dexRouter == address(0)`, DEX adapter when set. |
| Market deployment + treasury | `deployMarket`, `getMarkets`, `totalMarkets`, `withdrawTreasury`, `treasuryWei` |

`IMSYMarket.sol` is the existing parimutuel YES/NO contract (unchanged).

35 forge tests pass. Tests cover: owner-set transitions, season + league validation, agent custody auth, ledger-mode buy/sell/hold accounting, executor gating, treasury isolation from agent custody, two-sided market resolution.

### 1.2 Frontend wallet stack

- `client/components/providers.tsx` wraps the tree with `WagmiProvider` + `QueryClientProvider` + `RainbowKitProvider` (dark theme).
- `client/lib/wagmi/config.ts` builds `getDefaultConfig` pinned to 0G Galileo with HTTP transport.
- `client/components/wallet-button.tsx` is a `ConnectButton.Custom` with the existing aesthetic.
- All page-level wallet state goes through `useAccount`, `useChainId`, `useBalance`.

### 1.3 ABI generation

`client/scripts/extract-abis.mjs` reads `web3/out/IMSYMarketFactory.sol/IMSYMarketFactory.json` and `web3/out/IMSYMarket.sol/IMSYMarket.json` and writes `client/lib/web3/abis.ts` (`factoryAbi`, `marketAbi` as `as const` literals). Run via `bun run abis`.

### 1.4 Wagmi hooks (`client/hooks/contracts/`)

| Hook | Surface |
|------|---------|
| `useFactoryAddress`, `useIsFactoryOwner`, `useFactoryOwners`, `useFactoryExecutor`, `useFactoryResolver` | Role discovery |
| `useSeasonIds`, `useSeason`, `useSeasons`, `useLeagueIds`, `useLeague`, `useLeagues`, `useSeasonLeagues` | Registry reads (parallelised via `useReadContracts`) |
| `useAgent`, `useAgentLeagues`, `useAgentAssets`, `useAgentPosition`, `useAgentsByOwner` | Agent reads |
| `useCreateSeason`, `useCreateLeague`, `useCreateAgent`, `useDepositAgent`, `useWithdrawAgent`, `useTransferAgent`, `useJoinLeague`, `useLeaveLeague`, `useSetExecutor` | Factory writes |
| `useMarketSnapshot`, `useUserBets`, `usePlaceBet`, `useClaim` | Market hooks |

### 1.5 Persistence (Mongoose 9)

- `client/lib/db/mongoose.ts`: hot-reload-safe connection singleton.
- Models: `User`, `Season`, `League`, `Agent`, `Market`, `Bet`, `TradeLog`, `CreatorEarnings`.
- Repositories: `seasons`, `leagues`, `agents`, `markets`, `bets`, `trades`, `users`, `earnings`.
- The legacy `client/.data/imsy.json` JSON store, `seed.ts`, and `types.ts` are deleted.

### 1.6 Trader engine (`client/lib/engine/`, `client/lib/0g/`)

- `prompts.ts` — `TRADER_SYSTEM_PROMPT` constrains the model to a single-line decision JSON with hard rules (asset_universe membership, drawdown gate, leverage cap, position size cap).
- `prices.ts` — CoinGecko adapter with a static `SYMBOL_TO_ID` map; `EXECUTOR_VALUATION_USD_PER_0G` shim converts USD → priceWei.
- `decide.ts` — wraps `runVerifiedInference`, parses + zod-validates output, falls back to `hold` on any compute or schema failure.
- `execute.ts` — uses `EXECUTOR_PRIVATE_KEY` as ethers signer, uploads decision JSON to 0G Storage to derive `reasonHash`, then signs `factory.executeTrade(...)` in ledger mode.
- `tick.ts` — pulls every active league + agent, reads on-chain cash + positions, fetches prices, decides, executes, persists `TradeLog`, recomputes ranks from on-chain valuations + USD shim, commits a league state root to 0G Storage.
- `app/api/engine/start/route.ts` — `POST { action: "start"|"stop"|"tick" }` toggles a 10-minute `setInterval`.

### 1.7 API routes

- Reads: `GET /api/seasons[/:id[/leagues|status]]`, `GET /api/leagues[/:id[/agents|markets]]`, `GET /api/agents[/:id[/markets|trades|rank-history]]`, `GET /api/markets[/:id]`, `GET /api/leaderboard/:leagueId[/live]`, `GET /api/users/me[/earnings]`, `GET /api/bets/me`.
- Writes: `POST /api/agents/upload-strategy`, `POST /api/agents`, `POST /api/seasons`, `POST /api/leagues`, `POST /api/markets/generate`, `POST /api/markets/[id]/resolve`, `POST /api/bets/index`, `POST /api/engine/start`, `PUT /api/seasons/[id]/status`.
- 0G smoke endpoints: `GET /api/0g/storage/status`, `POST /api/0g/storage/commit`, `GET /api/0g/compute/services`, `POST /api/0g/compute/infer`.
- On-chain verification: `POST /api/agents` checks `factory.getAgent(agentId)` matches `owner_wallet` + `strategyRoot`. `POST /api/seasons` checks `factory.getSeason(...).exists` + `factory.isOwner(creator)`. `POST /api/leagues` checks `factory.getLeague(...).seasonId` matches.

### 1.8 UI surface

| Route | Purpose |
|-------|---------|
| `/` | Marketing |
| `/seasons`, `/seasons/[seasonId]`, `/seasons/[seasonId]/leagues/[leagueId]` | Season + league + leaderboard |
| `/markets`, `/markets/[contractAddress]` | Market list + bet placement |
| `/dashboard` | Hub |
| `/dashboard/agents`, `/dashboard/agents/[agentId]`, `/dashboard/agents/new` | Builder agent flows |
| `/dashboard/bets`, `/dashboard/earnings` | Bettor + builder views |
| `/dashboard/0g` | Storage + compute config status |
| `/dashboard/admin` | Owner-only console (gated by `useIsFactoryOwner`) |

### 1.9 Docs

`LOG.md`, `client/README.md`, `client/0G_SETUP.md`, `web3/README.md`, `startup_guide.md`, `IMSY_Project_Plan.md` (with delta callout), `whitepaper.md` (with delta callout), `.env.example`. All reflect the current shape.

---

## 2. What actually works end-to-end

Verified in code; not yet verified on a fresh deploy because the existing on-chain factory at `0x7e8749427503c5dccdc879de11879a4656f81738` is the old version and lacks the new methods.

| Flow | State |
|------|-------|
| RainbowKit connect + chain switch | Works |
| Owner creates season → indexed in Mongo after on-chain verify | Works |
| Owner creates league → indexed in Mongo | Works |
| Builder uploads strategy → 0G Storage → `factory.createAgent` payable → Mongo index | Works (assumes 0G Storage healthy) |
| Builder deposit / withdraw / transfer | Works (wagmi hooks wired) |
| Owner generates rank markets via `factory.deployMarket` | Works |
| Bettor places YES/NO via `usePlaceBet` → `verifyBetTransaction` → Mongo index | Works |
| Engine tick: 0G Compute → executor `executeTrade` → trade log | Works **iff** executor key is funded + 0G Compute account is initialised |
| Owner resolves market | Works |

---

## 3. Critical production gaps

Ordered by severity. Each is blocking for a real testnet launch unless tagged `[hardening]`.

### 3.1 Existing deployment is stale [BLOCKER]

`0x7e8749427503c5dccdc879de11879a4656f81738` is the pre-rewrite factory. The new contract is not redeployed. `client/.env.local` `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS` still points at the old address. Every `factory.*` call from the new ABI will revert with `function selector not recognised`.

**Fix**: redeploy with the updated `web3/script/IMSYMarket.s.sol` (which now also takes `EXECUTOR_ADDRESS`), update `client/.env.local`, run `bun run abis`. Document the new address. Old markets are abandoned.

### 3.2 Trade execution is fake [BLOCKER for "real" trading]

`executeTrade` in ledger mode credits positions at the executor-supplied price. There is no DEX, no token transfer, no slippage check, no settlement. The "agent traded BTC" claim has no on-chain backing — only an event with `simulated: true`.

**Fix path**:
- Short term: keep the simulation but rename the user-facing copy from "trades real-world assets" to "tracks simulated portfolio against live prices". Be honest.
- Medium term: integrate a real DEX. 0G Galileo has no liquid AMM today. Either deploy a UniswapV2 fork on Galileo seeded from the treasury, or pivot to "agents trade ERC-20 stables in a sandboxed pool we deploy".
- Long term: route through `approvedDexRouter` for whichever production chain wins.

### 3.3 Price oracle is an env shim [BLOCKER for trust]

`EXECUTOR_VALUATION_USD_PER_0G=0.10` is a hard-coded conversion factor. Executor self-supplies `priceWei` to `executeTrade`. A compromised executor key can:
- Arbitrarily inflate buy avgPrice (fakes "good entry").
- Drain agent cash via `sell` at near-zero price.

The contract has no upper/lower bound, no per-tick rate limit, no asset_universe membership check (asset is `bytes32`, contract does not validate against the agent's leagues' asset_universe), no max position size enforcement.

**Fix**:
- On-chain: store league asset_universe (as `bytes32[]`) on `League` and require `executeTrade` to assert membership. Add a per-trade slippage band (`require(priceWei >= floor && priceWei <= ceiling)`).
- Off-chain: feed `priceWei` from a signed oracle (Chainlink-style, or a simple multi-sig price-poster). Move USD↔native conversion on-chain too.
- Bound size: `require(qty * priceWei / 1e18 <= cashWei * maxPositionPctBps / 10000)` etc. on-chain.

### 3.4 Engine is `setInterval` inside a route handler [BLOCKER for ops]

`POST /api/engine/start { action: "start" }` registers a `setInterval` in module scope. Symptoms:

- Dies on every Next.js dev reload.
- Multiplied across multi-instance deploys (Vercel, Railway, etc.) — one tick per instance per interval.
- No leader election, no idempotency guard. Two ticks racing the same agent will both call `executeTrade` and both win or both fail with conflicting nonces.
- No retry, no backoff, no dead-letter.
- HTTP request triggers it: anyone with the URL can `start`/`stop` it.

**Fix**:
- External cron: GitHub Actions / Vercel Cron / a dedicated `imsy-engine` Node service. Drop the in-process scheduler.
- Idempotency: per-agent advisory lock in Mongo (`{ agent_id, tick_window }` with TTL) before signing.
- Auth: protect engine start/stop with an admin token header.
- Concurrency: limit per-tick parallelism (`p-limit`) so 100 agents do not fan out 100 simultaneous executor txs.
- Nonce manager: ethers `NonceManager` on the executor wallet (storage uses one already; engine does not).

### 3.5 Executor key has plenary control [SECURITY]

`onlyExecutor` lets the executor call `executeTrade` on **every** agent in the contract, not just the agent's owner's intent. There is no signed mandate, no per-agent allowlist, no "agent owner pauses executor" toggle.

**Fix**:
- Add `paused[agentId]` flag, set by agent owner. `executeTrade` reverts if paused.
- Add an executor allowlist per agent: `mapping(uint256 => mapping(address => bool)) public agentExecutors;` so multi-executor / opt-in setups work.
- Document that owner-of-factory can change executor at any time. Long-term, gate `setExecutor` behind a timelock or DAO.

### 3.6 Market resolution centralised [SECURITY]

`resolver` is a single EOA passed at construction time. `resolve(bool)` lets that EOA decide YES/NO outcomes. There is no challenge window, no optimistic oracle, no on-chain final rank source of truth.

`POST /api/markets/[id]/resolve` chooses outcome from `agent.current_rank` in **Mongo**, which is computed off-chain by the engine using a CoinGecko-shimmed valuation. A hostile operator (or a bug) can resolve any market either way.

**Fix**:
- Define final rank algorithmically and commit it on-chain at season end. Idea: `factory.finaliseLeague(leagueId, rankedAgentIds[])` only callable after `season.end`, immutable once set. Markets read from there.
- Add a UMA-style optimistic dispute window (commit outcome, anyone can challenge with bond).
- Multi-sig the resolver key.

### 3.7 No authn / authz on writes [SECURITY]

API routes accept `wallet` in the body or query. `POST /api/agents/upload-strategy` happily uploads anything anyone POSTs to 0G Storage at the **server's** expense (server's `PRIVATE_KEY` pays the gas). `POST /api/bets/index` accepts a `tx_hash` from anyone — not exploitable today because `verifyBetTransaction` checks tx sender vs. claimed wallet, but attackers can still spam Mongo writes by replaying valid txs.

**Fix**:
- SIWE (Sign-In With Ethereum) via `next-auth` + `iron-session` cookies. Every write route asserts session wallet === claimed wallet.
- Rate-limit per-IP and per-wallet (`@upstash/ratelimit` or hand-rolled with Redis).
- For 0G Storage uploads, require either a SIWE session or a one-time signed challenge to prove the caller controls the wallet that will sign `createAgent` next.
- Require a signed admin token for `POST /api/engine/start` and `POST /api/markets/generate`.

### 3.8 No event indexer [BLOCKER for correctness]

Mongo state is written by the app **after** the user submits via the UI. Any of the following desyncs Mongo from on-chain state:

- A user calls `factory.createAgent` directly via cast / etherscan → no Mongo row.
- A bet placed via the deployed `IMSYMarket` from a different frontend → no `Bet` row.
- A market resolution that does not flow through `/api/markets/[id]/resolve` → leaderboards stale.
- An `executeTrade` that lands but the post-tx Mongo write fails → `TradeLog` missing.

**Fix**: a real indexer. Options: dedicated Node service watching `factory` + each `IMSYMarket` via `eth_subscribe`/`eth_getLogs`, writing to Mongo. Reuse logic in `lib/engine/tick.ts` for valuation. Make Mongo a derived state of chain logs, not an authoritative store.

### 3.9 Strategy verification is one-way [TRUST]

Strategy doc is uploaded to 0G Storage and the `rootHash` is stored on-chain. There is no UI that downloads the doc back from 0G and renders it for the public, so the "anyone can audit my strategy" claim is unverifiable from the app today. Builders can also lie to the API about the doc contents because the upload route does not enforce a schema.

**Fix**:
- Add `GET /api/agents/[id]/strategy` that downloads from `lib/0g/storage.ts:downloadAndVerify(rootHash)` and returns the doc. Render it on the agent detail page.
- Validate doc schema with zod **before** uploading.
- Hash the doc client-side and compare against the server's returned `sha256Hash` so the server cannot quietly mutate it.

### 3.10 Performance metrics are not computed [CORRECTNESS]

Mongo `Agent.performance` carries `roi_pct`, `sharpe_ratio`, `max_drawdown_pct`, `consistency_score`, `trade_count`, `win_rate`. Of these, the engine only sets `roi_pct` and `trade_count`. `sharpe_ratio`, `max_drawdown_pct`, `win_rate`, `consistency_score` are never updated. The UI surfaces them anyway. Whitepaper scoring uses them in a weighted formula.

**Fix**: per-tick computation from the trade log + rank history. Probably extract to `lib/engine/metrics.ts`. Backfill on demand for historical agents.

### 3.11 No agent disqualification logic [CORRECTNESS]

Schema supports `status: "disqualified"` and the whitepaper has a "freeze on max_drawdown breach" rule. Nothing implements it. An agent that breaches drawdown keeps trading.

**Fix**: in `tick.ts`, after rerank, flip `status = "disqualified"` (and emit an on-chain pause flag once 3.5 is in) for any agent whose `max_drawdown_pct > league.max_drawdown_pct`.

### 3.12 0G Storage failures degrade silently [CORRECTNESS]

`uploadJsonToZG` returns `{ status: "local_hash_only" }` when the SDK fails, unless `IMSY_REQUIRE_0G=true`. In default config, "sealed strategy" can mean "we hashed it locally and never uploaded". The agent registration completes anyway; the `strategyRoot` is the SHA-256 instead of the merkle root.

**Fix**: default `IMSY_REQUIRE_0G=true` in production. Surface a clear "0G Storage not yet uploaded" badge in the UI when status is local-only. Re-attempt uploads asynchronously in a worker.

### 3.13 CoinGecko free tier will throttle [CORRECTNESS]

10–30 req/min on the demo plan. With 50+ agents per tick, every tick fetches `simple/price` per league with the full asset universe (no caching). One tick can burst into rate-limit territory.

**Fix**:
- Cache prices in Redis with a 60-second TTL keyed by symbol.
- Batch calls per tick (already done — single call per league).
- Move to a paid tier or self-hosted oracle before 100+ agents.

### 3.14 Symbol → bytes32 truncation [CORRECTNESS]

`ethers.encodeBytes32String("SOMECOIN")` truncates to 31 chars. Symbols beyond 31 chars (rare but real) silently lose data and the `getAgentPosition(id, asset)` lookup will diverge from off-chain.

**Fix**: switch the on-chain asset key to `keccak256(bytes(symbol))` and store the full string in a parallel map (or in events only).

### 3.15 No on-chain validation that asset ∈ league.asset_universe [CORRECTNESS]

`executeTrade` accepts any `bytes32 asset`. The league has no on-chain asset list (it lives in Mongo only). The contract trusts the executor.

**Fix**: extend `League` struct on-chain with `bytes32[] assets` and validate in `executeTrade` (or in a pre-trade hook).

### 3.16 Market lifecycle has no automation [CORRECTNESS]

A market's `status` in Mongo only flips when the engine or a route updates it. Nothing watches `bettingCloseTimestamp`. The `IMSYMarket` contract enforces the close at write time, so `betYes/betNo` reverts after close, but the UI shows `status: "open"` until someone manually flips it.

**Fix**: a cron worker that polls `bettingCloseTimestamp` for every non-resolved market and patches Mongo + emits a "locked" event. Or compute `status` virtually from `bettingCloseTimestamp` + `resolved` instead of storing it.

### 3.17 No claim UI [BLOCKER for bettors]

The `IMSYMarket` contract has `claim()`, the frontend has `useClaim`, but no page wires the claim button. Bettors who win cannot claim payouts from the app today.

**Fix**: on `/markets/[contract]`, when `resolved && user has unclaimed winnings`, render a "Claim payout" button that calls `useClaim`.

### 3.18 No tests for client code [HARDENING]

Zero Vitest, zero Playwright. Refactors will silently break.

**Fix**:
- Vitest unit tests for `lib/engine/decide.ts` (parser robustness against malformed compute output).
- Vitest tests for repos against `mongodb-memory-server`.
- Playwright e2e for register agent + place bet against a local Anvil + a stub compute server.

### 3.19 No CI [HARDENING]

No GitHub Actions, no auto-run of `forge test` / `bun run typecheck` on PR.

**Fix**: a `.github/workflows/ci.yml` that runs both. Block merges on red.

### 3.20 No observability [HARDENING]

Engine errors go to `console.error`. No structured logs, no metrics, no traces, no alerts. A failed tick at 03:00 silently breaks the league for 10 minutes.

**Fix**: `pino` for structured logs, OpenTelemetry traces, Sentry for the frontend, a Prometheus scrape endpoint at `/api/health/metrics` exposing tick durations + executor balance + 0G compute success rate.

### 3.21 No mobile / accessibility pass [HARDENING]

The marketing pages look mobile-friendly; the dashboard pages ship long forms with `grid-cols-3` that overflow on mobile. The admin page is desktop-only by design but is not gated on viewport.

**Fix**: viewport audit pass + `lighthouse` baseline.

### 3.22 No README onboarding for "I am a builder" [UX]

`startup_guide.md` is operator-focused. A builder arriving at the live URL has no in-app explainer for what depositing 0G means, how the agent decides, what `reasonHash` is. The whitepaper is dense.

**Fix**: an `/how-it-works` flow + tooltips on the registration form. There is a placeholder `/how-it-works` page in the repo; flesh it out.

### 3.23 Front-running of bets [SECURITY]

`betYes`/`betNo` are public-mempool calls. A whale watching the mempool can sandwich any bet that materially shifts implied odds.

**Fix**: not urgent on a parimutuel pool (no AMM curve to slip), but if an oracle-resolved market lands here, consider commit-reveal.

### 3.24 Reentrancy on DEX adapter [SECURITY]

`_dexTrade` does `dexRouter.call{value: notional}(dexCalldata)`. The contract-level `nonReentrant` mutex covers re-entry into the factory itself, but a malicious approved router can still drain side effects:
- Manipulate the `Position` write-after-call ordering: contract decrements cash *after* the call returns.
- Currently writes happen after `(bool ok,) = router.call{...}` so a re-entrant call into `withdraw` is blocked by the mutex. Good. But the position increment trusts that the router actually swapped; the contract does not measure ERC-20 balance deltas.

**Fix**: when DEX mode lands, replace the trust assumption with a `IERC20(asset).balanceOf(address(this))` snapshot diff before/after, and credit only the actual delta. Also enforce the router is whitelisted *and* the calldata's selector matches an allowlisted signature (e.g. `swapExactETHForTokens`).

### 3.25 No slippage / size guard in ledger mode [CORRECTNESS]

In ledger mode the executor can submit `qty = agent.cashWei * 1e18 / 1` and `priceWei = 1` — buy a billion units at near-zero price. Reverts only because of the `qty > 0 && priceWei > 0 && asset != bytes32(0)` check, not on size.

**Fix**: same as 3.3 — bound notional and qty by league rules on-chain.

### 3.26 `getAllAgentIds`-style enumeration is unbounded [SCALABILITY]

`getAgentsByOwner(address)` returns the entire `_ownerAgents` array. `getAgents`/`agents` enumeration assumes small N. The Mongo `engine/tick.ts` loops every active agent every 10 minutes and reads on-chain state per agent. Breaks at ~1000 agents.

**Fix**: pagination + per-tick partitioning (e.g. tick processes 50 agents per minute round-robin).

### 3.27 `WC_PROJECT_ID` fallback hides config bugs [UX]

`client/lib/wagmi/config.ts` falls back to `"00000000000000000000000000000000"` when `NEXT_PUBLIC_WC_PROJECT_ID` is missing. WalletConnect requests succeed-on-init but fail at QR-render time with a confusing error.

**Fix**: hard-error in `getDefaultConfig` if the projectId is the zero string. Render a clear in-app banner instead.

### 3.28 No canonical chain-id assertion [UX]

`CHAIN_ID` (server) and `NEXT_PUBLIC_CHAIN_ID` (client) can drift. Nothing checks consistency at boot.

**Fix**: assert at module load in `lib/0g/config.ts` that both are equal.

### 3.29 Treasury credits not surfaced [OPS]

`receive()` increments `treasuryWei` but emits no event. Owners cannot grep logs to see which markets contributed which fees.

**Fix**: add `event TreasuryCredited(address indexed from, uint256 amount, bytes data)` and emit from `receive()`. Markets currently send via raw `call{}` — that is fine, the event just records the transfer.

### 3.30 Strategy is locked at registration but contract has no `updateStrategy` [PRODUCT]

The whitepaper says strategies are immutable. The plan's "Out of scope" item says we dropped `updateStrategy`. That is consistent with the philosophy but means a builder who fixes a typo in their description has to register a new agent (and re-deposit). That is a real UX problem.

**Fix path**:
- Option A (preferred for trust): keep immutable, document, and add `pauseAgent` so builders can stop a buggy strategy without rotating it.
- Option B: re-introduce `updateStrategy(agentId, newRoot)` but only when the agent is paused, and emit a `StrategyVersioned` event so historical roots remain auditable.

### 3.31 Compute provider proxy single point of failure [OPS]

`https://compute-network-6.integratenetwork.work/v1/proxy` is a third-party-hosted proxy to the 0G Galileo compute network. If it goes down, every agent goes silent.

**Fix**:
- Add a fallback list of providers and rotate.
- Treat compute outage as a `hold` decision (already happens via `decide.ts` fallback) — make sure that path is exercised by tests.
- Talk to the 0G team about provider failover.

### 3.32 No backups for Mongo [OPS]

Local dev: ephemeral. Prod: nothing in the repo configures a backup strategy.

**Fix**: doc-level — for testnet launch, run on Atlas with point-in-time backup, or pg_dump-equivalent cron to S3.

### 3.33 Admin page is single-tier owner-only [PRODUCT]

The factory has multi-owner and a single executor. The admin UI assumes any owner can do anything: create seasons + leagues + change executor. No per-owner role split (e.g. "this owner can resolve but not change executor").

**Fix**: out of scope for the testnet launch but worth noting as a v3 feature.

### 3.34 No Sentry / error reporting on the client [OPS]

A user whose `createAgent` reverts with `Insufficient cash` sees the raw wagmi error in a `<p>` tag. No telemetry.

**Fix**: Sentry SDK; map common revert reasons to friendly UI strings.

### 3.35 No SEO / OG images on market detail pages [PRODUCT]

`/markets/[contract]` ships with a generic title. Sharing market URLs in Twitter / Discord shows nothing.

**Fix**: per-market `generateMetadata` that pulls the question + odds.

### 3.36 No e2e cleanup of cancelled flows [UX]

If a user starts `createAgent` on the register page, signs the strategy upload to 0G, then rejects the wallet prompt, the strategy doc is now permanently on 0G but no agent exists. The next attempt re-uploads. Wasteful + possibly leaks info if the strategy contained PII.

**Fix**: either upload the strategy doc only after the user signs, or cache the rootHash client-side and reuse it on retry.

### 3.37 Decision JSON is a public commit [PRIVACY]

Every per-tick decision is uploaded to 0G Storage and indexed via `reasonHash`. Anyone watching the chain can pull the decision JSON. That is the design — public verifiability — but it also publicly leaks the agent's *current* signal output. Competing builders can copy in real time.

**Fix**:
- Document this as a feature, not a bug.
- For mainnet, encrypt decisions with a key the contract holds (require TEE attestation to decrypt). Out of scope for testnet.

### 3.38 Engine has no economic safety net [SECURITY]

If 0G Compute returns garbage and the zod fallback returns `hold`, fine. But if 0G Compute returns "buy 1e18 BTC" and the qty fits within `cashWei * priceWei`, the contract executes. `decide.ts` does not validate the quantity against the agent's portfolio fraction.

**Fix**: in `decide.ts`, after parsing, clip `quantity` to `min(decided, cashWei * maxPositionPct / priceWei)`. Reject if obviously overflowing.

### 3.39 No per-environment config separation [OPS]

`.env.example` mixes server + client env vars across deploy roles (Foundry deployer, Next server, browser). Easy to leak. No `.env.production.example` vs `.env.local.example`.

**Fix**: split + add a checked-in `.env.production.example` that lists only what Vercel needs.

### 3.40 Foundry forge-lint warnings unaddressed [HOUSEKEEPING]

Build output spams `screaming-snake-case-immutable` and `unaliased-plain-import` notes. Easy fixes.

**Fix**: rename immutables to SCREAMING_SNAKE_CASE in `IMSYMarket.sol`; convert `import "forge-std/Test.sol"` to `{Test}` named import.

---

## 4. Feature gaps vs. the v1 vision

The original `IMSY_Project_Plan.md` listed 19 sections. Status against each:

| Section | v1 promise | v2 reality |
|---------|------------|------------|
| 1–3. Vision & flow | Builders register agents → engine ticks → markets settle | Yes, end-to-end, but trades are simulated |
| 4. Seasons & leagues | Fixed-window competitions, league constraints | On-chain registry done; constraint enforcement (asset universe, leverage) is off-chain only |
| 5. Agent system | Locked strategy, frozen on breach, periodic ticks | Locked: yes. Frozen on breach: not implemented. Ticks: yes (10 min) |
| 6. Market system | YES/NO parimutuel, multi-tier, creator rewards | Done (only piece largely complete) |
| 7. Creator rewards | 25% of platform fee on two-sided markets | Done; flowed through `recordCreatorEarning` |
| 8. User roles | Builder / bettor / admin | Done at the UI level; no SIWE auth so "admin" is a wallet flag |
| 9. Scoring & leaderboard | ROI + Sharpe + drawdown + win rate + frequency, weighted | Only ROI is computed |
| 10. Tech stack | Next.js + ethers + 0G | Now Next.js + wagmi + ethers (server) + 0G + Mongo |
| 11. Database schema | Mongo collections | Done |
| 12. API design | REST endpoints | Done |
| 13. Frontend structure | App-router + shadcn | Done |
| 14. Verifiability layer | Strategy hash + rank checkpoints | Strategy hash on-chain ✅. Rank checkpoint on-chain ❌ (only state root JSON in 0G Storage) |
| 15. 0G integration | Storage + DA + Compute | Storage + Compute used. DA root is committed via Storage, not the DA layer. |
| 16. Tokenomics | Native 0G fees | Done |
| 17. Power features | Strategy bidding, agent forking, etc. | None |
| 18. MVP scope | Hackathon | Reached + exceeded |
| 19. Pitch | Marketing | n/a |

---

## 5. Production-readiness checklist by domain

### 5.1 Smart contracts

- [ ] Redeploy `IMSYMarketFactory` with the new ABI (3.1).
- [ ] Add `League.assets` on-chain, validate in `executeTrade` (3.15).
- [ ] Add `paused[agentId]` flag, owner-controlled (3.5, 3.30).
- [ ] Add per-agent executor allowlist (3.5).
- [ ] Bound `executeTrade` size, slippage, and price by league rules (3.3, 3.25).
- [ ] Switch asset key to `keccak256(bytes(symbol))` (3.14).
- [ ] Emit `TreasuryCredited` (3.29).
- [ ] DEX adapter: balance-delta accounting + selector allowlist (3.24).
- [ ] On-chain final rank commitment for market resolution (3.6).
- [ ] Optimistic-oracle dispute window (3.6).
- [ ] Multi-sig the resolver / executor / owner roles (Safe) (3.5, 3.6).
- [ ] Lint clean (3.40).
- [ ] Audit (Trail of Bits / Spearbit / Code4rena spot review).
- [ ] Foundry invariants + fuzz tests for accounting + role gates.

### 5.2 Backend / engine

- [ ] Move engine to an external worker (Vercel Cron / dedicated Node service / GitHub Actions). Drop in-process `setInterval` (3.4).
- [ ] Idempotency lock per agent per tick window in Mongo (3.4).
- [ ] Nonce manager on the executor wallet (3.4).
- [ ] Per-tick concurrency cap with `p-limit` (3.4).
- [ ] Compute timeouts + fallback providers (3.31).
- [ ] Price cache layer in Redis (3.13).
- [ ] Compute decision quantity clipping (3.38).
- [ ] Backfill missing performance metrics (3.10).
- [ ] Implement disqualification on drawdown breach (3.11).

### 5.3 API / app server

- [ ] SIWE auth (`next-auth` + `iron-session`); cookie-bound wallet identity (3.7).
- [ ] Rate limiting on every write route (3.7).
- [ ] Admin token gate on `engine/start`, `markets/generate`, season/league status mutations (3.7).
- [ ] Zod validation on every `POST` route body (3.7).
- [ ] CORS pinned to the production origin.
- [ ] CSRF token on session-mutating endpoints.
- [ ] Health check `/api/health/live` + `/api/health/ready` (Mongo ping, executor balance, factory address reachable).
- [ ] OpenAPI / typed client export so future native clients can consume the API.
- [ ] Background queue for retrying failed 0G uploads (3.12).

### 5.4 Indexer

- [ ] Standalone service watching `factory` + every `IMSYMarket` (3.8).
- [ ] Event handlers reconcile `Agent`, `TradeLog`, `Market`, `Bet`, `CreatorEarnings` from chain logs.
- [ ] Replay-safe (idempotent on tx hash).
- [ ] Reorg-tolerant (track confirmed depth).
- [ ] Mongo becomes a derived view of the on-chain truth (3.8).

### 5.5 Frontend

- [ ] Claim payout UI on resolved markets (3.17).
- [ ] Strategy doc viewer fed from `downloadAndVerify` (3.9).
- [ ] Strategy schema validation client-side before upload (3.9).
- [ ] Render `local_hash_only` storage status as a clear warning (3.12).
- [ ] Real performance metrics on agent + leaderboard pages (3.10).
- [ ] Real status badges driven by `bettingCloseTimestamp` (3.16).
- [ ] Paginate `/dashboard/agents` and `/markets` (3.26).
- [ ] Mobile pass on `/dashboard/admin` and `/dashboard/agents/new` (3.21).
- [ ] Toast notifications for tx submission / confirmation / failure.
- [ ] Hard error if `NEXT_PUBLIC_WC_PROJECT_ID` is missing (3.27).
- [ ] Sentry on the client (3.34).
- [ ] Per-market `generateMetadata` for OG images (3.35).
- [ ] How-it-works builder onboarding (3.22).

### 5.6 Auth / identity

- [ ] SIWE login endpoint.
- [ ] Session middleware on `/dashboard/admin` server actions (defence-in-depth even though `useIsFactoryOwner` already gates the UI).
- [ ] Email-optional builder profile so creators can be notified of payout events.

### 5.7 Observability

- [ ] Structured logs (`pino`) with correlation IDs across API + engine + indexer (3.20).
- [ ] OpenTelemetry traces for the tick path (decide → execute → persist) (3.20).
- [ ] Prometheus metrics: tick duration, executor balance, compute success rate, storage success rate, agent count by status, market volume.
- [ ] Alerts: executor balance < threshold; tick failures > N; compute provider 5xx rate.

### 5.8 Testing + CI

- [ ] `forge test --gas-report` baseline (3.18).
- [ ] Foundry invariants for treasury isolation, agent custody, and league/season existence.
- [ ] Vitest for `decide.ts`, `prices.ts`, repos against `mongodb-memory-server` (3.18).
- [ ] Playwright e2e against Anvil + a local stub compute server (3.18).
- [ ] GitHub Actions: forge test, bun typecheck, vitest, playwright on PR (3.19).

### 5.9 Ops / infra

- [ ] Vercel (or equivalent) deploy with branch previews, env separation (3.39).
- [ ] Mongo Atlas with backups (3.32).
- [ ] Redis (Upstash) for rate-limit + price cache + engine locks.
- [ ] A `imsy-engine` service (Node + ethers + Mongoose).
- [ ] A `imsy-indexer` service.
- [ ] Status page (statuspage.io / instatus).
- [ ] Runbook docs for: executor key rotation, factory upgrade (only via redeploy + migration, since the contract has no proxy).
- [ ] Treasury wallet runbook.

### 5.10 Legal / product

- [ ] Terms of service.
- [ ] Privacy policy (the agent strategy uploads + decision logs are public).
- [ ] Geofencing: betting-style products are restricted in many jurisdictions; even on testnet a clear "this is a testnet, no real value" banner is mandatory.
- [ ] Discord / community channel.
- [ ] Brand / press kit.

---

## 6. Migration path from the current state

1. **Freeze the existing factory at `0x7e8749…`.** It is no longer used.
2. **Redeploy.** `cd web3 && make deploy-galileo` with `EXECUTOR_ADDRESS` set in `.env`. Capture the new address.
3. **Update `client/.env.local`** with the new `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS`, `EXECUTOR_PRIVATE_KEY`, `EXECUTOR_ADDRESS`, `MONGODB_URI`, `NEXT_PUBLIC_WC_PROJECT_ID`.
4. **Regenerate ABIs.** `cd client && bun run abis`. Commit `lib/web3/abis.ts`.
5. **Wipe Mongo.** All seasons / leagues / agents reference the old chain IDs; nothing carries over.
6. **Bootstrap.** Owner connects, creates Season 0, creates the inaugural league, generates markets after a few agents register.
7. **Smoke test.** Run the steps in `client/0G_SETUP.md` § 5–7.

---

## 7. Roadmap to public testnet launch

The minimum bar to invite real testnet users:

| Tier | Items | Rationale |
|------|-------|-----------|
| Must-have | 3.1, 3.4, 3.7, 3.12, 3.17, 3.27, 3.28, 3.39 | Without these the app is broken or spammable |
| Should-have | 3.3 (slippage band), 3.6 (multi-sig resolver), 3.8 (indexer), 3.9 (verifier UI), 3.10 (metrics), 3.11 (disqualification), 3.16 (auto-lock) | Without these the app is misleading |
| Nice-to-have | 3.5 (per-agent allowlist), 3.13 (price cache), 3.18–3.20 (tests + CI + observability), 3.24, 3.34, 3.35 | Operational quality of life |

A reasonable two-week sprint focuses on the must-haves + indexer + disqualification + metrics + claim UI.

## 8. Roadmap to mainnet

Everything above, plus:

- Real DEX integration (3.2).
- On-chain rank finalisation + optimistic dispute window (3.6).
- Audit + bug bounty.
- DAO / multi-sig governance for owners + executor + resolver.
- Encrypted decision payloads + TEE attestation chain.
- ERC-20 deposits + treasury management policy.
- Compliance posture: licence review, KYC for creators above a fee threshold, geofence enforcement.

---

## 9. Open questions

1. **Trade execution venue** — does IMSY ship a custom AMM on the production chain, or wait for an ecosystem DEX? Either decision blocks 3.2.
2. **Resolver decentralisation** — multi-sig now, optimistic oracle later, or jump straight to optimistic? UMA has a long tail of edge cases; building the interface plumbing now is cheap.
3. **Compute provider plurality** — the testnet provider proxy is a single endpoint. Is 0G shipping a router with multiple fallback providers in time?
4. **0G DA usage** — currently `uploadStateRoot` writes a JSON to 0G Storage. The whitepaper claims DA. Is the DA layer ready, and do we want to switch?
5. **Mainnet chain** — 0G mainnet (16661) or another EVM? Affects oracle + DEX choice.
6. **Strategy mutability** — keep immutable + add `pause`, or allow versioned `updateStrategy`?
7. **Funding model** — does IMSY take a take-rate of platform fees forever, or is there an end-state where all revenue flows to creators + treasury DAO?

---

## 10. Self-criticism

This file is a work plan, not a status report. Reading the codebase optimistically, IMSY is a hackathon-grade demo of a verifiable agent league. Reading it critically: it is one keystroke away from "the executor key swept every agent's deposits and the resolver settled every market YES". The bridge to production is mostly **bound the executor + resolver** (sections 3.3, 3.5, 3.6) and **make the ledger reflect reality, not the operator's claims** (sections 3.2, 3.8, 3.9). Everything else is polish.

The repo's recent history shows a useful pattern — central trading contract + RainbowKit + Mongo were chosen the right way, and the implementation is internally consistent. The next iteration should be the same scope of work but pointed entirely at safety, not features.
