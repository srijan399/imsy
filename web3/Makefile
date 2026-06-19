-include .env

.PHONY: test flatten-factory verify-factory-help

FLAT_FACTORY ?= IMSYMarketFactory_flat.sol

anvil:;	anvil

# Single-file factory + IMSYMarket for explorers / manual review (`forge flatten`).
flatten-factory:
	forge flatten src/IMSYMarketFactory.sol -o $(FLAT_FACTORY)

# Verification must match foundry.toml: optimizer ON (200 runs), via_ir ON, EVM cancun.
# See web3/README.md — README previously said optimization OFF; that causes bytecode_length_mismatch.
# Quick check from artifacts:
#   jq '.metadata | fromjson | .settings | {optimizer, viaIR, evmVersion}' out/IMSYMarketFactory.sol/IMSYMarketFactory.json

verify-factory-help:
	@echo "Match foundry.toml when verifying: solc 0.8.34, evm cancun, optimizer 200 runs, via-ir ON."
	@echo "See web3/README.md for forge verify-contract one-liner and Standard JSON export."

GALILEO_PRIORITY_WEI ?= 3000000000
GALILEO_MAX_FEE_WEI ?= 150000000000

deploy-galileo:
	forge script script/IMSYMarket.s.sol:DeployIMSYMarketFactory \
		--rpc-url $(RPC_URL_0G) \
		--private-key $(PRIVATE_KEY) \
		--priority-gas-price $(GALILEO_PRIORITY_WEI) \
		--with-gas-price $(GALILEO_MAX_FEE_WEI) \
		--verify --etherscan-api-key $(ETHERSCAN_API_KEY) \
		-vvvv --broadcast

# Deploy the sandbox swap venue (router + sBTC/sETH/sSOL) and approve it on the
# already-deployed factory. Requires IMSY_FACTORY_ADDRESS in .env.
deploy-sandbox-galileo:
	forge script script/IMSYSandbox.s.sol:DeployIMSYSandbox \
		--rpc-url $(RPC_URL_0G) \
		--private-key $(PRIVATE_KEY) \
		--priority-gas-price $(GALILEO_PRIORITY_WEI) \
		--with-gas-price $(GALILEO_MAX_FEE_WEI) \
		-vvvv --broadcast

test:
	forge test