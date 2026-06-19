// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IMSYMarketFactory} from "../src/IMSYMarketFactory.sol";
import {IMSYMarket} from "../src/IMSYMarket.sol";

/// @title IMSYMarketFactoryTest
/// @notice Covers owner / season / league / market / treasury flows.
///         Agent custody + sandbox trade flows live in IMSYSandboxRouter.t.sol
///         since they require the full router + sUSD scaffolding.
contract IMSYMarketFactoryTest is Test {
    IMSYMarketFactory factory;

    address owner = makeAddr("owner");
    address resolver = makeAddr("resolver");
    address executor = makeAddr("executor");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");

    bytes32 constant SEASON_ID = keccak256("season-1");
    bytes32 constant LEAGUE_ID = keccak256("league-high-risk");
    bytes32 constant LEAGUE_ID_B = keccak256("league-stable");

    function setUp() public {
        vm.prank(owner);
        factory = new IMSYMarketFactory(resolver);

        vm.startPrank(owner);
        factory.setExecutor(executor);
        factory.createSeason(SEASON_ID, "Demo S1", uint64(block.timestamp), uint64(block.timestamp + 14 days));
        factory.createLeague(LEAGUE_ID, SEASON_ID, "High Risk");
        factory.createLeague(LEAGUE_ID_B, SEASON_ID, "Stable Alpha");
        vm.stopPrank();

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
    }

    /* ─────────────────── owner / role ─────────────────── */

    function test_InitialOwner() public view {
        assertTrue(factory.isOwner(owner));
        assertEq(factory.ownerCount(), 1);
        assertEq(factory.resolver(), resolver);
        assertEq(factory.executor(), executor);
    }

    function test_RevertIf_ZeroResolver() public {
        vm.expectRevert("Invalid resolver");
        new IMSYMarketFactory(address(0));
    }

    function test_AddOwner() public {
        vm.prank(owner);
        factory.addOwner(alice);
        assertTrue(factory.isOwner(alice));
        assertEq(factory.ownerCount(), 2);
    }

    function test_RevertIf_AddOwner_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        factory.addOwner(bob);
    }

    function test_RemoveOwner() public {
        vm.startPrank(owner);
        factory.addOwner(alice);
        factory.removeOwner(alice);
        vm.stopPrank();
        assertFalse(factory.isOwner(alice));
    }

    function test_RevertIf_RemoveLastOwner() public {
        vm.prank(owner);
        vm.expectRevert("Cannot remove last owner");
        factory.removeOwner(owner);
    }

    function test_TransferOwnership() public {
        vm.prank(owner);
        factory.transferOwnership(alice);
        assertTrue(factory.isOwner(alice));
        assertFalse(factory.isOwner(owner));
        assertEq(factory.getOwners().length, 1);
    }

    function test_SetExecutor() public {
        vm.prank(owner);
        factory.setExecutor(alice);
        assertEq(factory.executor(), alice);
    }

    function test_RevertIf_SetExecutor_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        factory.setExecutor(bob);
    }

    function test_SetSandboxUsd() public {
        address usd = makeAddr("usd");
        vm.prank(owner);
        factory.setSandboxUsd(usd);
        assertEq(factory.sandboxUsd(), usd);
    }

    function test_RevertIf_SetSandboxUsd_Zero() public {
        vm.prank(owner);
        vm.expectRevert("Invalid usd");
        factory.setSandboxUsd(address(0));
    }

    function test_SetSandboxRouter() public {
        address r = makeAddr("router");
        vm.prank(owner);
        factory.setSandboxRouter(r);
        assertEq(factory.sandboxRouter(), r);
    }

    function test_ApproveDexRouter() public {
        vm.prank(owner);
        factory.approveDexRouter(alice, true);
        assertTrue(factory.approvedDexRouter(alice));
    }

    /* ─────────────────── seasons / leagues ─────────────────── */

    function test_CreateSeason() public view {
        IMSYMarketFactory.Season memory s = factory.getSeason(SEASON_ID);
        assertTrue(s.exists);
        assertEq(s.creator, owner);
    }

    function test_RevertIf_CreateSeason_NotOwner() public {
        vm.prank(alice);
        vm.expectRevert("Not owner");
        factory.createSeason(keccak256("x"), "x", 1, 2);
    }

    function test_RevertIf_CreateSeason_Duplicate() public {
        vm.prank(owner);
        vm.expectRevert("Season exists");
        factory.createSeason(SEASON_ID, "dup", 1, 2);
    }

    function test_RevertIf_CreateSeason_BadRange() public {
        vm.prank(owner);
        vm.expectRevert("End <= start");
        factory.createSeason(keccak256("y"), "y", 100, 50);
    }

    function test_CreateLeague() public view {
        IMSYMarketFactory.League memory l = factory.getLeague(LEAGUE_ID);
        assertTrue(l.exists);
        assertEq(l.seasonId, SEASON_ID);
        assertEq(factory.getSeasonLeagues(SEASON_ID).length, 2);
    }

    function test_RevertIf_CreateLeague_NoSeason() public {
        vm.prank(owner);
        vm.expectRevert("Season not found");
        factory.createLeague(keccak256("orphan"), keccak256("missing"), "x");
    }

    /* ─────────────────── markets (existing) ─────────────────── */

    function test_DeployMarket() public {
        vm.prank(owner);
        address m = factory.deployMarket(SEASON_ID, alice, "Q?", block.timestamp + 1 days, 200, 2500);
        assertTrue(m != address(0));
        assertEq(factory.totalMarkets(), 1);
        assertEq(factory.getMarkets(SEASON_ID).length, 1);
    }

    function test_ResolveMarket_TreasuryAccounting() public {
        vm.prank(owner);
        address m = factory.deployMarket(SEASON_ID, alice, "Q?", block.timestamp + 1 days, 200, 2500);
        IMSYMarket market = IMSYMarket(payable(m));

        vm.prank(bob);
        market.betYes{value: 1 ether}();
        vm.prank(carol);
        market.betNo{value: 1 ether}();

        vm.prank(resolver);
        market.resolve(true);

        // 2% fee of 2 ETH = 0.04 ETH; creator gets 25% = 0.01 to alice; treasury gets 0.03.
        assertEq(factory.treasuryWei(), 0.03 ether);
        assertEq(alice.balance, 10 ether + 0.01 ether);
    }

    function test_WithdrawTreasury() public {
        vm.prank(owner);
        address m = factory.deployMarket(SEASON_ID, alice, "Q?", block.timestamp + 1 days, 200, 2500);
        IMSYMarket market = IMSYMarket(payable(m));
        vm.prank(bob);
        market.betYes{value: 1 ether}();
        vm.prank(carol);
        market.betNo{value: 1 ether}();
        vm.prank(resolver);
        market.resolve(true);

        uint256 before = bob.balance;
        vm.prank(owner);
        factory.withdrawTreasury(payable(bob), 0.02 ether);
        assertEq(bob.balance, before + 0.02 ether);
        assertEq(factory.treasuryWei(), 0.01 ether);
    }
}
