// Seeds the local Hardhat chain with demo data by running the real end-to-end
// flow against the deployed contract using the same crypto the frontend uses.
//
//   node frontend/scripts/seed.mjs
//
// Requires: `npx hardhat node` running and the contract deployed to localhost.

import { ethers } from "ethers";
import { PULSEVAULT_ABI, STATUS } from "../src/lib/abi.js";
import { deriveKeyPair } from "../src/lib/keys.js";
import {
  generateFileKey,
  encryptFile,
  decryptFile,
  buildGuardianShares,
  rewrapShareForBeneficiary,
  recoverFileKey,
} from "../src/lib/crypto.js";

const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const ADDRESS = process.env.CONTRACT_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// Hardhat's public, well-known development mnemonic (never use on a real network).
const MNEMONIC = "test test test test test test test test test test test junk";
const INDEX = {
  owner: 0,
  guardian1: 1,
  guardian2: 2,
  guardian3: 3,
  beneficiary: 4,
  owner2: 5,
};

const toDataUri = (bytes) =>
  "data:application/octet-stream;base64," + Buffer.from(bytes).toString("base64");

const rule = (t) => console.log(`\n${"─".repeat(4)} ${t} ${"─".repeat(Math.max(0, 62 - t.length))}`);
const line = (k, v) => console.log(`  ${k.padEnd(22)} ${v}`);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const at = (i) => ethers.HDNodeWallet.fromPhrase(MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`).connect(provider);
  const wallets = Object.fromEntries(Object.entries(INDEX).map(([name, i]) => [name, at(i)]));

  const network = await provider.getNetwork();
  console.log("PulseVault — local seed");
  line("Contract", ADDRESS);
  line("Chain", network.chainId.toString());
  if (network.chainId !== 31337n) {
    throw new Error("This seed script expects a local Hardhat chain (chainId 31337).");
  }

  const contract = new ethers.Contract(ADDRESS, PULSEVAULT_ABI, wallets.owner);

  // ---- 1. Derive encryption keys and register public keys on-chain ----------
  rule("1 · Register encryption public keys");
  const pub = {};
  for (const name of ["owner", "owner2", "guardian1", "guardian2", "guardian3", "beneficiary"]) {
    const w = wallets[name];
    const kp = await deriveKeyPair(w);
    pub[name] = kp.publicKey;
    const existing = await contract.publicKeyOf(w.address);
    if (!existing || existing === "0x") {
      await (await contract.connect(w).registerPublicKey(kp.publicKey)).wait();
      line(name, `${w.address}  ✓ registered`);
    } else {
      line(name, `${w.address}  (already registered)`);
    }
  }

  const guardianAddrs = [wallets.guardian1.address, wallets.guardian2.address, wallets.guardian3.address];
  const guardianPubs = [pub.guardian1, pub.guardian2, pub.guardian3];

  // ---- 2. Vault A: run the full lifecycle through to release ---------------
  rule("2 · Vault A (owner #0) — full lifecycle to release");
  if (await vaultExists(contract, wallets.owner.address)) {
    line("status", "vault already exists — skipping creation");
  } else {
    const fileKeyA = generateFileKey();
    const plaintextA = new TextEncoder().encode(
      "PulseVault demo secret #A\n" +
        "Encrypted in the browser, split across guardians, released to the beneficiary.\n"
    );
    const blobA = await encryptFile(fileKeyA, plaintextA);
    const cidA = toDataUri(blobA);
    const sharesA = await buildGuardianShares(fileKeyA, guardianPubs, 2);

    await (
      await contract.connect(wallets.owner).createVault(
        wallets.beneficiary.address,
        guardianAddrs,
        2,
        60, // interval
        30, // grace
        cidA,
        sharesA
      )
    ).wait();
    line("created", `beneficiary ${wallets.beneficiary.address}, threshold 2 of 3`);

    // fast-forward past interval + grace so the vault enters Voting
    await provider.send("evm_increaseTime", [91]);
    await provider.send("evm_mine", []);
    line("status now", STATUS[Number(await contract.statusOf(wallets.owner.address))]);

    for (const gName of ["guardian1", "guardian2"]) {
      const g = wallets[gName];
      const wrapped = await contract.getGuardianShare(wallets.owner.address, g.address);
      const share = await rewrapShareForBeneficiary(wrapped, (await deriveKeyPair(g)).privateKey, pub.beneficiary);
      await (await contract.connect(g).castVote(wallets.owner.address, true, share)).wait();
      line(`${gName} voted`, "confirm");
    }

    line("status now", STATUS[Number(await contract.statusOf(wallets.owner.address))]);

    // Beneficiary recovers the file
    const released = await contract.getReleasedShares(wallets.owner.address);
    const recoveredKey = await recoverFileKey(released, (await deriveKeyPair(wallets.beneficiary)).privateKey);
    const decrypted = await decryptFile(recoveredKey, blobA);
    line("released shares", released.length);
    line("file key match", recoveredKey.every((b, i) => b === fileKeyA[i]) ? "✓ yes" : "✗ NO");
    rule("Recovered file contents");
    console.log(new TextDecoder().decode(decrypted).trimEnd().split("\n").map((l) => "  │ " + l).join("\n"));
  }

  // ---- 3. Vault B: leave active and interactive for the dApp ---------------
  rule("3 · Vault B (owner #5) — left Active for the dApp demo");
  if (await vaultExists(contract, wallets.owner2.address)) {
    line("status", "vault already exists — skipping creation");
  } else {
    const fileKeyB = generateFileKey();
    const plaintextB = new TextEncoder().encode(
      "Vault B file.\nVote as guardians (threshold 2) to release, then decrypt as the beneficiary.\n"
    );
    const blobB = await encryptFile(fileKeyB, plaintextB);
    const cidB = toDataUri(blobB);
    const sharesB = await buildGuardianShares(fileKeyB, guardianPubs, 2);

    await (
      await contract.connect(wallets.owner2).createVault(
        wallets.beneficiary.address,
        guardianAddrs,
        2,
        120,
        60,
        cidB,
        sharesB
      )
    ).wait();
    line("created", `beneficiary ${wallets.beneficiary.address}, threshold 2 of 3`);
    line("status", STATUS[Number(await contract.statusOf(wallets.owner2.address))]);
  }

  // ---- summary --------------------------------------------------------------
  rule("Summary — sign in with these accounts");
  for (const [name, w] of Object.entries(wallets)) {
    line(name, w.address);
  }
  console.log("\n  Open http://localhost:5173 and switch MetaMask accounts to explore.");
}

async function vaultExists(contract, owner) {
  try {
    await contract.getVault(owner);
    return true;
  } catch {
    return false;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nSeed failed:", err.shortMessage || err.message || err);
    process.exit(1);
  });
