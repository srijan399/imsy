// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// src/IMSYMarket.sol

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

// src/IMSYMarketFactory.sol

interface ISandboxRouter {
    function tokenOf(bytes32 symbol) external view returns (address);
    function swapUsdForToken(bytes32 symbol, uint256 usdIn, uint256 minTokenOut) external returns (uint256);
    function swapTokenForUsd(bytes32 symbol, uint256 amountIn, uint256 minUsdOut) external returns (uint256);
}

interface IERC20Sandbox {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
    function transferFrom(address, address, uint256) external returns (bool);
}

/**
 * @title IMSYMarketFactory
 * @notice Single integration contract for IMSY: market deployment + season /
 *         league registry + agent custody + executor-driven trade ledger.
 *
 *         Custody model: agents are logical accounts inside this contract.
 *         Each agent holds an internal `cashUsd` balance denominated in sUSD
 *         (1e18-scaled). At registration / on `deposit`, the contract pulls
 *         sUSD from the caller via `transferFrom`. On `withdraw`, sUSD is
 *         transferred back. Trades quote in USD; the executor calls
 *         `executeTrade(...)` and the factory routes through the configured
 *         `sandboxRouter`'s `swapUsdForToken` / `swapTokenForUsd`.
 *
 *         Markets (`IMSYMarket.sol`) still operate in native 0G — bets are
 *         user money, not agent money. Native fee flow into the treasury is
 *         filtered by `isMarket` so sandbox router refunds cannot inflate it.
 */
contract IMSYMarketFactory {
    /* ── Owner / role state ─────────────────────────────── */
    mapping(address => bool) public isOwner;
    uint256 public ownerCount;
    address[] private ownerList;

    address public resolver;
    address public executor;
    mapping(address => bool) public approvedDexRouter;

    /// Native balance attributable to platform fees from `IMSYMarket.resolve`.
    uint256 public treasuryWei;
    /// sUSD balance attributable to platform fees (reserved; no flow today).
    uint256 public treasuryUsd;

    /// sUSD ERC20 used for agent cash.
    address public sandboxUsd;
    /// Sandbox router used by `_sandboxTrade`.
    address public sandboxRouter;

    /* ── Markets ────────────────────────────────────────── */
    mapping(bytes32 => address[]) private _seasonMarkets;
    address[] public allMarkets;
    mapping(address => bool) public isMarket;

    /* ── Season / League registry ───────────────────────── */
    struct Season {
        bytes32 id;
        string name;
        uint64 start;
        uint64 end;
        address creator;
        uint64 createdAt;
        bool exists;
    }

    struct League {
        bytes32 id;
        bytes32 seasonId;
        string name;
        address creator;
        uint64 createdAt;
        bool exists;
    }

    mapping(bytes32 => Season) private _seasons;
    bytes32[] public seasonIds;
    mapping(bytes32 => League) private _leagues;
    bytes32[] public leagueIds;
    mapping(bytes32 => bytes32[]) private _seasonLeagues;

    /* ── Agent state ────────────────────────────────────── */
    struct Position {
        uint256 qty;
        uint256 avgPriceUsd;
    }

    struct AgentMeta {
        address owner;
        string name;
        bytes32 strategyRoot;
        bool exists;
        uint256 cashUsd;
        uint256 tradeCount;
        uint64 createdAt;
    }

    uint256 public agentCount;
    mapping(uint256 => AgentMeta) private _agentMeta;
    mapping(address => uint256[]) private _ownerAgents;

    mapping(uint256 => bytes32[]) private _agentLeagues;
    mapping(uint256 => mapping(bytes32 => uint256)) private _agentLeagueIdx; // 1-indexed (0 = absent)

    mapping(uint256 => bytes32[]) private _agentAssets;
    mapping(uint256 => mapping(bytes32 => uint256)) private _agentAssetIdx; // 1-indexed
    mapping(uint256 => mapping(bytes32 => Position)) private _agentPositions;

    /* ── Reentrancy lock ────────────────────────────────── */
    uint256 private _locked;

    /* ── Events ─────────────────────────────────────────── */
    event MarketDeployed(address indexed market, bytes32 indexed seasonId, address agentCreator, string question);
    event ResolverUpdated(address indexed oldResolver, address indexed newResolver);
    event ExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);
    event DexRouterApproved(address indexed router, bool approved);
    event SandboxUsdSet(address indexed oldUsd, address indexed newUsd);
    event SandboxRouterSet(address indexed oldRouter, address indexed newRouter);

    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event OwnerAdded(address indexed newOwner);
    event OwnerRemoved(address indexed removedOwner);

    event SeasonCreated(bytes32 indexed id, string name, uint64 start, uint64 end);
    event LeagueCreated(bytes32 indexed leagueId, bytes32 indexed seasonId, string name);

    event AgentCreated(uint256 indexed agentId, address indexed owner, bytes32 strategyRoot, uint256 depositUsd);
    event AgentDeposited(uint256 indexed agentId, address indexed from, uint256 amountUsd);
    event AgentWithdrawn(uint256 indexed agentId, address indexed to, uint256 amountUsd);
    event AgentOwnershipTransferred(uint256 indexed agentId, address indexed from, address indexed to);
    event LeagueJoined(uint256 indexed agentId, bytes32 indexed leagueId);
    event LeagueLeft(uint256 indexed agentId, bytes32 indexed leagueId);
    event TradeExecuted(
        uint256 indexed agentId,
        uint256 indexed tradeId,
        uint8 action,
        bytes32 asset,
        uint256 qty,
        uint256 priceUsd,
        bool success,
        bool simulated,
        bytes32 reasonHash
    );

    /* ── Modifiers ──────────────────────────────────────── */
    modifier onlyMarketOwner() {
        require(isOwner[msg.sender], "Not owner");
        _;
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "Not executor");
        _;
    }

    modifier onlyAgentOwner(uint256 agentId) {
        require(_agentMeta[agentId].exists, "Agent not found");
        require(_agentMeta[agentId].owner == msg.sender, "Not agent owner");
        _;
    }

    modifier nonReentrant() {
        require(_locked == 0, "Reentrant");
        _locked = 1;
        _;
        _locked = 0;
    }

    constructor(address _resolver) {
        require(_resolver != address(0), "Invalid resolver");
        isOwner[msg.sender] = true;
        ownerCount = 1;
        ownerList.push(msg.sender);
        resolver = _resolver;
    }

    /* ── Market deployment ──────────────────────────────── */

    function deployMarket(
        bytes32 _seasonId,
        address _agentCreator,
        string calldata _question,
        uint256 _bettingClose,
        uint256 _platformFeeBps,
        uint256 _creatorShareBps
    ) external onlyMarketOwner returns (address) {
        require(_agentCreator != address(0), "Invalid creator");
        require(_bettingClose > block.timestamp, "Close must be future");
        require(_platformFeeBps <= 1000, "Fee too high");
        require(_creatorShareBps <= 10000, "Share too high");

        IMSYMarket market =
            new IMSYMarket(resolver, _agentCreator, _question, _bettingClose, _platformFeeBps, _creatorShareBps);

        address addr = address(market);
        _seasonMarkets[_seasonId].push(addr);
        allMarkets.push(addr);
        isMarket[addr] = true;

        emit MarketDeployed(addr, _seasonId, _agentCreator, _question);
        return addr;
    }

    function getMarkets(bytes32 _seasonId) external view returns (address[] memory) {
        return _seasonMarkets[_seasonId];
    }

    function totalMarkets() external view returns (uint256) {
        return allMarkets.length;
    }

    /* ── Roles / config ─────────────────────────────────── */

    function setResolver(address _newResolver) external onlyMarketOwner {
        require(_newResolver != address(0), "Invalid resolver");
        emit ResolverUpdated(resolver, _newResolver);
        resolver = _newResolver;
    }

    function setExecutor(address _newExecutor) external onlyMarketOwner {
        require(_newExecutor != address(0), "Invalid executor");
        emit ExecutorUpdated(executor, _newExecutor);
        executor = _newExecutor;
    }

    function setSandboxUsd(address usd) external onlyMarketOwner {
        require(usd != address(0), "Invalid usd");
        emit SandboxUsdSet(sandboxUsd, usd);
        sandboxUsd = usd;
    }

    function setSandboxRouter(address router) external onlyMarketOwner {
        require(router != address(0), "Invalid router");
        emit SandboxRouterSet(sandboxRouter, router);
        sandboxRouter = router;
    }

    /// @dev Legacy hook retained so old tooling compiles; the new flow uses
    ///      `sandboxRouter` directly. Set it to keep this in sync with admin
    ///      tooling that filters by `approvedDexRouter`.
    function approveDexRouter(address router, bool approved) external onlyMarketOwner {
        require(router != address(0), "Invalid router");
        approvedDexRouter[router] = approved;
        emit DexRouterApproved(router, approved);
    }

    function addOwner(address _newOwner) external onlyMarketOwner {
        require(_newOwner != address(0), "Invalid address");
        require(!isOwner[_newOwner], "Already owner");
        isOwner[_newOwner] = true;
        ownerCount++;
        ownerList.push(_newOwner);
        emit OwnerAdded(_newOwner);
    }

    function removeOwner(address _owner) external onlyMarketOwner {
        require(isOwner[_owner], "Not an owner");
        require(ownerCount > 1, "Cannot remove last owner");
        isOwner[_owner] = false;
        ownerCount--;
        for (uint256 i = 0; i < ownerList.length; i++) {
            if (ownerList[i] == _owner) {
                ownerList[i] = ownerList[ownerList.length - 1];
                ownerList.pop();
                break;
            }
        }
        emit OwnerRemoved(_owner);
    }

    function transferOwnership(address _newOwner) external onlyMarketOwner {
        require(_newOwner != address(0), "Invalid owner");
        require(!isOwner[_newOwner], "Already owner");
        isOwner[msg.sender] = false;
        isOwner[_newOwner] = true;
        for (uint256 i = 0; i < ownerList.length; i++) {
            if (ownerList[i] == msg.sender) {
                ownerList[i] = _newOwner;
                break;
            }
        }
        emit OwnershipTransferred(msg.sender, _newOwner);
    }

    function getOwners() external view returns (address[] memory) {
        return ownerList;
    }

    /* ── Season / League ────────────────────────────────── */

    function createSeason(bytes32 id, string calldata name, uint64 start, uint64 end) external onlyMarketOwner {
        require(id != bytes32(0), "Invalid id");
        require(!_seasons[id].exists, "Season exists");
        require(end > start, "End <= start");
        require(bytes(name).length > 0, "Empty name");

        _seasons[id] = Season({
            id: id,
            name: name,
            start: start,
            end: end,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            exists: true
        });
        seasonIds.push(id);
        emit SeasonCreated(id, name, start, end);
    }

    function createLeague(bytes32 id, bytes32 seasonId, string calldata name) external onlyMarketOwner {
        require(id != bytes32(0), "Invalid id");
        require(!_leagues[id].exists, "League exists");
        require(_seasons[seasonId].exists, "Season not found");
        require(bytes(name).length > 0, "Empty name");

        _leagues[id] = League({
            id: id,
            seasonId: seasonId,
            name: name,
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            exists: true
        });
        leagueIds.push(id);
        _seasonLeagues[seasonId].push(id);
        emit LeagueCreated(id, seasonId, name);
    }

    function getSeason(bytes32 id) external view returns (Season memory) {
        return _seasons[id];
    }

    function getLeague(bytes32 id) external view returns (League memory) {
        return _leagues[id];
    }

    function getSeasons() external view returns (bytes32[] memory) {
        return seasonIds;
    }

    function getLeagues() external view returns (bytes32[] memory) {
        return leagueIds;
    }

    function getSeasonLeagues(bytes32 seasonId) external view returns (bytes32[] memory) {
        return _seasonLeagues[seasonId];
    }

    /* ── Agent custody (sUSD) ───────────────────────────── */

    function createAgent(
        string calldata name,
        bytes32 strategyRoot,
        bytes32[] calldata initialLeagues,
        uint256 depositUsd
    ) external returns (uint256 agentId) {
        require(sandboxUsd != address(0), "USD not set");
        require(depositUsd > 0, "Deposit required");
        require(bytes(name).length > 0, "Empty name");
        require(strategyRoot != bytes32(0), "Invalid strategy");

        // Pull sUSD from the caller into the factory's treasury bucket for this agent.
        require(
            IERC20Sandbox(sandboxUsd).transferFrom(msg.sender, address(this), depositUsd),
            "USD pull failed"
        );

        agentId = agentCount++;
        AgentMeta storage meta = _agentMeta[agentId];
        meta.owner = msg.sender;
        meta.name = name;
        meta.strategyRoot = strategyRoot;
        meta.exists = true;
        meta.cashUsd = depositUsd;
        meta.createdAt = uint64(block.timestamp);

        _ownerAgents[msg.sender].push(agentId);

        for (uint256 i = 0; i < initialLeagues.length; i++) {
            bytes32 lid = initialLeagues[i];
            require(_leagues[lid].exists, "League not found");
            _addLeague(agentId, lid);
        }

        emit AgentCreated(agentId, msg.sender, strategyRoot, depositUsd);
    }

    function deposit(uint256 agentId, uint256 amountUsd) external onlyAgentOwner(agentId) {
        require(sandboxUsd != address(0), "USD not set");
        require(amountUsd > 0, "Zero deposit");
        require(
            IERC20Sandbox(sandboxUsd).transferFrom(msg.sender, address(this), amountUsd),
            "USD pull failed"
        );
        _agentMeta[agentId].cashUsd += amountUsd;
        emit AgentDeposited(agentId, msg.sender, amountUsd);
    }

    function withdraw(uint256 agentId, uint256 amountUsd) external onlyAgentOwner(agentId) nonReentrant {
        require(sandboxUsd != address(0), "USD not set");
        require(amountUsd > 0, "Zero amount");
        AgentMeta storage meta = _agentMeta[agentId];
        require(meta.cashUsd >= amountUsd, "Insufficient cash");
        meta.cashUsd -= amountUsd;
        require(IERC20Sandbox(sandboxUsd).transfer(msg.sender, amountUsd), "USD send failed");
        emit AgentWithdrawn(agentId, msg.sender, amountUsd);
    }

    function transferAgentOwnership(uint256 agentId, address newOwner) external onlyAgentOwner(agentId) {
        require(newOwner != address(0), "Invalid owner");
        require(newOwner != msg.sender, "Same owner");
        address oldOwner = msg.sender;

        uint256[] storage oldList = _ownerAgents[oldOwner];
        for (uint256 i = 0; i < oldList.length; i++) {
            if (oldList[i] == agentId) {
                oldList[i] = oldList[oldList.length - 1];
                oldList.pop();
                break;
            }
        }

        _agentMeta[agentId].owner = newOwner;
        _ownerAgents[newOwner].push(agentId);
        emit AgentOwnershipTransferred(agentId, oldOwner, newOwner);
    }

    function joinLeague(uint256 agentId, bytes32 leagueId) external onlyAgentOwner(agentId) {
        require(_leagues[leagueId].exists, "League not found");
        _addLeague(agentId, leagueId);
    }

    function leaveLeague(uint256 agentId, bytes32 leagueId) external onlyAgentOwner(agentId) {
        _removeLeague(agentId, leagueId);
    }

    /* ── Trade execution (sUSD-quoted) ──────────────────── */

    function executeTrade(
        uint256 agentId,
        uint8 action,
        bytes32 asset,
        uint256 qty,
        uint256 priceUsd,
        bytes32 reasonHash
    ) external onlyExecutor nonReentrant returns (bool success) {
        require(_agentMeta[agentId].exists, "Agent not found");
        require(action <= 2, "Invalid action");
        require(sandboxRouter != address(0), "Router not set");
        require(sandboxUsd != address(0), "USD not set");

        AgentMeta storage meta = _agentMeta[agentId];
        bool simulated = false;

        if (action == 2) {
            success = true;
        } else {
            require(qty > 0 && priceUsd > 0 && asset != bytes32(0), "Bad inputs");
            success = _sandboxTrade(agentId, action, asset, qty, priceUsd);
        }

        uint256 tradeId = meta.tradeCount++;
        emit TradeExecuted(agentId, tradeId, action, asset, qty, priceUsd, success, simulated, reasonHash);
    }

    /**
     * @dev Routes the trade through the configured sandbox router using sUSD as
     *      the quote currency. Position quantities are bookkept against the
     *      actual token delta observed before/after the swap; cash deltas
     *      similarly use balance snapshots so router slippage cannot create
     *      free fills or phantom debits.
     */
    function _sandboxTrade(uint256 agentId, uint8 action, bytes32 asset, uint256 qty, uint256 priceUsd)
        internal
        returns (bool)
    {
        AgentMeta storage meta = _agentMeta[agentId];
        uint256 notionalUsd = (qty * priceUsd) / 1e18;

        address tk = ISandboxRouter(sandboxRouter).tokenOf(asset);
        require(tk != address(0), "Asset not on router");

        if (action == 0) {
            // BUY: factory holds sUSD; approve router; swapUsdForToken.
            require(meta.cashUsd >= notionalUsd, "Insufficient cash");
            IERC20Sandbox(sandboxUsd).approve(sandboxRouter, notionalUsd);
            uint256 balBefore = IERC20Sandbox(tk).balanceOf(address(this));
            try ISandboxRouter(sandboxRouter).swapUsdForToken(asset, notionalUsd, qty) returns (uint256) {
                uint256 balAfter = IERC20Sandbox(tk).balanceOf(address(this));
                if (balAfter <= balBefore) return false;
                uint256 actualOut = balAfter - balBefore;
                meta.cashUsd -= notionalUsd;
                Position storage pos = _agentPositions[agentId][asset];
                uint256 newQty = pos.qty + actualOut;
                pos.avgPriceUsd = ((pos.qty * pos.avgPriceUsd) + (actualOut * priceUsd)) / newQty;
                pos.qty = newQty;
                _addAsset(agentId, asset);
                return true;
            } catch {
                IERC20Sandbox(sandboxUsd).approve(sandboxRouter, 0);
                return false;
            }
        } else {
            // SELL: factory approves router for the agent's qty; swap → sUSD.
            Position storage pos = _agentPositions[agentId][asset];
            require(pos.qty >= qty, "Insufficient qty");
            IERC20Sandbox(tk).approve(sandboxRouter, qty);
            uint256 usdBefore = IERC20Sandbox(sandboxUsd).balanceOf(address(this));
            uint256 minUsdOut = (notionalUsd * 95) / 100;
            try ISandboxRouter(sandboxRouter).swapTokenForUsd(asset, qty, minUsdOut) returns (uint256) {
                uint256 usdAfter = IERC20Sandbox(sandboxUsd).balanceOf(address(this));
                if (usdAfter <= usdBefore) return false;
                uint256 actualUsd = usdAfter - usdBefore;
                pos.qty -= qty;
                meta.cashUsd += actualUsd;
                if (pos.qty == 0) {
                    pos.avgPriceUsd = 0;
                    _removeAsset(agentId, asset);
                }
                return true;
            } catch {
                IERC20Sandbox(tk).approve(sandboxRouter, 0);
                return false;
            }
        }
    }

    /* ── Internal helpers ───────────────────────────────── */

    function _addAsset(uint256 agentId, bytes32 asset) internal {
        if (_agentAssetIdx[agentId][asset] == 0) {
            _agentAssets[agentId].push(asset);
            _agentAssetIdx[agentId][asset] = _agentAssets[agentId].length;
        }
    }

    function _removeAsset(uint256 agentId, bytes32 asset) internal {
        uint256 idx1 = _agentAssetIdx[agentId][asset];
        if (idx1 == 0) return;
        uint256 idx = idx1 - 1;
        bytes32[] storage arr = _agentAssets[agentId];
        uint256 last = arr.length - 1;
        if (idx != last) {
            bytes32 lastAsset = arr[last];
            arr[idx] = lastAsset;
            _agentAssetIdx[agentId][lastAsset] = idx + 1;
        }
        arr.pop();
        _agentAssetIdx[agentId][asset] = 0;
    }

    function _addLeague(uint256 agentId, bytes32 leagueId) internal {
        if (_agentLeagueIdx[agentId][leagueId] == 0) {
            _agentLeagues[agentId].push(leagueId);
            _agentLeagueIdx[agentId][leagueId] = _agentLeagues[agentId].length;
            emit LeagueJoined(agentId, leagueId);
        }
    }

    function _removeLeague(uint256 agentId, bytes32 leagueId) internal {
        uint256 idx1 = _agentLeagueIdx[agentId][leagueId];
        require(idx1 > 0, "Not in league");
        uint256 idx = idx1 - 1;
        bytes32[] storage arr = _agentLeagues[agentId];
        uint256 last = arr.length - 1;
        if (idx != last) {
            bytes32 lastLeague = arr[last];
            arr[idx] = lastLeague;
            _agentLeagueIdx[agentId][lastLeague] = idx + 1;
        }
        arr.pop();
        _agentLeagueIdx[agentId][leagueId] = 0;
        emit LeagueLeft(agentId, leagueId);
    }

    /* ── Agent views ────────────────────────────────────── */

    function getAgent(uint256 agentId) external view returns (AgentMeta memory) {
        return _agentMeta[agentId];
    }

    function getAgentPosition(uint256 agentId, bytes32 asset)
        external
        view
        returns (uint256 qty, uint256 avgPriceUsd)
    {
        Position storage pos = _agentPositions[agentId][asset];
        return (pos.qty, pos.avgPriceUsd);
    }

    function getAgentLeagues(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentLeagues[agentId];
    }

    function getAgentAssets(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentAssets[agentId];
    }

    function getAgentsByOwner(address owner) external view returns (uint256[] memory) {
        return _ownerAgents[owner];
    }

    /* ── Treasury ───────────────────────────────────────── */

    function withdrawTreasury(address payable _to, uint256 _amount) external onlyMarketOwner nonReentrant {
        require(_to != address(0), "Invalid recipient");
        require(_amount <= treasuryWei, "Insufficient treasury");
        treasuryWei -= _amount;
        (bool success,) = _to.call{value: _amount}("");
        require(success, "Treasury withdrawal failed");
    }

    receive() external payable {
        // Only credit the treasury bucket when the inbound transfer is from a
        // factory-deployed market (platform fees from `IMSYMarket.resolve`).
        // Stray transfers land in the contract balance but do not inflate
        // `treasuryWei`. Sandbox swaps (USD ↔ token) move ERC20 balances and
        // never hit this path.
        if (isMarket[msg.sender]) {
            treasuryWei += msg.value;
        }
    }
}
