// SPDX-License-Identifier: MIT

pragma solidity ^0.8.30;

import {Script} from "../lib/forge-std/src/Script.sol";
import {IMSYMarketFactory} from "../src/IMSYMarketFactory.sol";

/// @notice Deploys the IMSY central trading + market factory contract on 0G Galileo.
///
/// Roles wired by this script:
///   * Multi-owner set: deployer, ADDRESS_AS, ADDRESS_PP. Owners gate season/league
///     creation, market deployment, executor + DEX router config, treasury withdrawals.
///   * Resolver: the deployer (msg.sender). Resolves child markets. Update with
///     `setResolver` post-deploy if the resolver wallet is separate from the deployer.
///   * Executor: EXECUTOR_ADDRESS. The only signer authorised to call `executeTrade`
///     on behalf of agents.
contract DeployIMSYMarketFactory is Script {
    address immutable AS = vm.envAddress("ADDRESS_AS");
    address immutable PP = vm.envAddress("ADDRESS_PP");
    address immutable EXECUTOR = vm.envAddress("EXECUTOR_ADDRESS");

    function run() external returns (IMSYMarketFactory) {
        vm.startBroadcast();
        IMSYMarketFactory factory = new IMSYMarketFactory(msg.sender);
        factory.setExecutor(EXECUTOR);
        factory.addOwner(AS);
        factory.addOwner(PP);
        vm.stopBroadcast();
        return factory;
    }
}
