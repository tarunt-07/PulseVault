# Deployment Guide

## 1. Install dependencies

```bash
# contracts
npm install

# frontend
cd frontend && npm install && cd ..
```

## 2. Configure environment

```bash
cp .env.example .env
```

| Variable | Where | Purpose |
|:--|:--|:--|
| `SEPOLIA_RPC_URL` | root `.env` | Sepolia JSON-RPC endpoint |
| `PRIVATE_KEY` | root `.env` | Testnet deployer key (never a mainnet key) |
| `ETHERSCAN_API_KEY` | root `.env` | Optional contract verification |
| `VITE_CONTRACT_ADDRESS` | `frontend/.env` | Address of the deployed contract |
| `VITE_PINATA_JWT` | `frontend/.env` | Optional Pinata JWT for real IPFS uploads |
| `VITE_IPFS_GATEWAY` | `frontend/.env` | Optional custom IPFS gateway |

## 3. Compile and test

```bash
npx hardhat compile
npx hardhat test
```

## 4. Deploy

Local (recommended for the demo):

```bash
# terminal A
npx hardhat node
# terminal B
npx hardhat run scripts/deploy.js --network localhost
```

Sepolia:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

The script prints the deployed address and, when `ETHERSCAN_API_KEY` is set,
verifies the contract.

## 5. Run the frontend

```bash
cd frontend
cp .env.example .env
# set VITE_CONTRACT_ADDRESS to the deployed address
npm run dev
```

Open http://localhost:5173 and connect a wallet on the matching network.

## Demo script

1. As the **owner**: register a key, pick a beneficiary, add guardians, choose a
   short interval, attach a file and create the vault.
2. As a **guardian**: load the owner's vault and confirm (each guardian account
   must also register a key first).
3. Wait out the interval + grace period, then have `k` guardians confirm.
4. As the **beneficiary**: load the vault and reconstruct the key to download
   the decrypted file.
