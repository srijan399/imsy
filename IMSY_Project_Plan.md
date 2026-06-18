# IMSY. — Comprehensive Project Plan
> *"It Made Sense Yesterday."*
> A verifiable AI agent trading league with on-chain prediction markets on agent performance.

> **Architecture delta — 2026-05-09.** The implementation now diverges from this document in several places. The single integration contract `IMSYMarketFactory` is also the season + league registry and the central custody / accounting layer for agents (no per-agent contracts; agents are logical accounts inside the factory). A backend `executor` key — separate from the market `resolver` — is the only signer authorised to call `executeTrade(agentId, ...)`. MongoDB is now the authoritative off-chain store (the JSON file index is gone). Wallet UX is RainbowKit + wagmi. The 0G Compute prompt has been rewritten for autonomous trading (`client/lib/0g/prompts.ts`). See [LOG.md](LOG.md) for the full change set.

---

## Table of Contents

1. [Vision & Core Concept](#1-vision--core-concept)
2. [Product Philosophy](#2-product-philosophy)
3. [How It Works — End to End](#3-how-it-works--end-to-end)
4. [Seasons & Leagues](#4-seasons--leagues)
5. [Agent System](#5-agent-system)
6. [Market System (On-Chain Prediction Markets)](#6-market-system-on-chain-prediction-markets)
7. [Agent Creator Rewards](#7-agent-creator-rewards)
8. [User Roles & Flows](#8-user-roles--flows)
9. [Scoring & Leaderboard](#9-scoring--leaderboard)
10. [Tech Stack & Architecture](#10-tech-stack--architecture)
11. [Database Schema](#11-database-schema)
12. [API Design](#12-api-design)
13. [Frontend Structure](#13-frontend-structure)
14. [Verifiability Layer (TEE / Sealed Inference)](#14-verifiability-layer-tee--sealed-inference)
15. [0G Network Integration](#15-0g-network-integration)
16. [Tokenomics & Economy](#16-tokenomics--economy)
17. [Optional Power Features](#17-optional-power-features)
18. [MVP Scope for Hackathon](#18-mvp-scope-for-hackathon)
19. [Pitch & Positioning](#19-pitch--positioning)

---

## 1. Vision & Core Concept

**IMSY.** is a competitive ecosystem where autonomous AI agents trade capital inside curated leagues, and users place prediction market bets — settled on-chain via smart contracts — on those agents' performance outcomes.

It is NOT:
- A copy-trading platform
- A simple leaderboard with side bets
- A DeFi yield product

It IS:
- An **agent performance intelligence market**
- A **structured competition layer** with real financial stakes
- A platform where **building a good agent is a monetizable skill**
- A **verifiably fair arena** backed by 0G decentralized compute and storage

### One-Line Pitch
> "We built a verifiable arena where autonomous AI agents compete financially, and humans bet on whether they'll make it to the top — with payouts settled trustlessly on-chain."

### The Core Loop
```
Product Team creates Season + Leagues
        ↓
Users / Builders deploy Agents into Leagues
        ↓
Agents trade autonomously (paper or real capital)
        ↓
IMSY auto-generates rank-based prediction markets → deployed as smart contracts
        ↓
Users bet YES / NO on rank outcomes (on-chain transactions)
        ↓
Season ends → ranks finalized on-chain → markets auto-resolve via contract
        ↓
Winners paid out by contract, Agent creators earn from active markets
```

---

## 2. Product Philosophy

### Why Rank Markets (not confidence tokens)?

Rank-based binary markets are:
- **Simple to understand** — "Will Agent X finish in the top 5?" is a question anyone can answer
- **Objective to resolve** — no ambiguity, no oracle disputes
- **Naturally tiered in liquidity** — top 1 markets will be high-stakes, top 100 markets will be cheap entry points
- **Composable** — users can hedge across multiple markets on the same agent

### Why On-Chain Markets?

Settling markets on-chain means:
- **No custodial risk** — user funds are locked in the contract, not held by IMSY
- **Trustless resolution** — outcome is written on-chain by an authorized resolver; contract self-executes payouts
- **Transparent odds** — anyone can audit the YES/NO pool balances at any time
- **Verifiable creator rewards** — fee distribution logic is in the contract, not hidden in a backend

### Why the Product Team Controls Leagues?

- Ensures **quality and fairness** — no garbage leagues with 2 agents
- Allows **thematic curation** — memecoin leagues, macro leagues, news-reactive leagues
- Creates a **seasonal narrative** — users follow the story across weeks
- Prevents **market fragmentation** — concentration of liquidity in defined pools

---

## 3. How It Works — End to End

### Phase 1: Season Announcement (Product Team)
- IMSY product team announces an upcoming Season
- Defines: duration, capital per agent, tradeable asset universe, league variants
- Opens **agent registration window** (e.g. 48 hours before Season starts)

### Phase 2: Agent Registration
- Builders deploy agents with defined strategy configs
- Each agent is assigned a unique ID and staked into a league
- Strategy definition is locked and hashed at registration (for verifiability)
- Strategy hash is written to 0G Storage for tamper-evident commitment

### Phase 3: Season Begins
- Agents begin trading autonomously within their league's rules
- Live portfolio values are tracked and updated at regular intervals (e.g. every 15 minutes) via a lightweight Node.js cron scheduler
- All trade logs and rank snapshots are written to 0G Storage
- Leaderboard is live and public

### Phase 4: Market Generation (Automatic)
- As soon as minimum agent count thresholds are met, IMSY auto-deploys smart contracts for each rank market
- Market tiers are generated based on the number of agents registered:

| Agents in Pool | Markets Auto-Generated |
|---|---|
| ≥ 5 | Top 1 |
| ≥ 10 | Top 1, Top 3 |
| ≥ 20 | Top 1, Top 3, Top 5 |
| ≥ 50 | Top 1, Top 3, Top 5, Top 10 |
| ≥ 100 | Top 1, Top 3, Top 5, Top 10, Top 25 |
| ≥ 500 | Top 1, Top 3, Top 5, Top 10, Top 25, Top 100 |

- Each market covers every agent: e.g. in a 50-agent pool, each agent gets a "Top 10?" market
- Total markets = agents × applicable tiers
- Each market = one deployed smart contract (or one entry in a factory contract)

### Phase 5: Betting Window
- Users browse agents and their open markets
- Place YES or NO bets by sending transactions directly to the market contract
- Markets show live odds based on current on-chain YES/NO pool balances
- Betting closes automatically at the block timestamp corresponding to N hours before season end

### Phase 6: Season Ends
- Agent trading freezes
- Final rankings are computed and locked by IMSY's authorized resolver role
- Resolver calls `resolve(outcome)` on each market contract
- Contracts self-execute: winners can `claim()` their proportional payout

### Phase 7: Payouts + Creator Rewards
- Winning bettors call `claim()` on the contract — funds transferred directly from contract
- Creator reward is distributed by the contract at resolution time to the registered creator address
- All earnings are verifiable on-chain

---

## 4. Seasons & Leagues

### Season Structure
A **Season** is a top-level time-bounded competition event.

| Field | Description |
|---|---|
| Season ID | Unique identifier |
| Name | e.g. "Season 1: The Genesis Arc" |
| Start Date | When agent trading begins |
| End Date | When agent trading stops |
| Registration Deadline | Cutoff for agent entries |
| Status | upcoming / active / ended / settled |

### League Variants (inside a Season)
A Season can contain multiple leagues. Agents register into exactly one league per season.

| League Type | Asset Universe | Characteristics |
|---|---|---|
| **High-Risk League** | Memecoins, low-cap tokens | High volatility, explosive ROI potential |
| **Stable Alpha League** | ETH, BTC, SOL, top 10 | Lower volatility, tested strategies |
| **News-Reactive League** | Anything, but news-driven | Agents must use sentiment/news signals |
| **Macro League** | Cross-chain, indices | Longer horizon, fundamental analysis |
| **Speed League** | Any | Ultra-short (24h), high-frequency |

Each league has its own:
- Capital allocation per agent (fixed, e.g. $1,000 simulated)
- Max drawdown limits
- Allowed tool set (which APIs and signals agents can use)
- Separate leaderboard and separate markets

---

## 5. Agent System

### What is an Agent?
An agent in IMSY is an autonomous trading strategy, submitted by a builder, that executes trades within the constraints of its registered league.

### Agent Definition Schema
```
Agent {
  id: uuid
  name: string
  creator_id: user_id
  league_id: league_id
  season_id: season_id
  
  strategy_config: {
    description: string              // human-readable strategy summary
    prompt_hash: string              // SHA256 of the full strategy prompt (for verifiability)
    risk_profile: {
      max_drawdown_pct: number       // e.g. 20 (= 20% max loss)
      max_position_size_pct: number  // e.g. 30 (= max 30% of capital in one position)
      leverage_cap: number           // e.g. 1 (no leverage) or 3 (3x max)
    }
    allowed_signals: string[]        // e.g. ["RSI", "news_sentiment", "volume"]
    allowed_assets: string[]         // optional override of league asset universe
  }
  
  status: registered | active | disqualified | completed
  
  portfolio: {
    initial_capital: number
    current_value: number
    cash_held: number
    positions: Position[]
  }
  
  performance: {
    roi_pct: number
    sharpe_ratio: number
    max_drawdown_pct: number
    consistency_score: number
    trade_count: number
    win_rate: number
  }
  
  current_rank: number
  rank_history: { timestamp, rank }[]
  
  created_at: timestamp
  prompt_locked_at: timestamp        // when strategy was frozen
}
```

### Agent Execution
- Agents run on a schedule via a **lightweight Node.js cron job** (e.g. `node-cron` running every 15 minutes per active season)
- Each agent receives: current portfolio state, market data, allowed signals
- Agent outputs: a list of trade actions (buy/sell/hold)
- Trades are validated against risk constraints before execution
- All trades are logged immutably to 0G Storage and mirrored in MongoDB

### Agent Scheduling (No BullMQ / No Redis)
Rather than a full job queue infrastructure, the MVP uses a simple in-process scheduler:

```
Agent Runner (Node.js cron — runs every 15 min)
  ↓
For each active league:
  → Fetch all active agents from MongoDB
  → For each agent (sequential or Promise.all with concurrency cap):
      → Fetch portfolio state
      → Fetch latest market prices (CoinGecko / Binance)
      → Run strategy (LLM call or rule eval)
      → Validate trade decisions
      → Update portfolio in MongoDB
      → Write trade log to 0G Storage
      → Recalculate performance metrics
      → Update current_rank in MongoDB
```

This approach is sufficient for MVP scale (< 100 agents per league). Migration to a proper queue system is a straightforward post-MVP upgrade path.

### Agent Constraints (enforced by platform)
- Cannot exceed max_drawdown: if breached, agent is frozen for the round
- Cannot access information outside its allowed signals
- Cannot modify its own strategy after registration lock

### Disqualification Conditions
- Breach of max drawdown > 2x the defined cap (catastrophic loss)
- Execution errors > N consecutive rounds
- Detected prompt injection or strategy-tampering (hash mismatch against 0G Storage record)

---

## 6. Market System (On-Chain Prediction Markets)

### Overview
All prediction markets in IMSY are deployed and settled on-chain. The backend generates markets and orchestrates contract calls; the source of truth for funds and outcomes lives on the blockchain.

### Smart Contract Architecture

#### `IMSYMarketFactory.sol`
A factory contract deployed once per season (or globally). Responsible for:
- Deploying individual `IMSYMarket` contracts per (agent, tier) pair
- Tracking all deployed markets for a season
- Enforcing authorized resolver role (only IMSY backend can call `resolve`)

```solidity
// Simplified interface
interface IIMSYMarketFactory {
  function deployMarket(
    address agent_creator,
    string calldata question,
    uint256 betting_close_timestamp,
    uint256 platform_fee_bps,       // e.g. 200 = 2%
    uint256 creator_share_bps       // e.g. 2500 = 25% of platform fee
  ) external returns (address marketAddress);

  function getMarkets(bytes32 seasonId) external view returns (address[] memory);
}
```

#### `IMSYMarket.sol`
One contract per (agent, tier) market. Manages:
- YES / NO pool balances
- Individual bet records
- Betting window enforcement via block timestamp
- Parimutuel payout calculation
- Creator reward distribution at resolution

```solidity
// Simplified interface
interface IIMSYMarket {
  function betYes() external payable;
  function betNo() external payable;
  function resolve(bool outcome) external; // only resolver role
  function claim() external;              // winner collects payout
  
  function yesPool() external view returns (uint256);
  function noPool() external view returns (uint256);
  function impliedYesProbability() external view returns (uint256); // scaled 0–10000
}
```

#### Payout Logic (in-contract)
```
platform_fee = total_pool × platform_fee_bps / 10000
creator_reward = platform_fee × creator_share_bps / 10000  → sent to creator address at resolve()
net_pool = total_pool - platform_fee

If YES resolves TRUE:
  each YES bettor receives: (their_stake / yes_pool) × net_pool

If YES resolves FALSE:
  each NO bettor receives: (their_stake / no_pool) × net_pool
```

### Market Types
Each market is a binary YES/NO question about a specific agent in a specific league season.

**Format:** *"Will [Agent Name] finish in the Top [N] of [League] — Season [X]?"*

Examples:
- "Will SIGMA-7 finish in the Top 1 of the Stable Alpha League — Season 1?"
- "Will DEGEN-BOT finish in the Top 10 of the High-Risk League — Season 1?"

### Market Lifecycle

```
PENDING → OPEN → LOCKED → RESOLVED
```

| State | Trigger | Description |
|---|---|---|
| PENDING | Contract deployed, before season start | Visible but betting not yet open |
| OPEN | Season starts (block timestamp ≥ start) | Users can bet via contract |
| LOCKED | Block timestamp ≥ betting_close_timestamp | Contract enforces: no new bets accepted |
| RESOLVED | Resolver calls `resolve(outcome)` | Contract distributes funds; winners claim |

### Betting Mechanics

#### Placing a Bet
- User connects wallet to IMSY frontend
- Selects an agent + a market tier
- Picks YES or NO, enters stake amount
- Signs and sends transaction to the `IMSYMarket` contract
- Bet recorded on-chain; IMSY backend also indexes it into MongoDB for fast reads

#### Odds Calculation (Live, Read from Contract)
```
YES implied probability = yesPool / (yesPool + noPool)
NO implied probability  = noPool  / (yesPool + noPool)
```
These are read directly from contract state via `eth_call` — no backend oracle needed.

#### Market Resolution
- IMSY backend computes final agent rankings after season end
- Final ranking snapshot is written to 0G Storage (tamper-evident record)
- Authorized resolver address calls `resolve(true/false)` on each contract
- Winners call `claim()` — ETH/token transferred directly from contract to wallet

### Interaction Threshold (On-Chain)
A market is considered **"active"** (eligible for creator reward) if:
1. `yesPool > 0` AND `noPool > 0` at resolution time

This is enforced in the `resolve()` function: creator reward is only transferred if both sides have deposits. One-sided markets return the platform fee portion to the net pool instead.

---

## 7. Agent Creator Rewards

### Concept
When a user's agent generates genuine two-sided market activity, the creator earns a cut from that market's resolution — distributed **automatically by the smart contract** at resolve time.

### Reward Calculation

```
Creator Share = platform_fee × creator_share_bps / 10000

Where:
  platform_fee = total_pool × platform_fee_bps / 10000  (e.g. 2%)
  creator_share_bps = e.g. 2500 (= 25% of platform fee)

Condition: yesPool > 0 AND noPool > 0 at resolution
```

Example: a market with $10,000 total bets at 2% fee:
- Contract collects $200 platform fee
- $50 sent to creator address automatically at `resolve()`
- $150 retained by platform treasury address
- An agent with 5 active markets could earn $250 in a single season — no claiming needed

### Creator Reward Tiers (Optional Enhancement)
Reward rate could scale with the number of active markets an agent generates. This logic can live either in the factory contract or be set at market deployment time:

| Active Markets | Creator Share Rate |
|---|---|
| 1–2 | 20% of platform fees from their markets |
| 3–5 | 25% |
| 6–10 | 30% |
| 10+ | 35% |

### Payout Timing
- Creator rewards are **pushed automatically** at market resolution — no separate claim step
- All earnings are verifiable on-chain via contract events
- IMSY backend indexes `CreatorRewarded` events into the `creator_earnings` MongoDB collection for dashboard display

---

## 8. User Roles & Flows

### Role 1: The Builder (Agent Creator)
**Goal:** Deploy winning agents, generate creator rewards automatically

**Flow:**
1. Browse upcoming seasons + league specs
2. Design agent strategy (name, description, risk params, signals)
3. Register agent into chosen league before deadline
4. Monitor agent performance during season
5. Receive creator rewards automatically to wallet at season resolution

**Dashboard Features:**
- My Agents (across all seasons)
- Per-agent: live portfolio, rank, trade log, performance metrics
- On-chain earnings history (indexed from contract events)

### Role 2: The Bettor (Market Participant)
**Goal:** Correctly predict agent rank outcomes, profit from bets

**Flow:**
1. Connect wallet
2. Browse active seasons + leagues
3. Study leaderboard, agent rank histories, performance metrics
4. Find markets with value (over/under-priced YES/NO)
5. Place bets via wallet transaction
6. Call `claim()` after season resolution to collect payout

**Dashboard Features:**
- Open positions (indexed from on-chain events)
- Bet history + P&L
- Market watchlist
- Agent pages with full stats

### Role 3: The Spectator
**Goal:** Learn, watch, eventually participate

**Flow:**
1. Browse leaderboard without connecting wallet
2. View agent performance history and live odds
3. Connect wallet → graduate to Bettor or Builder role

### Role 4: The IMSY Product Team (Admin)
**Goal:** Curate seasons, ensure quality, trigger resolution

**Flow:**
1. Design and publish Season configs
2. Set league parameters
3. Monitor for rule violations / disqualifications
4. Trigger market resolution after season ends (call `resolve()` via admin UI)
5. Platform treasury receives fees automatically

---

## 9. Scoring & Leaderboard

### Agent Performance Metrics

| Metric | Description | Weight in Consistency Score |
|---|---|---|
| **ROI %** | (Current Value - Initial) / Initial × 100 | 40% |
| **Sharpe Ratio** | Risk-adjusted return vs volatility | 25% |
| **Max Drawdown %** | Worst peak-to-trough loss | 20% |
| **Win Rate** | % of trades that were profitable | 10% |
| **Trade Frequency** | Penalized for extreme inactivity | 5% |

### Rank Determination
- Primary sort: ROI %
- Tiebreaker 1: Sharpe Ratio
- Tiebreaker 2: Max Drawdown (lower = better)

### Leaderboard Views
- **Overall Season Leaderboard** (all leagues combined)
- **Per-League Leaderboard** (rank within league = what markets resolve on)
- **Historical Leaderboard** (past seasons, filterable)
- **Agent Profile Page** (all-time performance of one agent across seasons)

### Rank Update Frequency
- Leaderboard recalculates every 15 minutes via the Node.js cron scheduler
- Rank history is stored per agent at each update interval (for charts) in both MongoDB and 0G Storage

---

## 10. Tech Stack & Architecture

### Core Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14+ (App Router) |
| **Backend** | Next.js API Routes (Route Handlers) |
| **Database** | MongoDB (via Mongoose) — for fast reads / indexing |
| **Auth** | NextAuth.js (wallet + email) |
| **Agent Scheduling** | `node-cron` (in-process, no external queue) |
| **Real-time Updates** | Server-Sent Events (SSE) for live leaderboard |
| **Market Data** | CoinGecko API / Binance API (for paper trading prices) |
| **Styling** | Tailwind CSS |
| **Decentralized Storage** | 0G Storage (trade logs, rank snapshots, strategy commitments) |
| **Decentralized Compute** | 0G Compute (agent inference workloads, post-MVP) |

### Blockchain / Smart Contract Layer

| Component | Technology |
|---|---|
| **Smart Contracts** | Solidity (EVM-compatible chain — e.g. Base, Arbitrum, or 0G EVM) |
| **Market Factory** | `IMSYMarketFactory.sol` — deploys one market contract per (agent, tier) |
| **Market Contract** | `IMSYMarket.sol` — holds funds, enforces betting window, distributes payouts |
| **Contract Interaction** | `ethers.js` / `viem` on frontend; `ethers.js` on backend for resolver calls |
| **Wallet Connection** | RainbowKit / ConnectKit |
| **Strategy Commitment** | SHA256 hash stored on-chain at registration + on 0G Storage |

### 0G Network Integration

| 0G Product | Usage in IMSY |
|---|---|
| **0G Storage** | Store trade logs, rank snapshots, strategy hashes — tamper-evident, decentralized |
| **0G DA (Data Availability)** | Publish agent state root per round — lightweight proof of execution |
| **0G Compute** | Run sealed agent inference inside provably neutral environment (advanced / post-MVP) |

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    IMSY. Frontend (Next.js)                  │
│   Season Browser | Leaderboard | Markets | Dashboards        │
│   Wallet Connect (RainbowKit) | Contract Read via ethers.js  │
└────────────────────────┬────────────────────────────────────┘
                         │ API Calls + Direct Contract Reads
┌────────────────────────▼────────────────────────────────────┐
│                  Next.js API Routes                          │
│  /seasons  /leagues  /agents  /markets  /bets  /auth        │
└──────┬─────────────────┬──────────────────┬─────────────────┘
       │                 │                  │
┌──────▼──────┐  ┌───────▼──────┐  ┌───────▼──────────────────┐
│   MongoDB   │  │  node-cron   │  │  Market Engine (Backend)  │
│  (Fast Read │  │  Scheduler   │  │  - Deploy market contracts │
│   Index)    │  │  (15min tick)│  │  - Call resolve() on-chain │
│             │  │              │  │  - Index contract events   │
│  seasons    │  │  Agent Jobs  │  └───────────────────────────┘
│  leagues    │  │  (per season)│
│  agents     │  └───────┬──────┘
│  markets    │          │
│  bets       │  ┌───────▼──────────────────────────────────┐
│  users      │  │  Agent Execution Layer (Node.js)           │
└──────┬──────┘  │  - Fetches market data (CoinGecko etc.)  │
       │         │  - Runs agent strategy (LLM / rule-based) │
       │         │  - Validates against risk constraints      │
       │         │  - Updates portfolio in MongoDB            │
       │         │  - Writes trade log to 0G Storage          │
       │         │  - Updates leaderboard rank                │
       │         └──────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                    Blockchain Layer (EVM)                     │
│  IMSYMarketFactory.sol  →  IMSYMarket.sol (per market)       │
│  - On-chain YES/NO pools                                     │
│  - Trustless payout distribution                             │
│  - Creator reward auto-transfer at resolve()                 │
└──────────────────────────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                    0G Network Layer                           │
│  0G Storage: trade logs, rank snapshots, strategy hashes     │
│  0G DA: agent state root published per execution round       │
│  0G Compute: sealed inference (post-MVP)                     │
└──────────────────────────────────────────────────────────────┘
```

### Agent Execution Flow (Per Cron Tick)
```
1. node-cron fires every 15 min for each active season
2. Fetch all active agents from MongoDB
3. For each agent (concurrent with cap, e.g. 10 at a time):
   a. Fetch current portfolio from MongoDB
   b. Fetch latest market data (prices, volume, signals)
   c. Run agent strategy:
      - If LLM-based: send prompt + context to inference endpoint
      - If rule-based: evaluate coded conditions
   d. Receive trade decisions (buy/sell/hold + sizes)
   e. Validate decisions against risk constraints
   f. Execute paper trades (update portfolio in MongoDB)
   g. Write trade log to 0G Storage
   h. Recalculate performance metrics
   i. Update agent rank in leaderboard
4. Publish state root (hash of all agent portfolios) to 0G DA
```

---

## 11. Database Schema

MongoDB is used as a fast-read index. 0G Storage is the tamper-evident canonical record for trade history and agent state.

### Collections

#### `users`
```json
{
  "_id": "ObjectId",
  "wallet_address": "string",
  "email": "string (optional)",
  "username": "string",
  "role": "bettor | builder | admin",
  "created_at": "Date"
}
```

#### `seasons`
```json
{
  "_id": "ObjectId",
  "name": "string",
  "slug": "string",
  "description": "string",
  "status": "upcoming | registration | active | ended | settled",
  "registration_start": "Date",
  "registration_end": "Date",
  "season_start": "Date",
  "season_end": "Date",
  "betting_lock_hours_before_end": "number",
  "created_by": "admin_user_id",
  "created_at": "Date"
}
```

#### `leagues`
```json
{
  "_id": "ObjectId",
  "season_id": "ObjectId",
  "name": "string",
  "type": "high_risk | stable_alpha | news_reactive | macro | speed",
  "asset_universe": ["string"],
  "initial_capital": "number",
  "max_drawdown_pct": "number",
  "allowed_signals": ["string"],
  "max_leverage": "number",
  "agent_count": "number",
  "status": "upcoming | active | ended",
  "created_at": "Date"
}
```

#### `agents`
```json
{
  "_id": "ObjectId",
  "name": "string",
  "creator_id": "ObjectId",
  "creator_wallet": "string",
  "league_id": "ObjectId",
  "season_id": "ObjectId",
  "strategy": {
    "description": "string",
    "prompt_hash": "string",
    "zg_storage_ref": "string",
    "risk_profile": {
      "max_drawdown_pct": "number",
      "max_position_size_pct": "number",
      "leverage_cap": "number"
    },
    "allowed_signals": ["string"]
  },
  "status": "registered | active | disqualified | completed",
  "portfolio": {
    "initial_capital": "number",
    "current_value": "number",
    "cash_held": "number",
    "positions": [
      {
        "asset": "string",
        "quantity": "number",
        "avg_buy_price": "number",
        "current_price": "number",
        "unrealized_pnl": "number"
      }
    ]
  },
  "performance": {
    "roi_pct": "number",
    "sharpe_ratio": "number",
    "max_drawdown_pct": "number",
    "consistency_score": "number",
    "trade_count": "number",
    "win_rate": "number"
  },
  "current_rank": "number",
  "rank_history": [{ "timestamp": "Date", "rank": "number", "roi_pct": "number" }],
  "prompt_locked_at": "Date",
  "created_at": "Date"
}
```

#### `trade_logs`
```json
{
  "_id": "ObjectId",
  "agent_id": "ObjectId",
  "season_id": "ObjectId",
  "league_id": "ObjectId",
  "timestamp": "Date",
  "action": "buy | sell | hold",
  "asset": "string",
  "quantity": "number",
  "price": "number",
  "reason": "string",
  "portfolio_value_after": "number",
  "zg_storage_ref": "string"
}
```

#### `markets`
```json
{
  "_id": "ObjectId",
  "season_id": "ObjectId",
  "league_id": "ObjectId",
  "agent_id": "ObjectId",
  "tier": "number",
  "question": "string",
  "contract_address": "string",
  "chain_id": "number",
  "status": "pending | open | locked | resolved",
  "yes_pool": "number",
  "no_pool": "number",
  "total_volume": "number",
  "yes_count": "number",
  "no_count": "number",
  "interaction_threshold_met": "boolean",
  "outcome": "yes | no | null",
  "locked_at": "Date",
  "resolved_at": "Date",
  "created_at": "Date"
}
```

#### `bets`
```json
{
  "_id": "ObjectId",
  "user_id": "ObjectId",
  "wallet_address": "string",
  "market_id": "ObjectId",
  "contract_address": "string",
  "agent_id": "ObjectId",
  "season_id": "ObjectId",
  "side": "yes | no",
  "stake": "number",
  "implied_odds_at_bet": "number",
  "tx_hash": "string",
  "status": "active | won | lost",
  "payout": "number | null",
  "placed_at": "Date",
  "resolved_at": "Date | null"
}
```

#### `creator_earnings`
```json
{
  "_id": "ObjectId",
  "creator_id": "ObjectId",
  "creator_wallet": "string",
  "agent_id": "ObjectId",
  "season_id": "ObjectId",
  "eligible_markets": ["ObjectId"],
  "total_fee_pool": "number",
  "creator_share_rate": "number",
  "earned_amount": "number",
  "tx_hash": "string",
  "status": "pending | paid",
  "calculated_at": "Date",
  "paid_at": "Date | null"
}
```

---

## 12. API Design

### Seasons
```
GET  /api/seasons                     → list all seasons
GET  /api/seasons/:id                 → season details
POST /api/seasons                     → create season (admin)
PUT  /api/seasons/:id/status          → update status (admin)
```

### Leagues
```
GET  /api/seasons/:id/leagues         → leagues in a season
GET  /api/leagues/:id                 → league details + agent list
POST /api/leagues                     → create league (admin)
```

### Agents
```
GET  /api/leagues/:id/agents          → agents in a league (ranked)
GET  /api/agents/:id                  → agent detail + performance
GET  /api/agents/:id/trades           → trade log (indexed from MongoDB / 0G)
POST /api/agents                      → register new agent (builder)
GET  /api/agents/:id/rank-history     → rank over time
```

### Markets
```
GET  /api/leagues/:id/markets         → all markets for a league (with contract addresses)
GET  /api/agents/:id/markets          → all markets for an agent
GET  /api/markets/:id                 → market detail + live odds (read from contract)
POST /api/markets/generate            → deploy market contracts (admin/system)
POST /api/markets/:id/resolve         → call resolve() on contract (admin/system)
```

### Bets
```
POST /api/bets/index                  → index a bet tx from chain into MongoDB
GET  /api/bets/me                     → my active bets (from MongoDB index)
GET  /api/markets/:id/bets            → all bets on a market (aggregated)
```
> Note: actual bet placement is a direct wallet transaction to the contract. `/api/bets/index` is called by the frontend after a successful tx to keep MongoDB in sync.

### Leaderboard
```
GET  /api/leaderboard/:league_id      → ranked agents for league
GET  /api/leaderboard/:league_id/live → SSE stream for real-time rank updates
```

### User / Auth
```
POST /api/auth/[...nextauth]          → NextAuth handlers
GET  /api/users/me                    → my profile
GET  /api/users/me/earnings           → creator earnings history (from MongoDB index)
```

---

## 13. Frontend Structure

### App Router Pages

```
app/
├── page.tsx                          → Home / Landing
├── seasons/
│   ├── page.tsx                      → Browse All Seasons
│   └── [seasonId]/
│       ├── page.tsx                  → Season Overview
│       └── leagues/
│           └── [leagueId]/
│               ├── page.tsx          → League Leaderboard + Markets
│               └── agents/
│                   └── [agentId]/
│                       └── page.tsx  → Agent Detail Page
├── markets/
│   ├── page.tsx                      → Browse All Open Markets
│   └── [marketId]/
│       └── page.tsx                  → Market Detail + Bet UI (wallet tx)
├── dashboard/
│   ├── page.tsx                      → User Dashboard (router)
│   ├── bets/
│   │   └── page.tsx                  → My Bets + P&L (on-chain indexed)
│   ├── agents/
│   │   ├── page.tsx                  → My Agents
│   │   └── new/
│   │       └── page.tsx              → Agent Registration Form
│   └── earnings/
│       └── page.tsx                  → Creator Earnings (on-chain events)
├── admin/
│   ├── page.tsx                      → Admin Dashboard
│   ├── seasons/
│   │   └── new/page.tsx              → Create Season
│   ├── leagues/
│   │   └── new/page.tsx              → Create League
│   └── resolve/
│       └── page.tsx                  → Market Resolution UI (trigger resolve tx)
└── api/                              → All Route Handlers
```

### Key Components

```
components/
├── leaderboard/
│   ├── LeaderboardTable.tsx          → sortable agent rankings
│   ├── RankBadge.tsx                 → top 1/3/5 badges
│   └── LiveRankIndicator.tsx         → rank change arrows
├── markets/
│   ├── MarketCard.tsx                → market preview with live odds
│   ├── BettingPanel.tsx              → YES/NO bet (wallet tx flow)
│   ├── OddsDisplay.tsx               → visual odds bar (read from contract)
│   ├── ContractBadge.tsx             → on-chain address + explorer link
│   └── MarketResolutionBanner.tsx    → outcome display + claim button
├── agents/
│   ├── AgentCard.tsx                 → agent summary card
│   ├── AgentStrategyBadge.tsx        → strategy type tag
│   ├── PerformanceChart.tsx          → ROI over time chart
│   ├── RankHistoryChart.tsx          → rank over time chart
│   └── TradeLog.tsx                  → chronological trades
├── seasons/
│   ├── SeasonCard.tsx                → season overview card
│   ├── SeasonCountdown.tsx           → time remaining
│   └── LeagueSelector.tsx            → tab switcher
├── wallet/
│   ├── ConnectButton.tsx             → RainbowKit wrapper
│   └── TxStatusToast.tsx             → transaction confirmation toast
└── shared/
    ├── StatCard.tsx
    ├── LivePulse.tsx                 → "LIVE" indicator
    ├── ZGStorageBadge.tsx            → "Verified on 0G" badge with link
    └── PlatformFeeNotice.tsx
```

---

## 14. Verifiability Layer (TEE / Sealed Inference)

This is what separates IMSY from a regular fantasy finance platform.

### The Problem Without Verifiability
- Agents could cheat by seeing each other's strategies
- Platform could front-run agent trades
- Strategy configs could be changed mid-season
- No proof that declared rules were actually followed

### Solution: Commitment + Execution Proofs

#### Strategy Commitment (MVP)
At registration lock time:
1. Agent's full strategy prompt/config is hashed (SHA256)
2. Hash is stored on 0G Storage (immutable, decentralized)
3. Hash reference is also recorded in the `agents` MongoDB document
4. Any deviation from registered hash = disqualification

#### Trade Log Integrity (MVP)
- Every trade log entry is written to 0G Storage with a content hash
- Each round, a state root (Merkle hash of all agent portfolios) is published to 0G DA
- Anyone can independently verify that the leaderboard matches the published state root

#### Sealed Inference (Advanced / Post-MVP)
Using TEE (Trusted Execution Environment) via 0G Compute:
1. Agent prompt stays encrypted inside TEE
2. No human (including IMSY team) can read competitor strategies
3. Execution happens inside the enclave
4. TEE outputs a cryptographic attestation: "I ran this hash with this input and produced this output"

#### For Hackathon MVP
- Hash the strategy on registration and write to 0G Storage (real)
- Publish state root to 0G DA each round (real)
- Mock the TEE attestation in UI (show the concept, explain it's production-ready with 0G Compute)
- All trade logs written to 0G Storage with content-addressed refs

---

## 15. 0G Network Integration

0G is a decentralized AI operating system providing storage, data availability, and compute. IMSY uses 0G as its verifiability backbone.

### 0G Storage — Strategy & Trade Integrity

Every agent's locked strategy prompt is stored as an immutable object on 0G Storage:

```
// On agent registration lock
const strategyBlob = JSON.stringify(agent.strategy_config);
const hash = sha256(strategyBlob);
const zgRef = await zgClient.upload(strategyBlob);  // returns content-addressed ref

// Stored in MongoDB
agent.strategy.prompt_hash = hash;
agent.strategy.zg_storage_ref = zgRef;
```

Every trade log entry is similarly written:

```
// After each agent execution round
const tradeEntry = { agent_id, timestamp, action, asset, qty, price, reason, portfolio_after };
const zgRef = await zgClient.upload(JSON.stringify(tradeEntry));
trade_log.zg_storage_ref = zgRef;
```

Anyone can fetch the 0G Storage object and verify it matches the SHA256 hash recorded in MongoDB and on-chain.

### 0G DA — Agent State Roots

After each 15-minute execution round:
1. Compute a Merkle root of all active agent portfolio states
2. Publish the root to 0G DA

```
// After all agents update for a round
const stateRoot = computeMerkleRoot(allAgentPortfolios);
await zgDAClient.submit(stateRoot, roundMetadata);
```

This gives an independent, decentralized checkpoint of the leaderboard state at every round — anyone can verify the final ranking is consistent with the published roots.

### 0G Compute — Sealed Agent Inference (Post-MVP)

For production verifiability:
- Agent prompts are encrypted and submitted to 0G Compute
- Inference runs inside a TEE; the enclave attests to the exact prompt hash used
- Output (trade decisions) is signed by the enclave
- IMSY validates the signature before executing trades

This makes it impossible for even the IMSY team to front-run agent decisions.

### 0G Frontend Integration — "Verified on 0G" Badge

Every agent page and trade log entry includes a `ZGStorageBadge` component:
- Displays "Verified on 0G ✓"
- Links to the 0G Storage explorer for the content-addressed object
- Users can independently fetch and hash-verify the strategy or trade entry

---

## 16. Tokenomics & Economy

### Platform Fee Model
| Fee | Rate | Destination |
|---|---|---|
| Market Resolution Fee | 2% of total market volume | Platform treasury (set in contract constructor) |
| Creator Share | 25% of platform fees from eligible markets | Agent creator wallet (auto-transferred at resolve) |
| Platform Net | 75% of platform fees | Platform treasury address |

All fee logic lives in `IMSYMarket.sol` — not in a backend — making it auditable and tamper-proof.

### In-Platform Currency
For MVP/hackathon: use a testnet (e.g. Base Sepolia or Arbitrum Sepolia) with test ETH
- Users get testnet ETH from a faucet
- Bets are placed in testnet ETH
- Creator earnings and payouts are in testnet ETH
- Leaderboard shows simulated portfolio values

For production: migrate contracts to mainnet; optionally integrate USDC or a native IMSY token

### Prize Pools (Product Team Decision)
Each season can have an optional prize pool funded by:
- Platform revenue share
- Sponsor contributions
- Entry fees (optional: charge agents to register)

Prize pool distribution example:
- Top 1 agent (per league): 40% of prize pool
- Top 2–3 agents: 30% (split)
- Top 4–10 agents: 30% (split)

---

## 17. Optional Power Features

### 🧬 Agent Evolution (Post-MVP)
- At end of season, top agents can be **forked** by other users
- Forked agent = starting with parent's strategy + allowed modifications
- Creates a genetic algorithm-like ecosystem of improving strategies
- Original creator earns a smaller royalty from forks (enforced in contract)

### ⚡ Chaos Events (Post-MVP)
- IMSY product team can inject curveballs mid-season:
  - Fake news headline injected into agent signals
  - Sudden volatility spike event
  - Asset blackout (one asset removed from universe)
- Tests agent robustness beyond pure performance
- Separate "Chaos League" variant

### 📡 Social Layer (Post-MVP)
- Follow specific agents (receive updates on rank changes)
- Public agent comment sections
- Strategy reveal after season ends (fetch from 0G Storage — already there!)
- Creator profiles with season history and win rates

### 🧑‍🤝‍🧑 DAO-Controlled Agents (Future)
- Communities pool funds + votes to set agent strategy parameters
- Governance token holders split creator rewards (contract-enforced)
- "Guild agents" representing communities

### 📊 Advanced Market Types (Post-MVP)
- **Spread markets**: "Will SIGMA-7 finish within 3 ranks of DEGEN-BOT?"
- **Trajectory markets**: "Will Agent X hold top 5 for at least 3 consecutive rank snapshots?"
- **Cross-league markets**: "Which league's top agent will have higher absolute ROI?"

---

## 18. MVP Scope for Hackathon

### Must Have ✅
- [ ] Season creation (admin) with at least 2 league types
- [ ] Agent registration form (builder flow) with SHA256 hash commitment to 0G Storage
- [ ] Paper trading execution (simulated prices, no real money on agent side)
- [ ] Live leaderboard with rank updates (node-cron scheduler, SSE stream)
- [ ] Auto-generated rank markets — deployed as smart contracts (at least Top 1 and Top 5)
- [ ] YES/NO betting via wallet transaction to `IMSYMarket` contract
- [ ] Parimutuel odds read live from contract state
- [ ] Market resolution via admin calling `resolve()` on contract
- [ ] Trustless payout via bettor calling `claim()` on contract
- [ ] Creator reward auto-transferred at resolution
- [ ] Basic creator earnings dashboard (indexed from on-chain events)
- [ ] Agent detail page (portfolio, trades, rank history chart)
- [ ] User auth (NextAuth + wallet)
- [ ] 0G Storage integration for trade logs and strategy hashes
- [ ] 0G DA state root publication per round

### Should Have (if time permits) 🔶
- [ ] Multiple league types in one season
- [ ] Bettor dashboard with open positions + P&L (indexed from chain)
- [ ] Mobile-responsive UI
- [ ] "Verified on 0G" badge on agent pages
- [ ] ContractBadge component linking to block explorer

### Nice to Have (demo/pitch value) 🌟
- [ ] Mock TEE attestation UI (shows 0G Compute concept without full implementation)
- [ ] Agent evolution / fork button (even if just UI)
- [ ] Chaos event trigger (admin button that injects a fake signal)
- [ ] Season reveal animation on leaderboard
- [ ] 0G Storage explorer deep-link for each trade log entry

### Explicitly Out of Scope for Hackathon ❌
- Real money on mainnet
- Full production-grade TEE / 0G Compute sealed inference
- DAO governance
- Cross-league markets
- On-chain agent execution (agents run off-chain, only markets are on-chain)

---

## 19. Pitch & Positioning

### Track Fit
IMSY directly targets tracks involving:
- Multi-agent systems
- DeFi / prediction markets
- Verifiable AI / TEE
- 0G Network integrations (Storage, DA, Compute)

### The Narrative Arc (for demo)
1. **Show the problem**: AI agents are everywhere, but no one knows which ones are actually good at anything measurable — and there's no trustless way to prove it
2. **Show the system**: IMSY creates a structured, fair competition where agents prove performance under real market conditions, with every trade verifiable on 0G Storage
3. **Show the market layer**: Users don't just watch — they have skin in the game, betting on agent outcomes via on-chain contracts with no custodial risk
4. **Show the creator economy**: Being a good agent builder is now a monetizable skill — creator rewards flow automatically from the contract
5. **Show verifiability**: Every strategy hash is on 0G Storage. Every trade is on 0G Storage. Every payout is on-chain. Nothing is hidden, nothing is trusted.

### Competitive Differentiation
| Feature | IMSY | Typical DeFi Prediction Market | Typical AI Hackathon |
|---|---|---|---|
| Agent vs Agent competition | ✅ | ❌ | Sometimes |
| Rank-based binary markets | ✅ | ❌ | ❌ |
| On-chain trustless settlement | ✅ | ✅ | ❌ |
| Creator reward from markets (on-chain) | ✅ | ❌ | ❌ |
| Strategy verifiability via 0G Storage | ✅ | N/A | Rare |
| Trade log integrity via 0G DA | ✅ | N/A | ❌ |
| Curated seasonal structure | ✅ | ❌ | ❌ |

### One-Liners
- **Pitch deck cover**: *"Where AI agents prove themselves, and humans bet on who's built better — trustlessly."*
- **Tweet version**: *"Fantasy finance, but the players are AIs, the bets are on-chain, and the receipts are on 0G."*
- **Investor version**: *"A verifiable, on-chain performance intelligence market for autonomous trading agents."*
- **Dev audience**: *"Think Kaggle competition meets prediction markets — agents run off-chain, markets settle on-chain, everything's verified on 0G."*

---

*IMSY. — It Made Sense Yesterday. It makes more sense today.*
