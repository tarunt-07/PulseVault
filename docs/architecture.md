# PulseVault Architecture

PulseVault is a decentralized "dead man's switch" digital will. It combines an
on-chain state machine with client-side cryptography so that a vault stays
private while its owner is alive and only becomes recoverable by a chosen
beneficiary after a threshold of guardians confirm the owner's passing.

## High-level flow

```
Owner browser                 IPFS                PulseVault.sol              Guardians / Beneficiary
─────────────                 ────                ──────────────              ───────────────────────
encrypt file (AES-256-GCM) ─▶ ciphertext
split file key (Shamir k-of-n)
wrap each share (ECIES) ───────────────────────── createVault(...) ───────────▶ guardians indexed
checkIn() ───────────────────────────────────────▶ resets timer
                                                  timer expires ──────────────▶ status = Voting
                                                  castVote(true, share) ◀───── guardian decrypts +
                                                                               re-wraps share for beneficiary
                                                  threshold reached ──────────▶ released = true
                                                  getReleasedShares() ◀───────── beneficiary
beneficiary combines shares, decrypts file ◀────── cid + wrapped shares
```

## On-chain component — `contracts/PulseVault.sol`

The contract is a per-owner state machine. Each address owns at most one vault.

### States (`Status`)

| State | Meaning |
|:--|:--|
| `None` | No vault exists for the address |
| `Active` | Owner is checking in on schedule |
| `Grace` | Interval elapsed; a buffer before voting opens |
| `Voting` | Guardians may vote to confirm the owner's passing |
| `Released` | Threshold reached; shares are claimable by the beneficiary |

Transitions are derived from `lastCheckIn + interval` and `gracePeriod`, so no
transaction is needed to move `Active -> Grace -> Voting`. Any owner `checkIn()`
before release returns the vault to `Active`.

### Data

```solidity
struct Vault {
    address beneficiary;
    address[] guardians;
    uint8 threshold;
    uint64 interval;
    uint64 gracePeriod;
    string cid;                              // IPFS pointer to the encrypted file
    bytes[] encryptedGuardianShares;         // one ECIES-wrapped Shamir share per guardian
    uint64 lastCheckIn;
    uint64 round;                            // increments on check-in / rekey, scopes votes
    bool released;
}
```

### Public API

| Function | Caller | Purpose |
|:--|:--|:--|
| `registerPublicKey(bytes)` | Any account | Publish the encryption public key used to wrap shares |
| `createVault(...)` | Owner | Configure beneficiary, guardians, threshold, interval, grace period, CID and wrapped shares |
| `checkIn()` | Owner | Prove liveness; resets the timer and scopes a new voting round |
| `castVote(owner, confirm, share)` | Guardian | Confirm (with a re-wrapped share) or reject during `Voting` |
| `rekey(cid, shares)` | Owner | Rotate the file key/shares and reset the round |
| `getVault(owner)` | Anyone | Read full vault state |
| `getGuardianShare(owner, guardian)` | Anyone | Read a guardian's wrapped share (still encrypted) |
| `getReleasedShares(owner)` | Anyone | Read confirmed shares once released |
| `getVotes(owner)` | Anyone | Confirms, rejects and voter list for the current round |
| `statusOf(owner)` / `secondsUntilExpiry(owner)` | Anyone | Derived timing views |

## Off-chain component — `frontend/`

React + Vite single-page dApp with three roles (tabs): Owner, Guardian,
Beneficiary. All cryptography runs in the browser.

### Crypto library (`frontend/src/lib/`)

| Module | Responsibility |
|:--|:--|
| `shamir.js` | Split/combine the file key over GF(256), threshold `k` of `n` |
| `crypto.js` | AES-256-GCM file encryption, ECIES (secp256k1) key wrapping, share orchestration |
| `keys.js` | Deterministically derive a per-account encryption key pair from a wallet signature |
| `ipfs.js` | Upload/fetch encrypted blobs via Pinata, with a localStorage fallback |
| `contract.js` | ethers contract bindings and vault parsing |
| `abi.js` | Human-readable ABI and status constants |

### Scheme

1. The owner generates a random 256-bit **file key** and encrypts the file with
   **AES-256-GCM**.
2. The file key is split with **Shamir Secret Sharing** into `n` shares with
   threshold `k`.
3. Each share is **wrapped with ECIES** to the matching guardian's public key and
   stored on-chain (`encryptedGuardianShares`).
4. When voting to release, a guardian decrypts its share and re-wraps it to the
   **beneficiary's** public key, submitting it as `shareForBeneficiary`.
5. After release, the beneficiary unwraps `k` shares and reconstructs the file
   key, then decrypts the file fetched from IPFS.

## Key derivation note

A browser wallet never exposes its private key, so PulseVault derives a
*separate* ECIES identity from a fixed-message signature (RFC 6979 makes this
deterministic). This keeps end-to-end encryption working entirely client-side
while remaining reproducible for the same account.
