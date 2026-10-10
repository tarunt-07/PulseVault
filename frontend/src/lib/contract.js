import { ethers } from "ethers";
import { PULSEVAULT_ABI } from "./abi.js";

export const CONTRACT_ADDRESS = import.meta.env?.VITE_CONTRACT_ADDRESS || "";

export function requireAddress() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS is not set. Deploy the contract and add it to frontend/.env");
  }
  return CONTRACT_ADDRESS;
}

export function getContract(runner) {
  return new ethers.Contract(requireAddress(), PULSEVAULT_ABI, runner);
}

export function parseVault(result) {
  return {
    beneficiary: result.beneficiary,
    guardians: result.guardians,
    threshold: Number(result.threshold),
    interval: Number(result.interval),
    gracePeriod: Number(result.gracePeriod),
    cid: result.cid,
    encryptedGuardianShares: result.encryptedGuardianShares,
    lastCheckIn: Number(result.lastCheckIn),
    round: Number(result.round),
    released: result.released,
  };
}

export { ethers };
