// Derives a deterministic secp256k1 key pair from a wallet signature.
//
// Prototype note: a browser wallet never exposes its private key, so PulseVault
// derives a *separate* encryption identity from a fixed message signature. The
// signature is deterministic (RFC 6979), so the same wallet always reproduces
// the same key pair without ever revealing the account's real private key.

import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "./crypto.js";

export const KEY_DERIVATION_MESSAGE =
  "PulseVault encryption key v1\n\n" +
  "Signing this message derives the key pair used to encrypt and decrypt your vault. " +
  "This is not a transaction and costs no gas.";

export async function deriveKeyPair(signer) {
  const signature = await signer.signMessage(KEY_DERIVATION_MESSAGE);
  const seed = new TextEncoder().encode(signature);

  let privateKey = sha256(seed);
  while (!secp256k1.utils.isValidPrivateKey(privateKey)) {
    privateKey = sha256(privateKey);
  }

  const publicKey = secp256k1.getPublicKey(privateKey, true);
  return {
    privateKey: "0x" + bytesToHex(privateKey),
    publicKey: "0x" + bytesToHex(publicKey),
  };
}
