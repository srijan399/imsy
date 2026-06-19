// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title IMSYMarket
 * @notice A binary YES/NO parimutuel prediction market for agent rank outcomes.
 *
 * Lifecycle: PENDING → OPEN → LOCKED → RESOLVED
 *
 * Payout math:
 *   platform_fee = totalPool * platformFeeBps / 10000
 *   creator_reward = platform_fee * creatorShareBps / 10000 (only if both pools > 0)
 *   net_pool = totalPool - platform_fee
 *   winner_payout = (their_stake / winning_pool) * net_pool
 */
contract IMSYMarket {
    address public immutable resolver;
    address public immutable agentCreator;
    address public immutable platformTreasury;
    string public question;
    uint256 public immutable bettingCloseTimestamp;
    uint256 public immutable platformFeeBps;
    uint256 public immutable creatorShareBps;

    uint256 public yesPool;
    uint256 public noPool;

    mapping(address => uint256) public yesBets;
    mapping(address => uint256) public noBets;

    bool public resolved;
    bool public outcome; // true = YES wins, false = NO wins

    mapping(address => bool) public claimed;

    /* ── Events ────────────────────────────────────── */
    event BetPlaced(address indexed bettor, bool side, uint256 amount);
    event MarketResolved(bool outcome, uint256 yesPool, uint256 noPool);
    event PayoutClaimed(address indexed bettor, uint256 amount);
    event CreatorRewarded(address indexed creator, uint256 amount);

    /* ── Modifiers ─────────────────────────────────── */
    modifier onlyResolver() {
        require(msg.sender == resolver, "Not resolver");
        _;
    }

    modifier bettingOpen() {
        require(block.timestamp < bettingCloseTimestamp, "Betting closed");
        require(!resolved, "Market resolved");
        _;
    }

    modifier afterResolution() {
        require(resolved, "Not resolved");
        _;
    }

    /* ── Constructor ───────────────────────────────── */

    constructor(
        address _resolver,
        address _agentCreator,
        string memory _question,
        uint256 _bettingClose,
        uint256 _platformFeeBps,
        uint256 _creatorShareBps
    ) {
        require(_resolver != address(0), "Invalid resolver");
        require(_agentCreator != address(0), "Invalid creator");

        resolver = _resolver;
        agentCreator = _agentCreator;
        platformTreasury = msg.sender; // factory is the treasury
        question = _question;
        bettingCloseTimestamp = _bettingClose;
        platformFeeBps = _platformFeeBps;
        creatorShareBps = _creatorShareBps;
    }

    /* ── Betting ───────────────────────────────────── */

    function betYes() external payable bettingOpen {
        require(msg.value > 0, "Zero stake");
        yesBets[msg.sender] += msg.value;
        yesPool += msg.value;
        emit BetPlaced(msg.sender, true, msg.value);
    }

    function betNo() external payable bettingOpen {
        require(msg.value > 0, "Zero stake");
        noBets[msg.sender] += msg.value;
        noPool += msg.value;
        emit BetPlaced(msg.sender, false, msg.value);
    }

    /* ── Resolution ────────────────────────────────── */

    function resolve(bool _outcome) external onlyResolver {
        require(!resolved, "Already resolved");
        resolved = true;
        outcome = _outcome;

        uint256 _totalPool = yesPool + noPool;
        if (_totalPool == 0) {
            emit MarketResolved(_outcome, 0, 0);
            return;
        }

        uint256 platformFee = (_totalPool * platformFeeBps) / 10000;
        bool interactionThresholdMet = yesPool > 0 && noPool > 0;

        if (interactionThresholdMet) {
            // Creator earns their share of platform fee
            uint256 creatorReward = (platformFee * creatorShareBps) / 10000;
            uint256 treasuryShare = platformFee - creatorReward;

            if (creatorReward > 0) {
                (bool s1,) = agentCreator.call{value: creatorReward}("");
                require(s1, "Creator transfer failed");
                emit CreatorRewarded(agentCreator, creatorReward);
            }
            if (treasuryShare > 0) {
                (bool s2,) = platformTreasury.call{value: treasuryShare}("");
                require(s2, "Treasury transfer failed");
            }
        } else {
            // One-sided market: full platform fee to treasury
            if (platformFee > 0) {
                (bool s,) = platformTreasury.call{value: platformFee}("");
                require(s, "Treasury transfer failed");
            }
        }

        emit MarketResolved(_outcome, yesPool, noPool);
    }

    /* ── Claims ────────────────────────────────────── */

    function claim() external afterResolution {
        require(!claimed[msg.sender], "Already claimed");
        claimed[msg.sender] = true;

        uint256 _totalPool = yesPool + noPool;
        uint256 platformFee = (_totalPool * platformFeeBps) / 10000;
        uint256 netPool = _totalPool - platformFee;

        uint256 userStake;
        uint256 winningPool;

        if (outcome) {
            userStake = yesBets[msg.sender];
            winningPool = yesPool;
        } else {
            userStake = noBets[msg.sender];
            winningPool = noPool;
        }

        require(userStake > 0, "No winning bet");
        require(winningPool > 0, "Empty winning pool");

        uint256 payout = (userStake * netPool) / winningPool;
        require(payout > 0, "Nothing to claim");

        (bool success,) = msg.sender.call{value: payout}("");
        require(success, "Transfer failed");

        emit PayoutClaimed(msg.sender, payout);
    }

    /* ── View helpers ──────────────────────────────── */

    function totalPool() external view returns (uint256) {
        return yesPool + noPool;
    }

    /**
     * Implied YES probability in basis points (0–10000)
     */
    function impliedYesProbability() external view returns (uint256) {
        uint256 total = yesPool + noPool;
        if (total == 0) return 5000; // 50/50 when empty
        return (yesPool * 10000) / total;
    }

    /**
     * Implied NO probability in basis points (0–10000)
     */
    function impliedNoProbability() external view returns (uint256) {
        uint256 total = yesPool + noPool;
        if (total == 0) return 5000;
        return (noPool * 10000) / total;
    }

    /**
     * Allow contract to receive ETH (for edge-case refunds)
     */
    receive() external payable {}
}
