// PulseVault crypto library.
//
//  * File contents are encrypted with AES-256-GCM using a random per-vault key.
//  * Key material is wrapped with ECIES over secp256k1 (ephemeral ECDH -> HKDF -> AES-GCM).
//  * The file key is split with Shamir Secret Sharing so that `threshold` guardians
//    are required to reconstruct it. Each share is wrapped to its guardian's key.
//
// Everything runs client-side. Plaintext and the assembled file key never leave
// the browser.

import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { split, combine } from "./shamir.js";

const ECIES_INFO = new TextEncoder().encode("pulsevault/ecies/v1");
const IV_LENGTH = 12;
const EPHEMERAL_PUBLIC_KEY_LENGTH = 33;

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("invalid hex string");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

export function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

async function aesGcmEncrypt(rawKey, iv, plaintext) {
  const key = await globalThis.crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return new Uint8Array(ciphertext);
}

async function aesGcmDecrypt(rawKey, iv, ciphertext) {
  const key = await globalThis.crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const plaintext = await globalThis.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Uint8Array(plaintext);
}

function deriveEciesKey(sharedPoint) {
  return hkdf(sha256, sharedPoint, undefined, ECIES_INFO, 32);
}

export function generateFileKey() {
  const key = new Uint8Array(32);
  globalThis.crypto.getRandomValues(key);
  return key;
}

export function generateKeyPair() {
  const privateKey = secp256k1.utils.randomPrivateKey();
  const publicKey = secp256k1.getPublicKey(privateKey, true);
  return { privateKey, publicKey };
}

// Encrypt arbitrary bytes to a recipient public key (compressed or uncompressed hex).
export async function eciesEncrypt(data, recipientPublicKeyHex) {
  const recipient = secp256k1.ProjectivePoint.fromHex(hexToBytes(recipientPublicKeyHex));
  const ephemeralPrivate = secp256k1.utils.randomPrivateKey();
  const ephemeralPublic = secp256k1.getPublicKey(ephemeralPrivate, true);
  const shared = secp256k1.getSharedSecret(ephemeralPrivate, recipient.toRawBytes(true));
  const key = deriveEciesKey(shared);
  const iv = new Uint8Array(IV_LENGTH);
  globalThis.crypto.getRandomValues(iv);
  const ciphertext = await aesGcmEncrypt(key, iv, data);
  return concatBytes(ephemeralPublic, iv, ciphertext);
}

export async function eciesDecrypt(blob, recipientPrivateKeyHex) {
  const bytes = blob instanceof Uint8Array ? blob : hexToBytes(blob);
  const ephemeralPublic = bytes.slice(0, EPHEMERAL_PUBLIC_KEY_LENGTH);
  const iv = bytes.slice(EPHEMERAL_PUBLIC_KEY_LENGTH, EPHEMERAL_PUBLIC_KEY_LENGTH + IV_LENGTH);
  const ciphertext = bytes.slice(EPHEMERAL_PUBLIC_KEY_LENGTH + IV_LENGTH);
  const privateKey = hexToBytes(recipientPrivateKeyHex);
  const shared = secp256k1.getSharedSecret(privateKey, ephemeralPublic);
  const key = deriveEciesKey(shared);
  return aesGcmDecrypt(key, iv, ciphertext);
}

// Encrypt a file. Returns a single blob: [iv (12)] || ciphertext.
export async function encryptFile(fileKey, plaintextBytes) {
  const iv = new Uint8Array(IV_LENGTH);
  globalThis.crypto.getRandomValues(iv);
  const ciphertext = await aesGcmEncrypt(fileKey, iv, plaintextBytes);
  return concatBytes(iv, ciphertext);
}

export async function decryptFile(fileKey, blob) {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  const iv = bytes.slice(0, IV_LENGTH);
  const ciphertext = bytes.slice(IV_LENGTH);
  return aesGcmDecrypt(fileKey, iv, ciphertext);
}

// Wrap each Shamir share to the matching guardian's public key.
export async function buildGuardianShares(fileKey, guardianPublicKeys, threshold) {
  const shares = split(fileKey, guardianPublicKeys.length, threshold);
  const wrapped = [];
  for (let i = 0; i < guardianPublicKeys.length; i++) {
    const blob = await eciesEncrypt(shares[i], guardianPublicKeys[i]);
    wrapped.push("0x" + bytesToHex(blob));
  }
  return wrapped;
}

// A guardian decrypts its own share, then re-wraps it to the beneficiary.
export async function rewrapShareForBeneficiary(wrappedShareHex, guardianPrivateKeyHex, beneficiaryPublicKeyHex) {
  const share = await eciesDecrypt(wrappedShareHex, guardianPrivateKeyHex);
  const blob = await eciesEncrypt(share, beneficiaryPublicKeyHex);
  return "0x" + bytesToHex(blob);
}

// Beneficiary unwraps `threshold` released shares and rebuilds the file key.
export async function recoverFileKey(releasedShareHexes, beneficiaryPrivateKeyHex) {
  const shares = [];
  for (const hex of releasedShareHexes) {
    shares.push(await eciesDecrypt(hex, beneficiaryPrivateKeyHex));
  }
  return combine(shares);
}
