const now = Date.now()
const day = 24 * 60 * 60 * 1000
const hour = 60 * 60 * 1000

export const DEMO_WALLET = "0x7a9d1f4c2b8e6a5310f42c98d15b64c709e31a22"

export const DEMO_SEASONS = [
  {
    chain_id_hex: "0x736561736f6e2d67656e657369732d303031",
    name: "Genesis Volatility Cup",
    slug: "genesis-volatility-cup",
    description: "A live-fire sandbox where momentum, mean reversion, and news-reactive agents fight over the same volatile basket.",
    status: "active",
    registration_start: new Date(now - 18 * day),
    registration_end: new Date(now - 12 * day),
    season_start: new Date(now - 10 * day),
    season_end: new Date(now + 11 * day),
    betting_lock_hours_before_end: 6,
    created_by_wallet: DEMO_WALLET,
    tx_hash: "0x9d28a3b0f6c9842e4f26c08a4474cdef19b5a5218a4f35dd31c9470c7a5f1101",
    created_on_chain_at: new Date(now - 19 * day),
  },
  {
    chain_id_hex: "0x736561736f6e2d6d6163726f2d303032",
    name: "Macro Signals Trial",
    slug: "macro-signals-trial",
    description: "Lower leverage, wider signal windows, and a slower scoring cadence for agents that trade cross-asset rotations.",
    status: "registration",
    registration_start: new Date(now - 2 * day),
    registration_end: new Date(now + 3 * day),
    season_start: new Date(now + 4 * day),
    season_end: new Date(now + 25 * day),
    betting_lock_hours_before_end: 12,
    created_by_wallet: DEMO_WALLET,
    tx_hash: "0x17f0b00db7195f22d421a2e891ab6f33b8cd45e3d8193b3cc0014b3a7dd01202",
    created_on_chain_at: new Date(now - 3 * day),
  },
  {
    chain_id_hex: "0x736561736f6e2d73706565642d303033",
    name: "Speed League: Seoul",
    slug: "speed-league-seoul",
    description: "A 24-hour sprint season built for high-frequency decision loops and brutal drawdown discipline.",
    status: "ended",
    registration_start: new Date(now - 25 * day),
    registration_end: new Date(now - 23 * day),
    season_start: new Date(now - 22 * day),
    season_end: new Date(now - 21 * day),
    betting_lock_hours_before_end: 1,
    created_by_wallet: DEMO_WALLET,
    tx_hash: "0x98a62c06d557d2b8a82bb61f418f7a21fd9f455e519f560d6f1388ac42691303",
    created_on_chain_at: new Date(now - 26 * day),
  },
]

export const DEMO_LEAGUES = [
  {
    chain_id_hex: "0x6c65616775652d617061632d686967687269736b",
    season_chain_id_hex: DEMO_SEASONS[0].chain_id_hex,
    name: "APAC League 1",
    type: "high_risk",
    asset_universe: ["WETH", "SOL", "LINK", "ARB", "TIA"],
    initial_capital: 1000,
    max_drawdown_pct: 15,
    allowed_signals: ["momentum", "relative_strength", "volume_delta", "market_odds"],
    max_leverage: 1,
    agent_count: 8,
    status: "active",
    tx_hash: "0x6dbe771f3a53d6e282de03b23cf51614149e099c4379e58cb561f34f26cb2101",
    created_at: new Date(now - 12 * day),
  },
  {
    chain_id_hex: "0x6c65616775652d6d656d652d696e747261646179",
    season_chain_id_hex: DEMO_SEASONS[0].chain_id_hex,
    name: "Meme Intraday Desk",
    type: "speed",
    asset_universe: ["DOGE", "PEPE", "BONK", "WIF"],
    initial_capital: 750,
    max_drawdown_pct: 22,
    allowed_signals: ["social_velocity", "volume_delta", "funding", "trend_break"],
    max_leverage: 2,
    agent_count: 11,
    status: "active",
    tx_hash: "0xb34a2a821c4a007f5b2ad18bf1876029589d27588aa71571d3b2b18e39fd2102",
    created_at: new Date(now - 11 * day),
  },
  {
    chain_id_hex: "0x6c65616775652d6d6163726f2d63726f7373",
    season_chain_id_hex: DEMO_SEASONS[1].chain_id_hex,
    name: "Macro Cross-Asset",
    type: "macro",
    asset_universe: ["BTC", "ETH", "SOL", "USDC"],
    initial_capital: 1500,
    max_drawdown_pct: 12,
    allowed_signals: ["macro_calendar", "rates_proxy", "volatility_regime"],
    max_leverage: 1,
    agent_count: 5,
    status: "upcoming",
    tx_hash: "0x21680d9da0293062c272d03ec1f30af98e5d651934962753b08d036d9c031104",
    created_at: new Date(now - 2 * day),
  },
]

function root(seed: string) {
  const hex = Array.from(seed)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("")
  return `0x${hex.padEnd(64, "0").slice(0, 64)}`
}

function strategy(name: string, style: string, signals: string[], assets: string[], rootSeed: string) {
  return {
    description: style,
    playbook: {
      prime_directive: "Compound when signal agreement is high, retreat quickly when rank or drawdown pressure turns against the agent.",
      trading_style: style,
      entry_rules: [
        "Enter only when two allowed signals agree across adjacent engine ticks.",
        "Prefer assets with improving rank contribution and rising market liquidity.",
      ],
      exit_rules: [
        "Trim into strength after a fast rank jump.",
        "Exit when the trade thesis loses signal agreement for two consecutive ticks.",
      ],
      risk_rules: [
        "Never let one asset exceed the position cap.",
        "Move to cash when drawdown exceeds half the league limit.",
      ],
      sizing_rules: [
        "Start with a probe size before scaling.",
        "Increase size only after unrealized PnL and rank movement agree.",
      ],
      disallowed_actions: ["No averaging down into a falling asset.", "No trades outside the league asset universe."],
      evaluation_notes: `${name} is tuned for screenshot-ready demo telemetry with believable volatility.`,
    },
    strategy_root: root(rootSeed),
    sha256_hash: root(`${rootSeed}ff`),
    zg_storage_status: "uploaded",
    zg_storage_tx_hash: root(`${rootSeed}aa`),
    risk_profile: { max_drawdown_pct: 15, max_position_size_pct: 35, leverage_cap: 1 },
    allowed_signals: signals,
    asset_universe: assets,
    version: 2,
  }
}

export const DEMO_AGENTS = [
  {
    agent_id: 24,
    name: "Rocket",
    owner_wallet: DEMO_WALLET,
    leagues: [DEMO_LEAGUES[0].chain_id_hex],
    season_chain_id_hex: DEMO_SEASONS[0].chain_id_hex,
    strategy: strategy(
      "Rocket",
      "Disciplined short-horizon trader. Rides confirmed intra-tick momentum on liquid league assets, fades extreme drift, and parks in cash whenever signals are ambiguous.",
      ["momentum", "relative_strength", "volume_delta", "market_odds"],
      ["WETH", "SOL", "LINK", "ARB"],
      "a24",
    ),
    deposit_usd: usdScaledString(1000),
    deploy_tx_hash: "0x24f3a7c92b1d4e6a88901c28f6d5b4e3c2a19019ac2b4c2f5d1d01",
    icon: "Rocket",
    color: "#a855f7",
    status: "active",
    performance: { roi_pct: 64.7, sharpe_ratio: 2.18, max_drawdown_pct: 7.4, consistency_score: 82, trade_count: 37, win_rate: 64.9 },
    current_rank: 3,
    rank_history: rankHistory([12, 10, 13, 9, 7, 8, 6, 4, 5, 3, 2, 4, 4, 3], [-8.6, -4.1, -12.8, 1.9, 9.7, 6.4, 14.8, 27.3, 22.6, 38.2, 51.4, 42.9, 57.8, 64.7]),
    prompt_locked_at: new Date(now - 13 * day),
  },
  {
    agent_id: 31,
    name: "Vanta",
    owner_wallet: DEMO_WALLET,
    leagues: [DEMO_LEAGUES[0].chain_id_hex],
    season_chain_id_hex: DEMO_SEASONS[0].chain_id_hex,
    strategy: strategy("Vanta", "Volatility filter that waits for crowded trades to overextend, then rotates into clean reversal setups.", ["volatility_regime", "funding", "mean_reversion"], ["WETH", "SOL", "TIA"], "b31"),
    deposit_usd: usdScaledString(1000),
    deploy_tx_hash: "0x31f3a7c92b1d4e6a88901c28f6d5b4e3c2a19019ac2b4c2f5d1d02",
    icon: "Sparkles",
    color: "#fb923c",
    status: "active",
    performance: { roi_pct: 42.3, sharpe_ratio: 1.71, max_drawdown_pct: 9.1, consistency_score: 76, trade_count: 29, win_rate: 58.2 },
    current_rank: 4,
    rank_history: rankHistory([9, 8, 8, 6, 7, 5, 4, 6, 5, 4, 5, 4, 4, 4], [-2.1, 3.8, 5.4, 12.6, 10.2, 19.1, 28.4, 18.7, 26.1, 33.8, 30.4, 39.9, 41.8, 42.3]),
    prompt_locked_at: new Date(now - 13 * day),
  },
  {
    agent_id: 42,
    name: "Driftline",
    owner_wallet: "0x629d6ba3a8fd38aa9f21ddae891315fc108f1480",
    leagues: [DEMO_LEAGUES[0].chain_id_hex],
    season_chain_id_hex: DEMO_SEASONS[0].chain_id_hex,
    strategy: strategy("Driftline", "Trend follower that lets winners run until volume confirmation weakens.", ["momentum", "volume_delta", "breakout"], ["WETH", "LINK", "ARB"], "c42"),
    deposit_usd: usdScaledString(1000),
    deploy_tx_hash: "0x42f3a7c92b1d4e6a88901c28f6d5b4e3c2a19019ac2b4c2f5d1d03",
    icon: "Flame",
    color: "#22c55e",
    status: "active",
    performance: { roi_pct: 28.6, sharpe_ratio: 1.23, max_drawdown_pct: 12.2, consistency_score: 68, trade_count: 44, win_rate: 51.6 },
    current_rank: 6,
    rank_history: rankHistory([7, 5, 4, 4, 3, 5, 7, 6, 5, 7, 6, 5, 6, 6], [1.2, 12.4, 19.6, 21.8, 31.2, 17.3, 9.1, 14.8, 22.5, 13.2, 19.4, 25.6, 27.1, 28.6]),
    prompt_locked_at: new Date(now - 13 * day),
  },
  {
    agent_id: 57,
    name: "Kite",
    owner_wallet: DEMO_WALLET,
    leagues: [DEMO_LEAGUES[1].chain_id_hex],
    season_chain_id_hex: DEMO_SEASONS[0].chain_id_hex,
    strategy: strategy("Kite", "Meme-market sprinter that lets social velocity lead but requires volume to confirm before sizing up.", ["social_velocity", "volume_delta", "trend_break"], ["DOGE", "PEPE", "BONK"], "d57"),
    deposit_usd: usdScaledString(750),
    deploy_tx_hash: "0x57f3a7c92b1d4e6a88901c28f6d5b4e3c2a19019ac2b4c2f5d1d04",
    icon: "Compass",
    color: "#06b6d4",
    status: "active",
    performance: { roi_pct: 88.4, sharpe_ratio: 2.46, max_drawdown_pct: 14.8, consistency_score: 71, trade_count: 63, win_rate: 61.9 },
    current_rank: 1,
    rank_history: rankHistory([11, 9, 7, 4, 2, 3, 1, 2, 1, 1, 2, 1, 1, 1], [-6.5, 2.4, 9.8, 24.2, 41.6, 35.1, 58.7, 53.2, 67.8, 72.4, 65.9, 79.1, 84.6, 88.4]),
    prompt_locked_at: new Date(now - 12 * day),
  },
  {
    agent_id: 63,
    name: "Pulse",
    owner_wallet: "0x39477b1f8a2c9ea2a9270d20e87d3fb9d13f1099",
    leagues: [DEMO_LEAGUES[1].chain_id_hex],
    season_chain_id_hex: DEMO_SEASONS[0].chain_id_hex,
    strategy: strategy("Pulse", "Funding-aware scalper that sells crowded spikes and re-enters when the orderbook resets.", ["funding", "social_velocity", "mean_reversion"], ["DOGE", "WIF", "PEPE"], "e63"),
    deposit_usd: usdScaledString(750),
    deploy_tx_hash: "0x63f3a7c92b1d4e6a88901c28f6d5b4e3c2a19019ac2b4c2f5d1d05",
    icon: "Gem",
    color: "#ec4899",
    status: "active",
    performance: { roi_pct: 51.2, sharpe_ratio: 1.64, max_drawdown_pct: 18.6, consistency_score: 59, trade_count: 71, win_rate: 54.8 },
    current_rank: 5,
    rank_history: rankHistory([13, 12, 8, 6, 8, 7, 5, 4, 6, 5, 3, 4, 5, 5], [-14.2, -9.5, 8.1, 17.6, 4.8, 13.2, 25.6, 36.4, 23.7, 31.5, 48.9, 43.4, 49.1, 51.2]),
    prompt_locked_at: new Date(now - 12 * day),
  },
  {
    agent_id: 76,
    name: "Atlas",
    owner_wallet: DEMO_WALLET,
    leagues: [DEMO_LEAGUES[2].chain_id_hex],
    season_chain_id_hex: DEMO_SEASONS[1].chain_id_hex,
    strategy: strategy("Atlas", "Macro rotation agent that waits for volatility regimes to line up before moving between majors and cash.", ["macro_calendar", "rates_proxy", "volatility_regime"], ["BTC", "ETH", "SOL", "USDC"], "f76"),
    deposit_usd: usdScaledString(1500),
    deploy_tx_hash: "0x76f3a7c92b1d4e6a88901c28f6d5b4e3c2a19019ac2b4c2f5d1d06",
    icon: "Crown",
    color: "#fbbf24",
    status: "registered",
    performance: { roi_pct: 12.8, sharpe_ratio: 1.08, max_drawdown_pct: 4.2, consistency_score: 88, trade_count: 12, win_rate: 66.7 },
    current_rank: 2,
    rank_history: rankHistory([5, 5, 4, 3, 3, 2, 2, 3, 2, 2, 2, 2, 2, 2], [0.4, 1.2, 3.6, 5.1, 4.8, 7.2, 8.4, 6.9, 9.2, 10.1, 10.8, 11.3, 12.1, 12.8]),
    prompt_locked_at: new Date(now - 2 * day),
  },
]

export const DEMO_MARKETS = [
  market(24, 1, "Will Rocket finish top 1?", 42.18, 21.75),
  market(24, 3, "Will Rocket finish top 3?", 73.52, 18.4),
  market(24, 5, "Will Rocket finish top 5?", 96.08, 13.92),
  market(24, 10, "Will Rocket finish top 10?", 121.7, 8.66),
  market(31, 3, "Will Vanta finish top 3?", 34.15, 28.08),
  market(31, 5, "Will Vanta finish top 5?", 58.77, 17.42),
  market(42, 5, "Will Driftline finish top 5?", 22.45, 31.9),
  market(42, 10, "Will Driftline finish top 10?", 65.2, 9.34),
  market(57, 1, "Will Kite win the Meme Intraday Desk?", 91.4, 44.2),
  market(57, 3, "Will Kite finish top 3?", 138.6, 26.5),
  market(63, 3, "Will Pulse finish top 3?", 49.8, 51.7),
  market(63, 5, "Will Pulse finish top 5?", 84.3, 22.1),
  market(76, 1, "Will Atlas lead Macro Cross-Asset?", 31.2, 19.6),
  market(76, 3, "Will Atlas finish top 3?", 76.8, 10.4),
]

export const DEMO_TRADES = new Map<number, any[]>([
  [24, [
    trade(24, "buy", "SOL", 1.18, 154.72, 0.91, "Momentum confirmed after rank basket rotated into high-beta majors."),
    trade(24, "sell", "WETH", 0.04, 3422.9, 0.84, "Trimmed after two candles failed to extend above the volatility band."),
    trade(24, "buy", "LINK", 8.6, 17.86, 0.88, "Oracle basket led the league watchlist while market YES flow accelerated."),
    trade(24, "hold", "ARB", 0, 0.78, 0.73, "Spread was wide, holding existing exposure until liquidity improves."),
  ]],
  [31, [
    trade(31, "buy", "TIA", 18, 8.42, 0.79, "Volatility compression broke upward with clean volume confirmation."),
    trade(31, "sell", "SOL", 0.9, 156.14, 0.67, "Cut beta after funding flipped crowded."),
  ]],
  [42, [
    trade(42, "buy", "WETH", 0.06, 3389.2, 0.74, "Breakout held above the prior engine mark."),
    trade(42, "sell", "ARB", 140, 0.81, 0.62, "Reduced low-conviction exposure after rank delta faded."),
  ]],
  [57, [
    trade(57, "buy", "PEPE", 1800000, 0.000014, 0.81, "Social velocity and volume delta both accelerated across the meme basket."),
    trade(57, "sell", "BONK", 120000, 0.000028, 0.69, "Locked profit after the spread widened into a crowded spike."),
  ]],
  [63, [
    trade(63, "sell", "DOGE", 410, 0.18, 0.72, "Funding heat climbed while rank contribution flattened."),
    trade(63, "buy", "WIF", 32, 2.64, 0.66, "Mean-reversion setup improved after two weak ticks flushed leverage."),
  ]],
  [76, [
    trade(76, "buy", "BTC", 0.012, 64220, 0.78, "Macro basket rotated toward majors after volatility cooled."),
    trade(76, "hold", "USDC", 0, 1, 0.91, "Upcoming regime change requires cash until the calendar risk clears."),
  ]],
])

export const DEMO_BETS = [
  bet(24, DEMO_MARKETS[1], "yes", 3.25, "active", 0.71),
  bet(31, DEMO_MARKETS[4], "yes", 1.4, "active", 0.55),
  bet(42, DEMO_MARKETS[6], "no", 0.9, "won", 0.58, 1.56),
  bet(24, DEMO_MARKETS[0], "no", 0.65, "lost", 0.38, 0),
  bet(57, DEMO_MARKETS[9], "yes", 2.8, "active", 0.84),
  bet(63, DEMO_MARKETS[10], "no", 1.15, "active", 0.49),
  bet(76, DEMO_MARKETS[13], "yes", 4.6, "active", 0.88),
]

export const DEMO_EARNINGS = [
  earning(24, [DEMO_MARKETS[0].contract_address, DEMO_MARKETS[1].contract_address, DEMO_MARKETS[2].contract_address], 7.92, 0.25, "paid"),
  earning(31, [DEMO_MARKETS[4].contract_address, DEMO_MARKETS[5].contract_address], 3.48, 0.25, "pending"),
  earning(57, [DEMO_MARKETS[8].contract_address, DEMO_MARKETS[9].contract_address], 9.35, 0.25, "paid"),
  earning(76, [DEMO_MARKETS[12].contract_address, DEMO_MARKETS[13].contract_address], 2.74, 0.25, "pending"),
]

export const DEMO_TOKENS = [
  token("WETH", "0x1000000000000000000000000000000000000001", "volatile", 3280, 3422.9, 4.36, 1),
  token("SOL", "0x1000000000000000000000000000000000000002", "volatile", 142, 154.72, 8.96, 1),
  token("LINK", "0x1000000000000000000000000000000000000003", "volatile", 15.8, 17.86, 13.04, 1),
  token("ARB", "0x1000000000000000000000000000000000000004", "volatile", 0.72, 0.78, 8.33, 1),
  token("TIA", "0x1000000000000000000000000000000000000005", "volatile", 7.95, 8.42, 5.91, 1),
  token("sUSD", "0x1000000000000000000000000000000000000006", "stable", 1, 1, 0, 1),
]

export function getDemoSeason(id: string) {
  return DEMO_SEASONS.find((season) => season.chain_id_hex.toLowerCase() === id.toLowerCase()) ?? null
}

export function getDemoLeague(id: string) {
  return DEMO_LEAGUES.find((league) => league.chain_id_hex.toLowerCase() === id.toLowerCase()) ?? null
}

export function getDemoAgent(id: number) {
  return DEMO_AGENTS.find((agent) => agent.agent_id === id) ?? null
}

export function getDemoMarket(address: string) {
  return DEMO_MARKETS.find((market) => market.contract_address.toLowerCase() === address.toLowerCase()) ?? null
}

export function getDemoMarketsByAgent(agentId: number) {
  return DEMO_MARKETS.filter((market) => market.agent_id === agentId)
}

export function getDemoMarketsByLeague(leagueId: string) {
  return DEMO_MARKETS.filter((market) => market.league_chain_id_hex.toLowerCase() === leagueId.toLowerCase())
}

export function getDemoAgentsByLeague(leagueId: string) {
  return DEMO_AGENTS.filter((agent) => agent.leagues.some((league) => league.toLowerCase() === leagueId.toLowerCase()))
    .sort((a, b) => a.current_rank - b.current_rank)
}

export function getDemoPnlHistory(leagueId: string) {
  const agents = getDemoAgentsByLeague(leagueId).slice(0, 5)
  return {
    since: new Date(now - 2 * hour).toISOString(),
    series: agents.map((agent) => ({
      agent_id: agent.agent_id,
      name: agent.name,
      icon: agent.icon,
      color: agent.color,
      points: agent.rank_history.slice(-10).map((point: any, index: number) => ({
        ts: new Date(now - (9 - index) * 12 * 60 * 1000).toISOString(),
        pnl_pct: point.roi_pct,
        total_value_usd: usdScaledString(1000 * (1 + point.roi_pct / 100)),
      })),
    })),
  }
}

function rankHistory(ranks: number[], roi: number[]) {
  return ranks.map((rank, index) => ({
    timestamp: new Date(now - (ranks.length - 1 - index) * day),
    rank,
    roi_pct: roi[index] ?? 0,
  }))
}

function market(agentId: number, tier: number, question: string, yes_pool: number, no_pool: number) {
  const league = DEMO_AGENTS.find((agent) => agent.agent_id === agentId)?.leagues[0] ?? DEMO_LEAGUES[0].chain_id_hex
  const total = Number((yes_pool + no_pool).toFixed(6))
  return {
    contract_address: `0x${agentId.toString(16).padStart(2, "0")}${tier.toString(16).padStart(2, "0")}f3a7c92b1d4e6a88901c28f6d5b4e3c2a190`,
    league_chain_id_hex: league,
    season_chain_id_hex: DEMO_LEAGUES.find((l) => l.chain_id_hex === league)?.season_chain_id_hex ?? DEMO_SEASONS[0].chain_id_hex,
    agent_id: agentId,
    tier,
    question,
    deployment_tx_hash: root(`${agentId}${tier}`),
    deployed_at: new Date(now - 8 * day),
    chain_id: 16602,
    status: "open",
    yes_pool,
    no_pool,
    total_volume: total,
    yes_count: Math.max(1, Math.round(yes_pool / 2.8)),
    no_count: Math.max(1, Math.round(no_pool / 2.4)),
    interaction_threshold_met: true,
    outcome: null,
  }
}

function trade(agentId: number, action: "buy" | "sell" | "hold", asset: string, quantity: number, priceUsd: number, confidence: number, reason: string) {
  const agent = DEMO_AGENTS.find((row) => row.agent_id === agentId)
  return {
    agent_id: agentId,
    league_chain_id_hex: agent?.leagues[0] ?? DEMO_LEAGUES[0].chain_id_hex,
    season_chain_id_hex: agent?.season_chain_id_hex ?? DEMO_SEASONS[0].chain_id_hex,
    timestamp: new Date(now - Math.floor(Math.random() * 12) * hour),
    action,
    asset,
    quantity,
    price_usd: usdScaledString(priceUsd),
    success: true,
    simulated: true,
    confidence,
    reason,
    tx_hash: root(`${agentId}${action}${asset}${quantity}`),
    compute_ref: { model: "0g-demo-infer", endpoint: "demo", tee_verified: true, status: "verified" },
  }
}

function bet(agentId: number, marketRow: any, side: "yes" | "no", stake: number, status: "active" | "won" | "lost", odds: number, payout = 0) {
  return {
    wallet_address: DEMO_WALLET,
    market_contract: marketRow.contract_address,
    agent_id: agentId,
    season_chain_id_hex: marketRow.season_chain_id_hex,
    side,
    stake,
    implied_odds_at_bet: odds,
    tx_hash: root(`bet${agentId}${side}${stake}`),
    tx_block_number: 812431 + agentId,
    status,
    payout,
    placed_at: new Date(now - agentId * hour),
    resolved_at: status === "active" ? null : new Date(now - 3 * hour),
    market: marketRow,
  }
}

function earning(agentId: number, contracts: string[], totalFeePool: number, shareRate: number, status: "pending" | "paid") {
  const agent = getDemoAgent(agentId)
  return {
    creator_wallet: DEMO_WALLET,
    agent_id: agentId,
    season_chain_id_hex: agent?.season_chain_id_hex ?? DEMO_SEASONS[0].chain_id_hex,
    eligible_market_contracts: contracts,
    total_fee_pool: totalFeePool,
    creator_share_rate: shareRate,
    earned_amount: Number((totalFeePool * shareRate).toFixed(4)),
    tx_hash: root(`earn${agentId}`),
    status,
    calculated_at: new Date(now - agentId * 30 * 60 * 1000),
    paid_at: status === "paid" ? new Date(now - agentId * 20 * 60 * 1000) : null,
    agent,
  }
}

function token(symbol: string, contract_address: string, asset_class: string, base_price_usd: number, current_price_usd: number, last_change_pct: number, last_direction: 1 | -1) {
  return {
    symbol,
    contract_address,
    asset_class,
    base_price_usd,
    current_price_usd,
    previous_price_usd: Number((current_price_usd / (1 + last_change_pct / 100)).toFixed(6)),
    last_change_pct,
    last_direction,
    last_updated: new Date(now - 11 * 60 * 1000),
  }
}

export function usdScaledString(value: number) {
  return (BigInt(Math.round(value * 1_000_000)) * 10n ** 12n).toString()
}
