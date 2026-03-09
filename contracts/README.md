# AgentPFP Smart Contract (Base)

## Setup

1. Install [Foundry](https://book.getfoundry.sh/getting-started/installation):
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. Install OpenZeppelin:
   ```bash
   cd contracts
   forge install OpenZeppelin/openzeppelin-contracts --no-commit
   ```

3. Build:
   ```bash
   forge build
   ```

## Deploy

```bash
# Base Sepolia (testnet)
forge create src/AgentPFP.sol:AgentPFP \
  --rpc-url https://sepolia.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args $TREASURY_ADDRESS $OWNER_ADDRESS

# Base mainnet
forge create src/AgentPFP.sol:AgentPFP \
  --rpc-url https://mainnet.base.org \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args $TREASURY_ADDRESS $OWNER_ADDRESS
```

## Post-deploy

1. Set the server as minter: `setMinter(serverWalletAddress)`
2. Set `AGENT_PFP_CONTRACT` and `MINTER_PRIVATE_KEY` in server `.env`
