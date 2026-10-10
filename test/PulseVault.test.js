const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const Status = { None: 0, Active: 1, Grace: 2, Voting: 3, Released: 4 };
const HOUR = 3600;

const enc = (seed) => ethers.hexlify(ethers.toUtf8Bytes(seed));

describe("PulseVault", function () {
  let owner, guardian1, guardian2, guardian3, beneficiary, stranger;
  let vault;

  const beneficiaryAddr = () => beneficiary.address;
  const guardians = () => [guardian1.address, guardian2.address, guardian3.address];

  async function createDefaultVault(overrides = {}) {
    const cfg = {
      beneficiary: beneficiaryAddr(),
      guardians: guardians(),
      threshold: 2,
      interval: HOUR,
      gracePeriod: HOUR,
      cid: "ipfs://bafy-default",
      shares: [enc("share-1"), enc("share-2"), enc("share-3")],
      ...overrides,
    };
    return vault
      .connect(owner)
      .createVault(
        cfg.beneficiary,
        cfg.guardians,
        cfg.threshold,
        cfg.interval,
        cfg.gracePeriod,
        cfg.cid,
        cfg.shares
      );
  }

  beforeEach(async function () {
    [owner, guardian1, guardian2, guardian3, beneficiary, stranger] = await ethers.getSigners();
    const PulseVault = await ethers.getContractFactory("PulseVault");
    vault = await PulseVault.deploy();
    await vault.waitForDeployment();
  });

  describe("registerPublicKey", function () {
    it("stores a public key and emits an event", async function () {
      const pub = enc("pubkey-owner");
      await expect(vault.connect(owner).registerPublicKey(pub))
        .to.emit(vault, "PublicKeyRegistered")
        .withArgs(owner.address, pub);
      expect(await vault.publicKeyOf(owner.address)).to.equal(pub);
    });

    it("reverts on an empty key", async function () {
      await expect(vault.connect(owner).registerPublicKey("0x")).to.be.revertedWithCustomError(
        vault,
        "InvalidGuardians"
      );
    });
  });

  describe("createVault", function () {
    it("creates a vault, stores data and indexes participants", async function () {
      await expect(createDefaultVault())
        .to.emit(vault, "VaultCreated")
        .withArgs(
          owner.address,
          beneficiaryAddr(),
          guardians(),
          2,
          HOUR,
          HOUR,
          "ipfs://bafy-default"
        );

      const v = await vault.getVault(owner.address);
      expect(v.beneficiary).to.equal(beneficiaryAddr());
      expect(v.guardians).to.deep.equal(guardians());
      expect(v.threshold).to.equal(2);
      expect(v.interval).to.equal(HOUR);
      expect(v.gracePeriod).to.equal(HOUR);
      expect(v.cid).to.equal("ipfs://bafy-default");
      expect(v.round).to.equal(1);
      expect(v.released).to.equal(false);
      expect(v.lastCheckIn).to.be.gt(0);

      expect(await vault.vaultsAsGuardian(guardian1.address, 0)).to.equal(owner.address);
      expect(await vault.vaultsAsBeneficiary(beneficiaryAddr(), 0)).to.equal(owner.address);
    });

    it("reverts when the owner already has a vault", async function () {
      await createDefaultVault();
      await expect(createDefaultVault()).to.be.revertedWithCustomError(vault, "VaultAlreadyExists");
    });

    it("reverts with fewer than 2 guardians", async function () {
      await expect(
        createDefaultVault({
          guardians: [guardian1.address],
          shares: [enc("only")],
          threshold: 2,
        })
      ).to.be.revertedWithCustomError(vault, "InvalidGuardians");
    });

    it("reverts with more than 10 guardians", async function () {
      const many = Array.from({ length: 11 }, () => ethers.Wallet.createRandom().address);
      await expect(
        createDefaultVault({ guardians: many, shares: many.map((_, i) => enc("s" + i)) })
      ).to.be.revertedWithCustomError(vault, "InvalidGuardians");
    });

    it("reverts for an invalid beneficiary", async function () {
      await expect(
        createDefaultVault({ beneficiary: owner.address })
      ).to.be.revertedWithCustomError(vault, "InvalidBeneficiary");
      await expect(
        createDefaultVault({ beneficiary: ethers.ZeroAddress })
      ).to.be.revertedWithCustomError(vault, "InvalidBeneficiary");
    });

    it("reverts for an invalid threshold", async function () {
      await expect(createDefaultVault({ threshold: 1 })).to.be.revertedWithCustomError(
        vault,
        "InvalidThreshold"
      );
      await expect(createDefaultVault({ threshold: 4 })).to.be.revertedWithCustomError(
        vault,
        "InvalidThreshold"
      );
    });

    it("reverts for an interval below the minimum", async function () {
      await expect(createDefaultVault({ interval: 59 })).to.be.revertedWithCustomError(
        vault,
        "InvalidInterval"
      );
    });

    it("reverts when shares length mismatches guardians", async function () {
      await expect(
        createDefaultVault({ shares: [enc("a"), enc("b")] })
      ).to.be.revertedWithCustomError(vault, "InvalidSharesLength");
    });

    it("reverts on duplicate, zero or self guardians", async function () {
      await expect(
        createDefaultVault({
          guardians: [guardian1.address, guardian1.address, guardian2.address],
        })
      ).to.be.revertedWithCustomError(vault, "InvalidGuardians");

      await expect(
        createDefaultVault({
          guardians: [guardian1.address, ethers.ZeroAddress, guardian2.address],
        })
      ).to.be.revertedWithCustomError(vault, "InvalidGuardians");

      await expect(
        createDefaultVault({
          guardians: [guardian1.address, owner.address, guardian2.address],
        })
      ).to.be.revertedWithCustomError(vault, "InvalidGuardians");
    });
  });

  describe("checkIn", function () {
    it("resets the timer and increments the round", async function () {
      await createDefaultVault();
      const before = await vault.getVault(owner.address);
      await time.increase(HOUR + 10);
      await expect(vault.connect(owner).checkIn()).to.emit(vault, "CheckedIn").withArgs(owner.address, 2);
      const after = await vault.getVault(owner.address);
      expect(after.round).to.equal(2);
      expect(after.lastCheckIn).to.be.gt(before.lastCheckIn);
      expect(await vault.statusOf(owner.address)).to.equal(Status.Active);
    });

    it("reverts when the caller has no vault", async function () {
      await expect(vault.connect(stranger).checkIn()).to.be.revertedWithCustomError(
        vault,
        "VaultNotFound"
      );
    });
  });

  describe("lifecycle / statusOf", function () {
    it("moves Active -> Grace -> Voting -> Released", async function () {
      await createDefaultVault();
      expect(await vault.statusOf(owner.address)).to.equal(Status.Active);

      await time.increase(HOUR + 1);
      expect(await vault.statusOf(owner.address)).to.equal(Status.Grace);

      await time.increase(HOUR + 1);
      expect(await vault.statusOf(owner.address)).to.equal(Status.Voting);

      await vault.connect(guardian1).castVote(owner.address, true, enc("release-1"));
      await vault.connect(guardian2).castVote(owner.address, true, enc("release-2"));
      expect(await vault.statusOf(owner.address)).to.equal(Status.Released);
    });

    it("returns None for unknown owners", async function () {
      expect(await vault.statusOf(stranger.address)).to.equal(Status.None);
    });

    it("reports seconds until expiry", async function () {
      await createDefaultVault();
      const remaining = await vault.secondsUntilExpiry(owner.address);
      expect(remaining).to.be.gt(0).and.to.be.lte(HOUR);
      await time.increase(HOUR + 1);
      expect(await vault.secondsUntilExpiry(owner.address)).to.equal(0);
    });

    it("lets the owner cancel an active vote by checking in", async function () {
      await createDefaultVault();
      await time.increase(2 * HOUR + 1);
      expect(await vault.statusOf(owner.address)).to.equal(Status.Voting);

      await vault.connect(guardian1).castVote(owner.address, false, "0x");
      await vault.connect(owner).checkIn();
      expect(await vault.statusOf(owner.address)).to.equal(Status.Active);
    });
  });

  describe("castVote", function () {
    beforeEach(async function () {
      await createDefaultVault();
      await time.increase(2 * HOUR + 1);
      expect(await vault.statusOf(owner.address)).to.equal(Status.Voting);
    });

    it("reverts outside the voting window", async function () {
      await vault
        .connect(stranger)
        .createVault(
          beneficiaryAddr(),
          [guardian1.address, guardian2.address],
          2,
          HOUR,
          HOUR,
          "ipfs://fresh",
          [enc("s1"), enc("s2")]
        );
      await expect(
        vault.connect(guardian1).castVote(stranger.address, true, enc("x"))
      ).to.be.revertedWithCustomError(vault, "NotInVoting");
    });

    it("reverts for a non-guardian", async function () {
      await expect(
        vault.connect(stranger).castVote(owner.address, true, enc("x"))
      ).to.be.revertedWithCustomError(vault, "NotGuardian");
    });

    it("reverts on a duplicate vote", async function () {
      await vault.connect(guardian1).castVote(owner.address, true, enc("x"));
      await expect(
        vault.connect(guardian1).castVote(owner.address, true, enc("y"))
      ).to.be.revertedWithCustomError(vault, "AlreadyVoted");
    });

    it("reverts on confirm with an empty share", async function () {
      await expect(
        vault.connect(guardian1).castVote(owner.address, true, "0x")
      ).to.be.revertedWithCustomError(vault, "EmptyShareForConfirm");
    });

    it("releases once the confirm threshold is met", async function () {
      await expect(vault.connect(guardian1).castVote(owner.address, true, enc("r1")))
        .to.emit(vault, "VoteCast")
        .withArgs(owner.address, guardian1.address, true, 1);

      await expect(vault.connect(guardian2).castVote(owner.address, true, enc("r2")))
        .to.emit(vault, "VaultReleased")
        .withArgs(owner.address, beneficiaryAddr());

      const v = await vault.getVault(owner.address);
      expect(v.released).to.equal(true);

      const released = await vault.getReleasedShares(owner.address);
      expect(released.length).to.equal(2);
    });

    it("tracks confirms, rejects and voters", async function () {
      await vault.connect(guardian1).castVote(owner.address, false, "0x");
      await vault.connect(guardian2).castVote(owner.address, true, enc("r2"));
      const votes = await vault.getVotes(owner.address);
      expect(votes.confirms).to.equal(1);
      expect(votes.rejects).to.equal(1);
      expect(Array.from(votes.voters)).to.have.members([guardian1.address, guardian2.address]);
    });

    it("reverts voting after release", async function () {
      await vault.connect(guardian1).castVote(owner.address, true, enc("r1"));
      await vault.connect(guardian2).castVote(owner.address, true, enc("r2"));
      await expect(
        vault.connect(guardian3).castVote(owner.address, true, enc("r3"))
      ).to.be.revertedWithCustomError(vault, "AlreadyReleased");
    });
  });

  describe("guardian share access", function () {
    it("returns only the caller-relevant share mapping", async function () {
      await createDefaultVault();
      expect(await vault.getGuardianShare(owner.address, guardian2.address)).to.equal(enc("share-2"));
    });

    it("reverts for a non-guardian", async function () {
      await createDefaultVault();
      await expect(
        vault.getGuardianShare(owner.address, stranger.address)
      ).to.be.revertedWithCustomError(vault, "NotGuardian");
    });
  });

  describe("rekey", function () {
    it("updates the cid and shares and resets votes", async function () {
      await createDefaultVault();
      const newShares = [enc("n1"), enc("n2"), enc("n3")];
      await expect(vault.connect(owner).rekey("ipfs://bafy-new", newShares))
        .to.emit(vault, "Rekeyed")
        .withArgs(owner.address, "ipfs://bafy-new", 2);

      const v = await vault.getVault(owner.address);
      expect(v.cid).to.equal("ipfs://bafy-new");
      expect(v.round).to.equal(2);
      expect(await vault.getGuardianShare(owner.address, guardian1.address)).to.equal(enc("n1"));
    });

    it("reverts on a share-length mismatch", async function () {
      await createDefaultVault();
      await expect(
        vault.connect(owner).rekey("ipfs://x", [enc("only-one")])
      ).to.be.revertedWithCustomError(vault, "InvalidSharesLength");
    });

    it("reverts for a non-owner", async function () {
      await expect(
        vault.connect(stranger).rekey("ipfs://x", [enc("a"), enc("b"), enc("c")])
      ).to.be.revertedWithCustomError(vault, "VaultNotFound");
    });
  });

  describe("released share access", function () {
    it("reverts before release", async function () {
      await createDefaultVault();
      await expect(vault.getReleasedShares(owner.address)).to.be.revertedWithCustomError(
        vault,
        "NotReleased"
      );
    });
  });
});
