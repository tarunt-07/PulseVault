const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log(`Deploying PulseVault to ${network}...`);
  console.log(`Deployer: ${deployer.address}`);

  const PulseVault = await hre.ethers.getContractFactory("PulseVault");
  const vault = await PulseVault.deploy();
  await vault.waitForDeployment();

  const address = await vault.getAddress();
  const deployTx = vault.deploymentTransaction();

  console.log(`PulseVault deployed to: ${address}`);
  if (deployTx) {
    console.log(`Transaction hash: ${deployTx.hash}`);
  }

  if (network !== "hardhat" && network !== "localhost" && process.env.ETHERSCAN_API_KEY) {
    console.log("Waiting for block confirmations before verification...");
    await deployTx.wait(5);
    try {
      await hre.run("verify:verify", { address, constructorArguments: [] });
      console.log("Contract verified on Etherscan.");
    } catch (error) {
      console.error(`Verification failed: ${error.message}`);
    }
  }

  console.log("\nAdd this to frontend/.env as VITE_CONTRACT_ADDRESS:");
  console.log(`VITE_CONTRACT_ADDRESS=${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
