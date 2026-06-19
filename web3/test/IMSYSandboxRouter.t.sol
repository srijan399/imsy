// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IMSYMarketFactory} from "../src/IMSYMarketFactory.sol";
import {IMSYMarket} from "../src/IMSYMarket.sol";
import {IMSYSandboxRouter} from "../src/IMSYSandboxRouter.sol";
import {SandboxToken} from "../src/SandboxToken.sol";

contract IMSYSandboxRouterTest is Test {
    IMSYMarketFactory factory;
    IMSYSandboxRouter router;
    SandboxToken sUSD;
    SandboxToken sBTC;
    SandboxToken sETH;

    address owner = makeAddr("owner");
    address resolver = makeAddr("resolver");
    address executor = makeAddr("executor");
    address alice = makeAddr("alice");

    bytes32 constant SEASON_ID = keccak256("season-1");
    bytes32 constant LEAGUE_ID = keccak256("league-high-risk");
    bytes32 constant ASSET_USD = bytes32("USD");
    bytes32 constant ASSET_BTC = bytes32("BTC");
    bytes32 constant ASSET_ETH = bytes32("ETH");

    /// 1 0G (1e18 wei native) → 1e10 USD scaled to 1e18 = 1e28 sUSD raw.
    uint256 constant USD_PER_NATIVE = 1e10 * 1e18;

    function setUp() public {
        vm.deal(owner, 1000 ether);
        vm.startPrank(owner);
        factory = new IMSYMarketFactory(resolver);
        factory.setExecutor(executor);
        factory.createSeason(SEASON_ID, "Demo S1", uint64(block.timestamp), uint64(block.timestamp + 14 days));
        factory.createLeague(LEAGUE_ID, SEASON_ID, "High Risk");

        router = new IMSYSandboxRouter(USD_PER_NATIVE);

        sUSD = new SandboxToken("Sandbox USD", "sUSD", address(router));
        sBTC = new SandboxToken("Sandbox BTC", "sBTC", address(router));
        sETH = new SandboxToken("Sandbox ETH", "sETH", address(router));

        router.setSandboxUsd(address(sUSD));
        router.registerToken(ASSET_USD, address(sUSD), 1e18); // peg
        router.registerToken(ASSET_BTC, address(sBTC), 60_000e18); // $60k
        router.registerToken(ASSET_ETH, address(sETH), 3_200e18);

        router.fund{value: 100 ether}();

        factory.setSandboxUsd(address(sUSD));
        factory.setSandboxRouter(address(router));
        factory.approveDexRouter(address(router), true);
        vm.stopPrank();

        vm.deal(alice, 50 ether);
    }

    function _buyUsd(address user, uint256 nativeAmt) internal returns (uint256 usdOut) {
        vm.prank(user);
        usdOut = router.swapNativeForUsd{value: nativeAmt}(0);
    }

    function _createAgentUsd(address creator, uint256 depositUsd) internal returns (uint256 id) {
        bytes32[] memory leagues = new bytes32[](1);
        leagues[0] = LEAGUE_ID;
        vm.prank(creator);
        sUSD.approve(address(factory), depositUsd);
        vm.prank(creator);
        id = factory.createAgent("Agent", keccak256("strategy-1"), leagues, depositUsd);
    }

    /* ─────────── router unit tests ─────────── */

    function test_RegisterToken_StoresUsdAndNativePrice() public view {
        assertEq(router.tokenOf(ASSET_BTC), address(sBTC));
        assertEq(router.usdPriceOf(ASSET_BTC), 60_000e18);
        // priceOf = usdPrice * 1e18 / usdPerNative
        assertEq(router.priceOf(ASSET_BTC), (60_000e18 * 1e18) / USD_PER_NATIVE);
    }

    function test_SetUsdPrice_UpdatesBoth() public {
        vm.prank(owner);
        router.setUsdPrice(ASSET_BTC, 70_000e18);
        assertEq(router.usdPriceOf(ASSET_BTC), 70_000e18);
        assertEq(router.priceOf(ASSET_BTC), (70_000e18 * 1e18) / USD_PER_NATIVE);
    }

    function test_RevertIf_RegisterToken_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        router.registerToken(bytes32("X"), address(sBTC), 1e18);
    }

    function test_SwapNativeForUsd_MintsAtPeg() public {
        // 0.001 0G in → expected USD = 0.001 * 1e10 = 1e7 USD = 1e7 * 1e18 raw.
        uint256 usdOut = _buyUsd(alice, 0.001 ether);
        assertEq(usdOut, 1e7 * 1e18);
        assertEq(sUSD.balanceOf(alice), 1e7 * 1e18);
    }

    function test_SwapUsdForNative_BurnsAtPeg() public {
        uint256 usdOut = _buyUsd(alice, 0.01 ether); // 1e8 USD
        vm.startPrank(alice);
        sUSD.approve(address(router), usdOut);
        uint256 nativeBefore = alice.balance;
        router.swapUsdForNative(usdOut, 0);
        vm.stopPrank();
        assertEq(alice.balance, nativeBefore + 0.01 ether);
        assertEq(sUSD.balanceOf(alice), 0);
    }

    function test_SwapUsdForToken_DirectByEoa() public {
        uint256 usdOut = _buyUsd(alice, 1 ether); // 1e10 USD raw
        vm.startPrank(alice);
        sUSD.approve(address(router), usdOut);
        // Buy BTC at $60k each => qty = usdIn / priceUsd = 1e10*1e18 / 60000e18 ≈ 166666...
        uint256 expected = (usdOut * 1e18) / 60_000e18;
        uint256 actual = router.swapUsdForToken(ASSET_BTC, usdOut, expected);
        vm.stopPrank();
        assertEq(actual, expected);
        assertEq(sBTC.balanceOf(alice), expected);
    }

    function test_RevertIf_SwapUsdForToken_USDsymbol() public {
        uint256 usdOut = _buyUsd(alice, 0.001 ether);
        vm.startPrank(alice);
        sUSD.approve(address(router), usdOut);
        vm.expectRevert("USD not tradable");
        router.swapUsdForToken(ASSET_USD, usdOut, 0);
        vm.stopPrank();
    }

    function test_RevertIf_SwapUsdForToken_Slippage() public {
        uint256 usdOut = _buyUsd(alice, 0.001 ether);
        vm.startPrank(alice);
        sUSD.approve(address(router), usdOut);
        vm.expectRevert("Slippage");
        router.swapUsdForToken(ASSET_BTC, usdOut, type(uint256).max);
        vm.stopPrank();
    }

    /* ─────────── factory ↔ sandbox router integration ─────────── */

    function test_CreateAgent_PullsSusd() public {
        uint256 deposit = _buyUsd(alice, 0.01 ether); // 1e8 USD raw
        uint256 id = _createAgentUsd(alice, deposit);

        IMSYMarketFactory.AgentMeta memory meta = factory.getAgent(id);
        assertEq(meta.cashUsd, deposit);
        assertEq(sUSD.balanceOf(address(factory)), deposit);
        assertEq(sUSD.balanceOf(alice), 0);
    }

    function test_DepositAndWithdraw_Usd() public {
        uint256 d1 = _buyUsd(alice, 0.01 ether);
        uint256 id = _createAgentUsd(alice, d1);

        uint256 d2 = _buyUsd(alice, 0.005 ether);
        vm.prank(alice);
        sUSD.approve(address(factory), d2);
        vm.prank(alice);
        factory.deposit(id, d2);
        assertEq(factory.getAgent(id).cashUsd, d1 + d2);

        uint256 before = sUSD.balanceOf(alice);
        vm.prank(alice);
        factory.withdraw(id, d2);
        assertEq(sUSD.balanceOf(alice), before + d2);
        assertEq(factory.getAgent(id).cashUsd, d1);
    }

    function test_RevertIf_Withdraw_NotOwner() public {
        uint256 deposit = _buyUsd(alice, 0.001 ether);
        uint256 id = _createAgentUsd(alice, deposit);
        vm.prank(makeAddr("bob"));
        vm.expectRevert("Not agent owner");
        factory.withdraw(id, 1);
    }

    function test_ExecuteTrade_BuyMintsTokensToFactoryAndDebitsCash() public {
        uint256 deposit = _buyUsd(alice, 1 ether); // 1e10 USD raw — plenty
        uint256 id = _createAgentUsd(alice, deposit);

        // qty = 0.001 BTC; priceUsd = 60_000 USD scaled to 1e18.
        uint256 qty = 1e15; // 0.001
        uint256 priceUsd = 60_000e18;
        uint256 notional = (qty * priceUsd) / 1e18; // 60 USD scaled = 60e18

        vm.prank(executor);
        bool ok = factory.executeTrade(id, 0, ASSET_BTC, qty, priceUsd, bytes32("r1"));
        assertTrue(ok);

        assertEq(factory.getAgent(id).cashUsd, deposit - notional);
        (uint256 posQty, uint256 avg) = factory.getAgentPosition(id, ASSET_BTC);
        assertEq(posQty, qty);
        assertEq(avg, priceUsd);
        assertEq(sBTC.balanceOf(address(factory)), qty);
    }

    function test_ExecuteTrade_SellRedeemsUsdFromFactory() public {
        uint256 deposit = _buyUsd(alice, 1 ether);
        uint256 id = _createAgentUsd(alice, deposit);

        vm.prank(executor);
        factory.executeTrade(id, 0, ASSET_BTC, 1e15, 60_000e18, bytes32("r1"));
        uint256 cashAfterBuy = factory.getAgent(id).cashUsd;

        vm.prank(executor);
        bool ok = factory.executeTrade(id, 1, ASSET_BTC, 5e14, 60_000e18, bytes32("r2"));
        assertTrue(ok);

        // Half sold at same price → cash regains 30 USD = 30e18.
        assertEq(factory.getAgent(id).cashUsd, cashAfterBuy + 30e18);
        (uint256 posQty,) = factory.getAgentPosition(id, ASSET_BTC);
        assertEq(posQty, 5e14);
    }

    function test_ExecuteTrade_HoldNoStateChange() public {
        uint256 deposit = _buyUsd(alice, 0.01 ether);
        uint256 id = _createAgentUsd(alice, deposit);

        vm.prank(executor);
        bool ok = factory.executeTrade(id, 2, bytes32(0), 0, 0, bytes32("hold"));
        assertTrue(ok);
        assertEq(factory.getAgent(id).cashUsd, deposit);
        assertEq(factory.getAgent(id).tradeCount, 1);
    }

    function test_RevertIf_Trade_NotExecutor() public {
        uint256 deposit = _buyUsd(alice, 0.001 ether);
        uint256 id = _createAgentUsd(alice, deposit);
        vm.prank(alice);
        vm.expectRevert("Not executor");
        factory.executeTrade(id, 0, ASSET_BTC, 1, 60_000e18, bytes32("r"));
    }

    function test_RevertIf_Trade_AssetNotOnRouter() public {
        uint256 deposit = _buyUsd(alice, 0.01 ether);
        uint256 id = _createAgentUsd(alice, deposit);
        vm.prank(executor);
        vm.expectRevert("Asset not on router");
        factory.executeTrade(id, 0, bytes32("XYZ"), 1, 60_000e18, bytes32("r"));
    }

    function test_RevertIf_Trade_InsufficientCash() public {
        // Buy 1e7 USD in cash. Try to buy 1 whole BTC at $60k = $60k notional > cash.
        uint256 deposit = _buyUsd(alice, 0.000001 ether); // 10_000 USD scaled to 1e18
        uint256 id = _createAgentUsd(alice, deposit);
        vm.prank(executor);
        vm.expectRevert("Insufficient cash");
        factory.executeTrade(id, 0, ASSET_BTC, 1e18, 60_000e18, bytes32("r"));
    }

    function test_ResolveMarket_StillCreditsNativeTreasury() public {
        // bets remain native; treasury accounting unchanged
        vm.deal(makeAddr("bob"), 5 ether);
        vm.deal(makeAddr("carol"), 5 ether);
        vm.prank(owner);
        address m = factory.deployMarket(SEASON_ID, alice, "Q?", block.timestamp + 1 days, 200, 2500);
        IMSYMarket market = IMSYMarket(payable(m));
        vm.prank(makeAddr("bob"));
        market.betYes{value: 1 ether}();
        vm.prank(makeAddr("carol"));
        market.betNo{value: 1 ether}();
        vm.prank(resolver);
        market.resolve(true);
        assertEq(factory.treasuryWei(), 0.03 ether);
    }
}
