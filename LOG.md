# IMSY change log

## 2026-05-10 — pre-trade portfolio guard

### 0G Compute trader pipeline (`client/lib/0g/`, `client/lib/engine/`)

- Added a deterministic pre-trade guard in `client/lib/engine/decide.ts` after 0G Compute JSON parsing and before `executeTrade`:
  - Rejects sells when the asset is not currently held on-chain or the requested quantity exceeds the agent position.
  - Rejects buys when quantity / price are invalid, notional exceeds cash, or the resulting asset exposure exceeds `strategy.risk_profile.max_position_size_pct`.
  - Rejects assets outside the league universe or the agent strategy universe.
  - Converts blocked model outputs into `hold` decisions with a short reason instead of letting contract gas estimation fail.
- Tightened `client/lib/0g/prompts.ts` so the model treats `portfolio.cashUsd` and `portfolio.positions` as authoritative, explicitly handles absent positions as zero holdings, and mirrors the buy/sell invariants enforced by code.
- Expanded agent price context:
  - `TokenRegistry` now tracks `previous_price_usd` and `last_change_pct` on every reprice.
  - `fetchTokenPrices` now sends agents `base_price_usd`, `previous_price_usd`, `change_pct`, `change_from_base_pct`, `last_direction`, and `asset_class` for every league token.
  - The trader prompt now instructs agents to use those movement fields and not invent unavailable RSI / candle / volume / macro context.
- Added `initialUsd`, `roiPct`, and `currentDrawdownPct` to the agent portfolio context, and made the pre-trade guard block non-hold actions when current drawdown breaches the league cap.
- Fixed ROI/ranking ergonomics:
  - ROI snapshots now retain sub-basis-point precision instead of truncating small gains to zero.
  - Leaderboard trade counts now count successful buy/sell fills, not hold decisions.
  - New agent registration now defaults the deposit to the selected league's `initial_capital` instead of a hardcoded `$1,000,000`.
  - Tiny nonzero ROI values render as `<0.01%` / `<0.1%` instead of disappearing as `0.00%`.
- Added Maximum Drama directives to engine ticks:
  - Each active league tick randomly selects up to three agents and assigns a random league asset plus a `$100,000` or `$200,000` buy target.
  - Targeted agents receive `drama_directive` in their compute payload; the prompt treats it as a sandbox-only narrative shock event.
  - If a targeted model ignores the directive, `decide.ts` rewrites the decision into a buy for the target asset before the pre-trade guard runs.
  - Cash, asset pricing, and drawdown guards still block impossible trades; drama bypasses strategy max-position sizing but not custody constraints.
- Hardened 0G Storage uploads against transient nonce collisions:
  - `replacement transaction underpriced` / `replacement fee too low` now retry with fresh nonce state under the upload lock before falling back to local commitments.
  - Replaced deprecated Mongoose `{ new: true }` options with `{ returnDocument: "after" }` in repository updates.
- Added a shared server-side wallet write lock for `PRIVATE_KEY` transactions:
  - 0G Storage uploads and sandbox router reprices now serialize through `withWalletWriteLock`.
  - Reprice no longer seeds a manual nonce counter from potentially stale state; every router write uses the pending nonce under the lock and retries nonce-race errors once.
- Hardened executor and drama fills:
  - `executeTrade` now serializes through the shared wallet write lock and retries nonce-race errors using the pending executor nonce.
  - Buy decisions are normalized to the current price payload before execution.
  - Forced drama buy quantities include a small quote safety haircut so `minTokenOut` does not exceed the sandbox router quote due to JS / 1e18 rounding.
- Improved sandbox USD price precision:
  - `usdToScaled` now preserves up to 18 decimal places instead of micro-USD precision, so meme-coin reprices like PEPE / BONK no longer flatten to coarse `$0.000001` buckets during valuation or router price updates.
- Added `client/scripts/chaos-market.mjs` plus `bun run chaos` / `bun run chaos:loop`:
  - Randomly shocks active league token prices on-chain and in Mongo.
  - Meme coins use huge 0.1x-11x moves by default; major coins use 0.5x-1.5x moves.
  - Executes random executor buy/sell trades for active agents, writes trade logs, snapshots, ranks, and PnL immediately so charts look lively.
  - Chaos now executes trades before the price shock and quantizes quantities to whole tokens so new bags actually fill and then move with the spike/crash.
  - Each fresh buy is assigned a `pump` or `rug` fate; the following reprice intentionally moons some bought assets and nukes others so agents can diverge hard in both directions.
- Manually cooled the High Risk League demo chart by rugging PEPE to `$0.000000000001` on the sandbox router and Mongo, then writing `manual_glacier_pepe_rug` snapshots; Glacier dropped from the runaway top slot to about `-91.48%` ROI.
- Smoothed the High Risk League demo PnL history for all six agents into a believable chart band after the chaos run produced multi-thousand/million-percent historical outliers; latest demo ROI order is Sentinel `+153.7%`, Quicksilver `+86.3%`, Surge Protocol `+68.8%`, Apex Thrust 2 `+18.8%`, Ironclad `-24.6%`, Glacier `-31.8%`.
- Reconciled the smoothed demo leaderboard back to actual on-chain holdings:
  - Sold Quicksilver's excess DOGE at a temporary low DOGE mark.
  - Trimmed Surge Protocol's DOGE bag to a believable size.
  - Burned Quicksilver's excess cash with a transiently expensive WIF buy, then restored WIF.
  - Restored DOGE and raised PEPE to a final mark where Glacier's actual PEPE holdings land around `-31.8%` ROI.
  - Wrote `demo_asset_reconcile` snapshots from actual cash + positions so the latest chart/leaderboard rows match the assets a normal valuation tick would read.
- Rebalanced future chaos price shocks:
  - Random shocks now pick an explicit pump/rug direction instead of sampling uniformly across one wide factor range, which had an upward drift.
  - Pump/rug magnitudes are sampled in log space; default meme moves are reciprocal up to `11x` / `1/11x`, and major-token crashes can still reach `0.5x`.
  - Fresh chaos buys now default to a 50/50 pump-vs-rug fate.
- Upgraded the live PnL chart from plain lines to per-agent gradient area lines using each agent's configured color.

## 2026-05-09 — central trading contract + RainbowKit + Mongo + 0G compute trader

### Smart contracts (`web3/`)

- Rewrote `web3/src/IMSYMarketFactory.sol` into the single integration contract for IMSY:
  - Added `executor` role and `approvedDexRouter` mapping.
  - Added `Season` and `League` registries with owner-gated `createSeason` / `createLeague` and view helpers (`getSeason`, `getLeague`, `getSeasons`, `getLeagues`, `getSeasonLeagues`).
  - Added per-agent custody and accounting: `createAgent` (payable, deploys an internal agent record with native deposit), `deposit`, `withdraw`, `transferAgentOwnership`, `joinLeague`, `leaveLeague`, plus `getAgent`, `getAgentLeagues`, `getAgentAssets`, `getAgentPosition`, `getAgentsByOwner`.
  - Added `executeTrade(agentId, action, asset, qty, priceWei, dexRouter, dexCalldata, reasonHash)` — only callable by the configured executor. Ledger mode (router = address(0)) updates internal cash + positions deterministically; DEX mode forwards to an approved router and credits the resulting balance change.
  - Added a separate `treasuryWei` accumulator so `withdrawTreasury` can never touch agent custody. Added a reentrancy mutex on `withdraw` and `executeTrade`.
  - Events: `SeasonCreated`, `LeagueCreated`, `AgentCreated`, `AgentDeposited`, `AgentWithdrawn`, `AgentOwnershipTransferred`, `LeagueJoined`, `LeagueLeft`, `TradeExecuted`, `ExecutorUpdated`, `DexRouterApproved` (existing market + owner events retained).
- Rewrote `web3/test/IMSYMarketFactoryTest.t.sol` covering the new role, registry, custody, and trade-execution paths (35 tests passing).
- Updated `web3/script/IMSYMarket.s.sol` to wire the executor at deploy time via `setExecutor(EXECUTOR_ADDRESS)` and add `ADDRESS_AS` / `ADDRESS_PP` as additional owners.

### Frontend wallet stack (`client/components/`, `client/lib/`)

- Replaced the custom EIP-1193 wallet provider with RainbowKit + wagmi + TanStack Query. New entry points: `client/lib/wagmi/config.ts`, `client/components/providers.tsx`.
- `client/components/wallet-button.tsx` now wraps `ConnectButton.Custom`.
- Deleted `client/components/wallet-provider.tsx` and `client/lib/wallet/ethereum.ts`. Moved `shortWallet` and `formatNativeBalanceDisplay` to `client/lib/web3/format.ts`.
- ABIs are now generated from compiled Foundry artifacts: new `client/scripts/extract-abis.mjs` writes `client/lib/web3/abis.ts` (`factoryAbi`, `marketAbi` as `as const`). `client/lib/web3/contracts.ts` re-exports these. Added `bun run abis` to `package.json`.

### Wagmi hook layer (`client/hooks/contracts/`)

- New `use-factory.ts`: typed reads (`useSeasons`, `useLeagues`, `useAgent`, `useAgentsByOwner`, `useIsFactoryOwner`, `useFactoryExecutor`, ...) and writes (`useCreateSeason`, `useCreateLeague`, `useCreateAgent`, `useDepositAgent`, `useWithdrawAgent`, `useTransferAgent`, `useJoinLeague`, `useLeaveLeague`, `useSetExecutor`).
- New `use-market.ts`: `useMarketSnapshot`, `useUserBets`, `usePlaceBet`, `useClaim`.

### MongoDB layer (`client/lib/db/`)

- Added Mongoose 9 with a Next-friendly connection singleton at `client/lib/db/mongoose.ts`.
- Models: `User`, `Season`, `League`, `Agent`, `Market`, `Bet`, `TradeLog`, `CreatorEarnings`.
- Repositories: `seasons`, `leagues`, `agents`, `markets`, `bets`, `trades`, `users`, `earnings`.
- Removed the JSON store layer entirely — `client/lib/data/store.ts`, `client/lib/data/seed.ts`, `client/lib/data/types.ts`, and `client/.data/imsy.json` are gone.

### 0G Compute trader pipeline (`client/lib/0g/`, `client/lib/engine/`)

- `client/lib/0g/prompts.ts` — new `TRADER_SYSTEM_PROMPT` for the autonomous trading agent. Strict JSON output schema, hard rules for risk, leverage, drawdown, asset universe.
- `client/lib/engine/prices.ts` — CoinGecko adapter and a `priceWei` shim controlled by `EXECUTOR_VALUATION_USD_PER_0G` (testnet only).
- `client/lib/engine/decide.ts` — wraps `runVerifiedInference` from 0G Compute, parses + validates the JSON decision (zod), falls back to `hold` on any compute or schema failure.
- `client/lib/engine/execute.ts` — uploads the decision JSON to 0G Storage to derive `reasonHash`, then signs `executeTrade(...)` from the `EXECUTOR_PRIVATE_KEY` wallet.
- `client/lib/engine/tick.ts` — the new tick driver: pulls every active league + agent, fetches strategy/positions/prices, decides, executes, persists `TradeLog`, recomputes leaderboard ranks, commits a league state-root to 0G Storage.
- `client/app/api/engine/start/route.ts` — rewritten to drive `runEngineTick` on a 10-minute cadence (was 15 min).

### API routes

- New `POST /api/agents/upload-strategy` for sealing strategy docs to 0G Storage during registration.
- `POST /api/agents` now requires `{ agent_id, tx_hash, owner_wallet, strategy_root, leagues, deposit_wei, strategy }` and verifies the on-chain agent owner + strategyRoot before persisting.
- `POST /api/seasons`, `POST /api/leagues` now verify the on-chain `SeasonCreated` / `LeagueCreated` state before persisting; require factory ownership for season writes.
- `POST /api/markets/[id]/resolve` rewritten on the Mongo + Solidity layer; persists creator earnings via `recordCreatorEarning`.
- `POST /api/bets/index` keeps the bet flow but switched to the Mongo repository and `verifyBetTransaction`.
- `GET /api/agents/[id]` now merges Mongo with on-chain reads (`getAgent`, positions, CoinGecko valuation).
- All season/league/market/bet/leaderboard reads moved to Mongo repositories; existing endpoints retained.

### UI

- `client/app/dashboard/agents/new/page.tsx` rewritten — three-step flow (upload strategy → wagmi `createAgent` with deposit → Mongo index). New `Initial deposit (0G)` field.
- `client/app/dashboard/agents/[agentId]/page.tsx` rewritten — server-side merge of Mongo agent + on-chain custody + position valuations + trade ledger.
- New `client/components/agents/agent-actions.tsx` — owner-gated deposit / withdraw / transfer-ownership controls via wagmi.
- New `client/app/dashboard/admin/page.tsx` — owner-only console for seasons, leagues, market generation, executor configuration. Header link gated by `useIsFactoryOwner`.
- `client/app/dashboard/agents/page.tsx`, `client/app/dashboard/bets/page.tsx`, `client/app/dashboard/earnings/page.tsx` migrated to wagmi `useAccount` + `<ConnectButton />`.
- `client/components/markets/betting-panel.tsx` rewritten over `usePlaceBet`.
- `client/components/marketing-header.tsx` adds the owner-only Admin link and reads ownership from `useIsFactoryOwner`.
- `client/components/leaderboard/leaderboard-table.tsx` updated to key off `agent_id` (numeric on-chain id) instead of legacy `_id` strings.
- Pages that linked to `season._id` / `market._id` / `league._id` switched to `chain_id_hex` / `contract_address`.

### Env + config

- `.env.example` updated: required `MONGODB_URI`, `MONGODB_DB`, `NEXT_PUBLIC_WC_PROJECT_ID`, `EXECUTOR_PRIVATE_KEY`, `EXECUTOR_ADDRESS`, `COINGECKO_API_KEY`, `COINGECKO_BASE_URL`, `EXECUTOR_VALUATION_USD_PER_0G`. Removed the comment claiming Mongo was unused.

### Verification

- `cd web3 && forge test` — 35 tests pass.
- 0G Compute calls now consume the new `TRADER_SYSTEM_PROMPT`. The smoke test at `POST /api/0g/compute/infer` is unchanged but should be re-run after deploy.
- Smoke flow:
  1. `forge build && make deploy-galileo` (factory + executor wired).
  2. `cd client && bun install && bun dev`.
  3. Owner: `/dashboard/admin` → create season → create league → generate markets.
  4. Builder: `/dashboard/agents/new` → form + deposit → strategy uploaded to 0G → `factory.createAgent` signed → indexed in Mongo.
  5. `POST /api/engine/start { "action": "tick" }` — executor signs a `TradeExecuted` per agent and persists trade logs.
  6. Bettor: `/markets/<contract>` → `usePlaceBet` → `/api/bets/index` records the bet.

### Removed
- `client/components/wallet-provider.tsx`, `client/lib/wallet/ethereum.ts`, `client/lib/data/{store,seed,types}.ts`, `client/.data/imsy.json`, the `IMSY_FACTORY_ABI` / `IMSY_MARKET_ABI` human-readable strings, the `calculateRanks` helper that depended on the old in-memory store.

---

## 2026-05-09 (afternoon) — sandbox DEX, engine tick reliability, claim UI, strategy viewer, admin auth

### Smart contracts (`web3/`)
- New `web3/src/SandboxToken.sol`: minimal mintable ERC-20 (sBTC / sETH / sSOL etc.) used as simulated assets.
- New `web3/src/IMSYSandboxRouter.sol`: fixed-price swap venue keyed by `bytes32` symbols. `swapNativeForToken`, `swapTokenForNative`, owner-set prices, owner-funded native reserves for sells, slippage guard, full event trail.
- `IMSYMarketFactory._dexTrade` rewritten over the new sandbox interface: real ERC-20 balance-delta accounting, native-balance delta on sells, automatic allowance reset on sell failure, `try/catch` so router reverts surface as `success=false` without rolling back the agent's prior state.
- `IMSYMarketFactory.receive()` now only credits `treasuryWei` when `msg.sender` is a factory-deployed market (`isMarket[]`), so sandbox-router refunds during sells do not contaminate the platform-fee bucket.
- `web3/script/IMSYSandbox.s.sol` deploys router + sBTC + sETH + sSOL, registers prices, pre-funds the router, and calls `factory.approveDexRouter` on the existing factory address.
- `Makefile` adds `make deploy-sandbox-galileo`. `make test` now runs the full suite (factory + sandbox).
- `web3/test/IMSYSandboxRouter.t.sol`: 13 tests covering router unit ops, factory-driven buys + sells, slippage rejection, treasury isolation, asset-not-on-router and router-not-approved reverts.

### Frontend (`client/`)
- `lib/web3/abis.ts` regenerates from `IMSYSandboxRouter` + `SandboxToken` artifacts (`sandboxRouterAbi`, `sandboxTokenAbi`).
- `lib/engine/execute.ts` auto-detects the sandbox router via `SANDBOX_ROUTER_ADDRESS` env. If the asset is registered on the router, it routes `executeTrade` through DEX mode; otherwise it stays in ledger mode. Parses the on-chain `TradeExecuted` event for `success` / `simulated`, returns `mode` ("ledger" | "sandbox-dex") and the router address consumed by the trade log.
- `lib/engine/tick.ts` records `mode` per result and returns aggregate totals (`agents_processed`, `trades_executed`, `trades_failed`).
- New `lib/db/models/EngineLock.ts` + `lib/db/locks.ts`: Mongo-backed unique-key lock with TTL auto-sweep so concurrent ticks cannot collide.
- New `lib/auth/admin.ts`: `requireAdmin(req)` accepts either `x-admin-token` (against `ADMIN_API_TOKEN`) or `x-admin-wallet` (validated via `factory.isOwner` on chain). Constant-time token comparison.
- New `app/api/engine/tick/route.ts` (canonical tick endpoint, admin-gated).
- `app/api/engine/start/route.ts` rewritten: drops the in-process `setInterval`. Action `start`/`tick` now runs exactly one tick under the same Mongo lock. `stop` is a no-op shim.
- `app/api/markets/generate`, `app/api/markets/[id]/resolve`, `app/api/seasons/[id]/status` now require `requireAdmin`.
- New `app/api/agents/[id]/strategy/route.ts`: pulls the strategy doc from 0G Storage by root hash, verifies sha256 against the stored commitment, surfaces `local-hash-only` and `mongo-only` fallback states without crashing.

### UI
- New `components/agents/strategy-viewer.tsx`: agent detail page now shows the strategy doc fetched from 0G Storage with verification status, root-match check between Mongo and on-chain, and graceful failure modes.
- New `components/markets/claim-panel.tsx`: full claim flow on `/markets/[contract]`. Detects connected wallet's YES/NO stakes, market resolution, already-claimed state, wrong-network state. Runs `useClaim` then refreshes market state on success.
- Engine tick is cron-driven, not a UI button. New `client/scripts/engine-tick.mjs` is a single-shot poster that reads `ENGINE_TICK_URL` + `ADMIN_API_TOKEN` and exits. Wired into `package.json` as `bun run tick` and `bun run tick:loop` (foreground local loop, default 10-minute interval, override via `ENGINE_TICK_LOOP_MS`). Suitable for local crontab or hosted cronjob.org / Vercel Cron / GitHub Actions schedules.

---

## 2026-05-10 — drama upgrade (sUSD custody + reprice oracle + live PnL chart)

Hackathon pivot: stop pretending the testnet money is small. Make it visible, dramatic, simulated, but every trade is still a real testnet transaction.

### Smart contracts (`web3/`)

- `web3/src/IMSYSandboxRouter.sol` extended with a USD universe alongside the legacy native universe:
  - New constructor arg `usdPerNative` (peg, default `1e10 * 1e18`).
  - `setSandboxUsd(address)` to register the sUSD ERC-20.
  - `swapNativeForUsd(minOut)` payable, `swapUsdForNative(usdIn, minNativeOut)`.
  - `swapUsdForToken(symbol, usdIn, minOut)`, `swapTokenForUsd(symbol, amountIn, minUsdOut)`.
  - `setUsdPrice(symbol, priceUsd)` and `setPrice(symbol, priceWei)` keep `usdPriceOf` and `priceOf` consistent via the peg.
  - Existing native-asset functions (`swapNativeForToken`, `swapTokenForNative`) retained for the cosmetic `/swap` page.
- `web3/src/IMSYMarketFactory.sol` refactored for sUSD custody:
  - `cashWei` → `cashUsd`; `Position.avgPriceWei` → `Position.avgPriceUsd`.
  - New slots: `sandboxUsd`, `sandboxRouter`, `treasuryUsd` (reserved).
  - `createAgent(name, root, leagues, depositUsd)` is no longer payable — it pulls sUSD via `IERC20.transferFrom`. Same for `deposit(agentId, amountUsd)`. `withdraw` returns sUSD.
  - `executeTrade(agentId, action, asset, qty, priceUsd, reasonHash)` drops `dexRouter` + `dexCalldata`. Adapter logic moved to `_sandboxTrade`, which routes through `sandboxRouter.swapUsdForToken` / `swapTokenForUsd` and reconciles via balance-delta accounting (cash + position).
  - Markets still run native fees through the existing `treasuryWei` path; the `isMarket` filter in `receive()` remains so sandbox refunds cannot inflate it.
- `web3/script/IMSYSandbox.s.sol` rewritten to deploy:
  - Router (`USD_PER_NATIVE = 1e28`).
  - sUSD via `SandboxToken("Sandbox USD","sUSD",router)` and register under `bytes32("USD")`.
  - 12 trading tokens: stable BTC/ETH/SOL/USDC + volatile DOGE/PEPE/BONK/WIF/MOON/JEFE/SCAM/RUG.
  - `factory.setSandboxUsd`, `factory.setSandboxRouter`, `factory.approveDexRouter`, router `fund` for sUSD off-ramp liquidity.
- `web3/test/IMSYMarketFactory.t.sol` trimmed to owner / season / league / market / treasury cases. Agent custody + trade tests live in `web3/test/IMSYSandboxRouter.t.sol`.
- `web3/test/IMSYSandboxRouter.t.sol` covers: router unit tests (peg, slippage, USD-not-tradable guard), factory ↔ router integration (createAgent pulls sUSD, deposit/withdraw, buy mints tokens to factory and debits cashUsd, sell redeems sUSD, insufficient cash revert, USD-only swap path).
- 40 / 40 forge tests pass.

### Mongo (`client/lib/db/`)

- `Agent.deposit_wei` → `deposit_usd`; new required `icon` and `color` fields.
- `models/AgentValueSnapshot.ts` (new): `{agent_id, league_chain_id_hex, timestamp, cash_usd, position_value_usd, total_value_usd, pnl_pct, snapshot_kind}` indexed by league + agent + TTL-pruned after 7 days.
- `models/TokenRegistry.ts` (new): `{symbol, contract_address, asset_class, base_price_usd, current_price_usd, last_direction, last_updated}`.
- New repos `lib/db/repositories/values.ts` and `lib/db/repositories/tokens.ts` for snapshots and registry.

### Engine (`client/lib/engine/`)

- `prices.ts` now reads from Mongo `TokenRegistry` (no CoinGecko). Adds `usdToScaled` / `scaledToUsd` for the 1e18 USD ↔ number conversion.
- `decide.ts` snapshot fields renamed (`cashUsd`, `totalValueUsd`, `avgPriceUsd`); recent-trade `priceUsd` instead of `priceWei`. Prompt + parser unchanged.
- `execute.ts` rewritten for the new factory signature; passes `priceUsd` and reads success / simulated from the parsed `TradeExecuted` event.
- `tick.ts` recomputes ranks in USD, writes an `AgentValueSnapshot` per agent per tick, and exports `rerankLeagueAndSnapshot` for reuse by the reprice tick.
- `reprice.ts` (new): random-walk oracle. Stable: ±1–3% with 25% reversal. Volatile: ±10–30% with 50% reversal and 30% shock × 1.5–3×. Floors at base/1000, ceils at base × 1000. Calls `router.setUsdPrice` from `PRIVATE_KEY`, updates Mongo, then writes snapshots for every active agent.

### API routes

- `POST /api/agents` now requires `icon`, `color`, `deposit_usd`; validates icon and color against the curated allowlist.
- `POST /api/engine/reprice-tick` (new): admin-gated (`requireAdmin`), Mongo lock `reprice_tick`, runs `runRepriceTick()`.
- `GET /api/leagues/[id]/pnl-history?since=&interval=` (new): returns per-agent PnL series with icon + color metadata for the chart.
- `GET /api/tokens` (new): public token registry read.
- `POST /api/admin/tokens/seed` (new): walks `router.getRegisteredAssets()`, decodes symbols, populates Mongo `TokenRegistry`. Idempotent.

### Wagmi hooks

- `useSandboxUsdAddress`, `useSandboxRouterAddress`, `useUsdBalance(address)`.
- `useCreateAgent` is now a two-step submit (approve sUSD → `createAgent(name, root, leagues, depositUsdScaled)`).
- `useDepositAgent(id)` / `useWithdrawAgent(id)` switched to USD with the same approve-then-call shape.
- `useSwapNativeForUsd(routerAddress)` and `useSwapUsdForNative(routerAddress, sUsdAddress)` for the `/swap` page.

### Frontend libraries + components

- `lib/web3/peg.ts` — `formatUsd`, `formatUsdCompact`, `usdToScaled`, native↔USD helpers, `USD_PER_NATIVE` constant.
- `lib/agents/icons.ts` — 30 curated Lucide icon names + 30 hex colors. Server validators `isValidAgentIcon` / `isValidAgentColor`.
- `components/agents/icon-picker.tsx` — registration grid for picking icon + color, plus `<AgentIconRender>` used throughout the chart and detail page.
- `components/leaderboard/live-pnl-chart.tsx` — Recharts LineChart polling `/api/leagues/[id]/pnl-history` every 15 s. Per-agent line in their picked color, midline at 0%, custom legend with icon + name + last PnL%.

### Pages

- `/swap` (new): two cards (buy sUSD with native, sell sUSD for native), live wallet balances, big numbers, `formatUsdCompact` for `$1.0B`-style labels.
- `/dashboard/agents/new` rewritten: USD deposit field, IconPicker, sUSD balance check (deep-link to `/swap` if low), three-step submit (upload strategy → approve sUSD → createAgent → index Mongo).
- `/dashboard/agents/[agentId]` updated to USD: cash card uses `formatUsdCompact`, positions show USD avg + last, trade ledger shows USD price.
- `/seasons/[seasonId]/leagues/[leagueId]` embeds `<LivePnlChart>` above the leaderboard.
- `/live` (new): fullscreen demo route with a league selector and the same chart.
- `components/agents/agent-actions.tsx` — deposit / withdraw inputs are USD; deposit does approve + transferFrom in one click.

### Cron + scripts

- `scripts/reprice-tick.mjs` (new): single-shot POST to `/api/engine/reprice-tick` with the admin token. Same shape as `engine-tick.mjs`. `--loop` flag for foreground demo loops; default interval 60 s (override via `REPRICE_TICK_LOOP_MS`).
- `package.json` adds `bun run reprice` and `bun run reprice:loop`.

### Env

- `.env.example` simplified: keeps `ADMIN_API_TOKEN`, `IMSY_FACTORY_ADDRESS`, `SANDBOX_ROUTER_ADDRESS`, `SANDBOX_FUND_WEI`, adds `REPRICE_TICK_LOOP_MS`. Removes `EXECUTOR_VALUATION_USD_PER_0G` (peg lives in the router constants now) and the legacy `SANDBOX_PRICE_*_WEI` knobs.

### Demo flow (testnet)

1. `cd web3 && forge build && forge test` → 40 / 40 green.
2. `make deploy-galileo` → new factory address. Update `client/.env.local` `NEXT_PUBLIC_MARKET_FACTORY_ADDRESS` and `IMSY_FACTORY_ADDRESS`.
3. `IMSY_FACTORY_ADDRESS=<new> make deploy-sandbox-galileo` → router + sUSD + 12 tokens.
4. Set `SANDBOX_ROUTER_ADDRESS` in `client/.env.local`.
5. `cd ../client && bun run abis`.
6. Wipe Mongo (`mongosh "$MONGODB_URI" --eval 'db.dropDatabase()'`).
7. `bun dev`.
8. `curl -X POST localhost:3000/api/admin/tokens/seed -H "x-admin-token: $ADMIN_API_TOKEN"`.
9. Owner creates Season + League with asset universe `BTC,ETH,SOL,DOGE,PEPE,WIF,MOON,JEFE,SCAM,RUG,BONK`.
10. Open `/swap`, swap 0.001 0G → 10,000,000 sUSD.
11. Open `/dashboard/agents/new`, pick a Skull / hot-pink agent, deposit 1,000,000 sUSD, submit.
12. Run two crons in two terminals: `bun run tick:loop` and `bun run reprice:loop`.
13. Open `/seasons/<id>/leagues/<id>` (chart embedded above the leaderboard) or `/live` (fullscreen demo).

### Verification

- `forge test` → 40 / 40 pass.
- `bun run typecheck` clean.
- `bun run test:parser` (existing) → 15 / 15 pass.

### Backward-compat sweep

No Mongo backward compatibility. All legacy `*_wei` field names removed:
- `TradeLog.price_wei` → `price_usd`.
- `TradeLog.portfolio_value_wei_after` → `portfolio_value_usd_after`.
- `Agent.deposit_wei` removed (only `deposit_usd` remains).
- `tick.ts` deposit-string fallback to `deposit_wei` deleted.
- Agent detail trade-log render reads `trade.price_usd`.

Demo flow assumes a fresh database — `mongosh "$MONGODB_URI" --eval 'db.dropDatabase()'` before first `bun dev` post-redeploy. Existing rows from any prior version cannot be migrated.
- Honest copy pass: landing/seasons/how-it-works metadata + register-agent deposit hint now describe the venue as "0G Galileo testnet sandbox" with simulated sBTC / sETH / sSOL assets.

### Env
- New keys in `.env.example`: `ADMIN_API_TOKEN`, `IMSY_FACTORY_ADDRESS`, `SANDBOX_ROUTER_ADDRESS`, `SANDBOX_FUND_WEI`, `SANDBOX_PRICE_{BTC,ETH,SOL}_WEI`.

### Testnet demo flow
1. `cd web3 && forge test` → 48 tests green.
2. `make deploy-galileo` (skip if factory already deployed) → record `IMSYMarketFactory` address.
3. `IMSY_FACTORY_ADDRESS=<factory> make deploy-sandbox-galileo` → record router address.
4. Set `SANDBOX_ROUTER_ADDRESS` and `ADMIN_API_TOKEN` in `client/.env.local`.
5. `cd client && bun run abis && bun dev`.
6. Owner: connect on `/dashboard/admin` → create season → create league with asset universe `BTC,ETH,SOL` → click **Run engine tick** after at least one agent registers.
7. Builder: register at `/dashboard/agents/new` with native deposit; agent detail now shows strategy verified from 0G Storage.
8. Bettor: place a YES/NO bet at `/markets/<contract>`; claim from the same page once an owner resolves.
