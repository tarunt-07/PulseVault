# Security Model & Threat Notes

> PulseVault is an **unaudited academic prototype**. Do not use it for real funds
> or real secrets. Use testnets only.

## Goals

1. **Confidentiality while alive.** File contents and the assembled file key are
   never stored in plaintext — on-chain or on IPFS.
2. **No unilateral release.** A single guardian cannot trigger a release; a
   threshold `k` of `n` must confirm.
3. **Owner override.** Any `checkIn()` before release cancels an in-progress vote.
4. **Beneficiary-only recovery.** Released shares are wrapped to the
   beneficiary's public key, so only that key can reconstruct the file key.

## Cryptographic design

| Concern | Mechanism |
|:--|:--|
| File encryption | AES-256-GCM with a random per-vault key and random 96-bit IV |
| Key sharing | Shamir Secret Sharing over GF(256), threshold `k` of `n` |
| Key wrapping | ECIES: ephemeral secp256k1 ECDH → HKDF-SHA256 → AES-256-GCM |
| Share transport | Per-guardian wrapped shares stored on-chain (ciphertext only) |

### What the chain sees

- Encrypted file blob CID (ciphertext on IPFS)
- ECIES-wrapped guardian shares (`encryptedGuardianShares`)
- ECIES-wrapped released shares (`releasedShares`) after a vote passes
- Public keys and all governance metadata (guardians, threshold, timing)

The chain never sees the file key, any Shamir share in the clear, or file bytes.

## Trust assumptions

- **Guardians are honest and available.** If fewer than `k` guardians act, the
  vault cannot be released.
- **Beneficiary guards their key.** Anyone who obtains the beneficiary's derived
  private key can decrypt released shares.
- **Wallet signature stability.** The derived encryption key depends on the
  wallet signing a fixed message deterministically.
- **IPFS availability.** Pinning matters; lost ciphertext cannot be recovered.

## Known limitations

- No `claim()` access-control check on reads: `getReleasedShares` is public, but
  the values are ECIES-wrapped to the beneficiary, so third parties cannot use
  them.
- The on-chain share transport costs gas proportional to guardian count.
- Key derivation is not the wallet's real Ethereum key; it is a purpose-built
  encryption identity.
- The contract has not been audited and has no upgrade path.

## Reporting

This is coursework. Open an issue in the repository for anything you find.
