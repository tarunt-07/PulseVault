import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPair,
  generateFileKey,
  eciesEncrypt,
  eciesDecrypt,
  encryptFile,
  decryptFile,
  buildGuardianShares,
  rewrapShareForBeneficiary,
  recoverFileKey,
  bytesToHex,
} from "./crypto.js";
import { split, combine } from "./shamir.js";

const hx = (bytes) => "0x" + bytesToHex(bytes);

test("shamir splits and recombines with exactly the threshold", () => {
  const secret = generateFileKey();
  const shares = split(secret, 5, 3);
  const recovered = combine([shares[0], shares[2], shares[4]]);
  assert.deepEqual(Array.from(recovered), Array.from(secret));
});

test("shamir shares below the threshold do not reveal the secret", () => {
  const secret = generateFileKey();
  const shares = split(secret, 5, 3);
  const recovered = combine([shares[1], shares[3]]);
  assert.notDeepEqual(Array.from(recovered), Array.from(secret));
});

test("ecies round trip for arbitrary bytes", async () => {
  const { publicKey, privateKey } = generateKeyPair();
  const message = new TextEncoder().encode("a very private secret");
  const blob = await eciesEncrypt(message, hx(publicKey));
  const out = await eciesDecrypt(blob, hx(privateKey));
  assert.equal(new TextDecoder().decode(out), "a very private secret");
});

test("end-to-end vault: encrypt, share, rewrap, recover, decrypt", async () => {
  const guardians = [generateKeyPair(), generateKeyPair(), generateKeyPair()];
  const beneficiary = generateKeyPair();
  const fileKey = generateFileKey();

  const wrapped = await buildGuardianShares(fileKey, guardians.map((g) => hx(g.publicKey)), 2);
  assert.equal(wrapped.length, 3);

  const fromGuardian0 = await rewrapShareForBeneficiary(wrapped[0], hx(guardians[0].privateKey), hx(beneficiary.publicKey));
  const fromGuardian2 = await rewrapShareForBeneficiary(wrapped[2], hx(guardians[2].privateKey), hx(beneficiary.publicKey));

  const recovered = await recoverFileKey([fromGuardian0, fromGuardian2], hx(beneficiary.privateKey));
  assert.deepEqual(Array.from(recovered), Array.from(fileKey));

  const plaintext = new TextEncoder().encode("IRREPLACEABLE DATA");
  const blob = await encryptFile(fileKey, plaintext);
  const decrypted = await decryptFile(recovered, blob);
  assert.equal(new TextDecoder().decode(decrypted), "IRREPLACEABLE DATA");
});

test("a non-guardian key cannot decrypt a guardian share", async () => {
  const guardian = generateKeyPair();
  const attacker = generateKeyPair();
  const fileKey = generateFileKey();
  const wrapped = await buildGuardianShares(fileKey, [hx(guardian.publicKey), hx(guardian.publicKey)], 2);
  await assert.rejects(() => eciesDecrypt(wrapped[0], hx(attacker.privateKey)));
});
