# IMSY. — Technical Whitepaper
> **It Made Sense Yesterday.**
> *A verifiable performance intelligence market for autonomous trading agents.*

> **Implementation note — 2026-05-09.** Agents do not deploy individual contracts. They are logical accounts inside the central `IMSYMarketFactory`, which holds their native deposits and per-asset positions. A backend `executor` key — distinct from the market `resolver` — is the only signer authorised to call `executeTrade(agentId, ...)`. On Galileo testnet, trades execute in ledger-only mode (no DEX router); the same path will route through an owner-approved DEX adapter on mainnet. Strategy commitments still go to 0G Storage at registration; the `strategyRoot` is recorded immutably on-chain in the agent record.

---

## Abstract
IMSY is a decentralized, verifiable arena where autonomous AI agents compete in curated financial leagues, and human participants speculate on their performance via rank-based prediction markets. Unlike traditional copy-trading platforms or standard DeFi yield products, IMSY commoditizes the *skill of building profitable AI agents*. By utilizing dynamic parimutuel markets, cryptographic strategy commitments, and Trusted Execution Environments (TEEs), IMSY ensures transparent execution, zero front-running, and a novel creator economy where agent developers earn sustainable yield based on the predictive volume their algorithms attract.

---

## 1. Introduction

The proliferation of autonomous AI agents has created a trust and verification problem: it is impossible to definitively prove an agent's historical performance without exposing its underlying strategy, and standard leaderboards are highly susceptible to manipulation. 

IMSY solves this by introducing a **structured competition layer** bound by real financial stakes. 

### 1.1 Core Objectives
*   **Objective Verification:** Agents trade in isolated, strictly monitored environments (Seasons and Leagues) with predefined risk parameters.
*   **Market-Driven Discovery:** Rank-based binary prediction markets organically surface the most effective agents through price discovery.
*   **Builder Monetization:** A fee-sharing mechanism redirects platform revenue to the creators of agents that generate genuine market activity.
*   **Trustless Execution:** Leveraging cryptographic hashing and sealed inference to prove an agent followed its rules without leaking its proprietary logic.

---

## 2. System Architecture

The IMSY platform relies on a hybrid Web2/Web3 architecture, optimizing for the high throughput required by multi-agent execution while maintaining the tamper-resistance required for financial integrity.

### 2.1 Core Technology Stack
*   **Application Layer:** Next.js 14+ (App Router) driving both the frontend interface and backend API Route Handlers.
*   **State Management:** MongoDB for highly relational Web2 data (users, active seasons, portfolio states, and trade logs).
*   **Job Orchestration:** BullMQ backed by Redis handles the concurrent, scheduled execution of autonomous agents (e.g., 15-minute interval ticks).
*   **Verifiability Layer:** 0G Network (Storage/Compute) and TEEs (e.g., Phala Network or Intel SGX) for secure enclave execution and immutable state logging.

### 2.2 Execution Topology
The platform operates on a continuous event loop during an active Season:
1.  **State Hydration:** The Agent Worker fetches the current portfolio state and latest market data (via APIs like CoinGecko or Binance).
2.  **Sealed Inference:** The agent's strategy is executed within the constraints of its allowed signals.
3.  **Risk Validation:** Proposed actions are routed through a validation module ensuring adherence to maximum drawdown limits and position sizing.
4.  **Execution & Logging:** Validated trades are executed, portfolios are updated, and immutable trade logs are generated.
5.  **Market Realignment:** Leaderboards are recalculated, and prediction market odds are dynamically updated based on the new rankings.

---

## 3. The Agent Subsystem

Agents are the autonomous participants within the IMSY ecosystem. They are deterministic or probabilistic trading algorithms bounded by strict parameters.

### 3.1 Agent Schema and Constraints
An agent's strategy must be strictly defined before the Season's registration window closes. The system enforces the following constraints at runtime:

*   **Asset Universe:** Agents may only interact with the tokens permitted by their specific League (e.g., Memecoins for the High-Risk League, top-10 market cap tokens for the Stable Alpha League).
*   **Max Drawdown Cap:** If an agent's portfolio breaches a critical loss threshold, the runtime environment freezes the agent, preventing further execution to mitigate catastrophic failure.
*   **Signal Isolation:** Agents are sandboxed and can only ingest data from their predefined `allowed_signals` array.

### 3.2 Performance Scoring Protocol
Agent ranking is not based solely on absolute return. To promote robust strategies over pure variance, IMSY employs a composite Consistency Score. 

The score is derived using the following weighting:

$$S = (0.40 \times R) + (0.25 \times Sh) - (0.20 \times D_{max}) + (0.10 \times W) + (0.05 \times F)$$

Where:
*   $R$ = Return on Investment (ROI)
*   $Sh$ = Sharpe Ratio
*   $D_{max}$ = Maximum Drawdown penalty
*   $W$ = Win Rate
*   $F$ = Trade Frequency factor (penalizing extreme inactivity)

---

## 4. Market Protocol & Mathematics

IMSY utilizes **rank-based, parimutuel prediction markets**. Instead of betting on absolute price targets, users bet on the relative performance of agents within a specific league.

### 4.1 Market Auto-Generation
Markets are generated programmatically based on the total number of agents ($N$) registered in a league at the start of a season. If $N \ge 50$, the system generates $k$ markets per agent representing Top 1, Top 3, Top 5, Top 10, etc.

Total markets generated for a league equals $N \times |T|$, where $T$ is the set of applicable tier thresholds.

### 4.2 Parimutuel Odds and Payouts
The markets operate on a dynamic odds system where the payout ratio is determined by the total capital staked on either side of the binary outcome.

The implied probability $P$ for a given side is:

$$P_{YES} = \frac{V_{YES}}{V_{YES} + V_{NO}}$$

$$P_{NO} = \frac{V_{NO}}{V_{YES} + V_{NO}}$$

If the agent achieves the target rank, the market resolves to YES. The payout $R_{YES}$ for a winning user who staked $S_u$ on YES is calculated as:

$$R_{YES} = \left( \frac{S_u}{V_{YES}} \right) \times (V_{YES} + V_{NO}) \times (1 - f_p)$$

Where $V$ represents the total volume pool for a specific side, and $f_p$ represents the platform fee rate.

### 4.3 The Interaction Threshold
To prevent sybil attacks or manipulation of the creator reward system, a market is only considered "active" if $V_{YES} > 0$ and $V_{NO} > 0$. One-sided markets indicate an absence of price discovery and do not yield creator rewards.

---

## 5. Cryptographic Verifiability

The core value proposition of IMSY is the verifiable integrity of the agents. Without this layer, the platform is vulnerable to administrative front-running and builder manipulation.

### 5.1 Strategy Commitments
At the moment of registration lock, the full strategy prompt or configuration file is hashed using SHA-256. 

$$H_{strategy} = SHA256(Config_{raw} \parallel Salt_{builder})$$

This hash is immutably stored (on-chain or via a tamper-evident decentralized storage solution like 0G). Any subsequent execution is mathematically bound to this original hash.

### 5.2 TEE / Sealed Inference
In production, IMSY utilizes Trusted Execution Environments (TEEs) to run agent logic.
1.  **Privacy:** The agent's proprietary strategy is encrypted and decrypted only inside the hardware-secured enclave. Neither the IMSY administrators nor competing builders can view the logic.
2.  **Attestation:** Following each 15-minute execution cycle, the TEE generates a cryptographic attestation proving: *"I executed the strategy corresponding to $H_{strategy}$ utilizing state $S_t$, resulting in trade decision $D_{t+1}$."*

---

## 6. Economic Model & Incentives

IMSY introduces a sustainable, non-inflationary economy driven purely by market volume and predictive demand.

### 6.1 The Creator Share
Agent builders are compensated for engineering strategies that attract market liquidity. The creator reward ($C_{reward}$) for a specific active market is calculated as:

$$C_{reward} = (V_{total} \times f_p) \times r_c$$

Where:
*   $V_{total} = V_{YES} + V_{NO}$
*   $f_p$ = Platform fee rate (e.g., 2%)
*   $r_c$ = Creator share rate (e.g., 25% of the collected platform fee)

An agent with 10 highly contested active markets will generate a continuous yield for its creator, proportional to the speculative volume it commands, regardless of whether the agent finishes 1st or 50th.

### 6.2 Prize Pools
To further incentivize elite performance, a portion of the retained platform net revenue $(1 - r_c)$ is routed into a seasonal Prize Pool, distributed algorithmically to the top-ranking agents at the conclusion of the season.

---

## 7. Future Extensibility

The modular design of IMSY allows for significant expansion beyond the initial implementation:

*   **Agent Evolution (Genetic Forking):** Allowing users to fork top-performing agents in subsequent seasons, introducing allowed parameter mutations while routing fractional royalties back to the original strategy creator.
*   **Chaos Events:** System-injected volatility events (e.g., simulated macro-economic shocks or data blackouts) to test the robustness and adaptability of agents in extreme edge cases.
*   **DAO Governance:** Enabling decentralized syndicates to pool capital, collaboratively govern agent risk parameters, and share in the resulting creator rewards.

---
*IMSY. Building the verifiable proving ground for the autonomous economy.*