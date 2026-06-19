// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "../lib/forge-std/src/Script.sol";
import {IMSYMarketFactory} from "../src/IMSYMarketFactory.sol";
import {IMSYSandboxRouter} from "../src/IMSYSandboxRouter.sol";
import {SandboxToken} from "../src/SandboxToken.sol";

/// @notice Deploys the sandbox trading venue (router + sUSD + 12 trading
///         tokens) and wires it into an existing IMSYMarketFactory deployment.
///
/// Required env:
///   IMSY_FACTORY_ADDRESS  — already-deployed factory the deployer owns
///   SANDBOX_FUND_WEI      — native amount to seed the router with for sells
///                           (default 1 ether)
contract DeployIMSYSandbox is Script {
    /// 1 0G = 1e10 USD, scaled to 1e18 → 1e28 raw units of usdPerNative.
    uint256 constant USD_PER_NATIVE = 1e10 * 1e18;

    struct TokenSpec {
        bytes32 symbol;
        string name;
        string short;
        uint256 priceUsd; // scaled 1e18
    }

    function run()
        external
        returns (IMSYSandboxRouter router, SandboxToken sUSD)
    {
        address factoryAddr = vm.envAddress("IMSY_FACTORY_ADDRESS");
        uint256 fundWei = _envOrDefault("SANDBOX_FUND_WEI", 1 ether);

        IMSYMarketFactory factory = IMSYMarketFactory(payable(factoryAddr));

        vm.startBroadcast();

        router = new IMSYSandboxRouter(USD_PER_NATIVE);

        sUSD = new SandboxToken("Sandbox USD", "sUSD", address(router));
        router.setSandboxUsd(address(sUSD));
        router.registerToken(bytes32("USD"), address(sUSD), 1e18);

        TokenSpec[12] memory tokens = [
            TokenSpec(bytes32("BTC"),  "Sandbox BTC",  "sBTC",  60_000e18),
            TokenSpec(bytes32("ETH"),  "Sandbox ETH",  "sETH",   3_200e18),
            TokenSpec(bytes32("SOL"),  "Sandbox SOL",  "sSOL",     170e18),
            TokenSpec(bytes32("USDC"), "Sandbox USDC", "sUSDC",      1e18),
            TokenSpec(bytes32("DOGE"), "Sandbox DOGE", "sDOGE",  15e16),       // 0.15
            TokenSpec(bytes32("PEPE"), "Sandbox PEPE", "sPEPE",  12e12),       // 0.000012
            TokenSpec(bytes32("BONK"), "Sandbox BONK", "sBONK",  23e12),       // 0.000023
            TokenSpec(bytes32("WIF"),  "Sandbox WIF",  "sWIF",  12e17),        // 1.2
            TokenSpec(bytes32("MOON"), "Sandbox MOON", "sMOON",  5e17),        // 0.5
            TokenSpec(bytes32("JEFE"), "Sandbox JEFE", "sJEFE",  1e15),        // 0.001
            TokenSpec(bytes32("SCAM"), "Sandbox SCAM", "sSCAM",  4e16),        // 0.04
            TokenSpec(bytes32("RUG"),  "Sandbox RUG",  "sRUG",   7e16)         // 0.07
        ];

        for (uint256 i = 0; i < tokens.length; i++) {
            SandboxToken tk = new SandboxToken(tokens[i].name, tokens[i].short, address(router));
            router.registerToken(tokens[i].symbol, address(tk), tokens[i].priceUsd);
            console.log("Token", tokens[i].short, address(tk));
        }

        if (fundWei > 0) {
            router.fund{value: fundWei}();
        }

        factory.setSandboxUsd(address(sUSD));
        factory.setSandboxRouter(address(router));
        factory.approveDexRouter(address(router), true);

        vm.stopPrank();
        vm.stopBroadcast();

        console.log("Router:", address(router));
        console.log("sUSD:", address(sUSD));
        console.log("usdPerNative:", USD_PER_NATIVE);
        console.log("Funded (wei):", fundWei);
    }

    function _envOrDefault(string memory key, uint256 fallbackValue) internal view returns (uint256) {
        try vm.envUint(key) returns (uint256 v) {
            return v;
        } catch {
            return fallbackValue;
        }
    }
}
