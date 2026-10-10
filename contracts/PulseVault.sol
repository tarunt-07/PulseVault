// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console} from "hardhat/console.sol";

contract PulseVault {
    enum Status { None, Active, Grace, Voting, Released }

    struct Vault {
        address beneficiary;
        address[] guardians;
        uint8 threshold;
        uint64 interval;
        uint64 gracePeriod;
        string cid;
        bytes[] encryptedGuardianShares;
        uint64 lastCheckIn;
        uint64 round;
        bool released;
    }

    mapping(address => Vault) private vaults;
    mapping(address => bytes) public publicKeyOf;
    mapping(address => address[]) public vaultsAsGuardian;
    mapping(address => address[]) public vaultsAsBeneficiary;

    event PublicKeyRegistered(address indexed account, bytes pubKey);
    event VaultCreated(
        address indexed owner,
        address indexed beneficiary,
        address[] guardians,
        uint8 threshold,
        uint64 interval,
        uint64 gracePeriod,
        string cid
    );
    event CheckedIn(address indexed owner, uint64 round);
    event VoteCast(address indexed owner, address indexed guardian, bool confirm, uint64 round);
    event VaultReleased(address indexed owner, address indexed beneficiary);
    event Rekeyed(address indexed owner, string cid, uint64 round);

    error VaultAlreadyExists();
    error VaultNotFound();
    error AlreadyReleased();
    error NotOwner();
    error NotGuardian();
    error NotBeneficiary();
    error InvalidGuardians();
    error InvalidThreshold();
    error InvalidInterval();
    error InvalidBeneficiary();
    error InvalidSharesLength();
    error NotInVoting();
    error AlreadyVoted();
    error EmptyShareForConfirm();
    error NotReleased();

    function registerPublicKey(bytes calldata pubKey) external {
        if (pubKey.length == 0) revert InvalidGuardians();
        publicKeyOf[msg.sender] = pubKey;
        emit PublicKeyRegistered(msg.sender, pubKey);
    }

    function createVault(
        address beneficiary,
        address[] calldata guardians,
        uint8 threshold,
        uint64 interval,
        uint64 gracePeriod,
        string calldata cid,
        bytes[] calldata encryptedGuardianShares
    ) external {
        if (vaults[msg.sender].beneficiary != address(0)) revert VaultAlreadyExists();
        if (guardians.length < 2 || guardians.length > 10) revert InvalidGuardians();
        if (beneficiary == address(0) || beneficiary == msg.sender) revert InvalidBeneficiary();
        if (threshold < 2 || threshold > guardians.length) revert InvalidThreshold();
        if (interval < 60) revert InvalidInterval();
        if (encryptedGuardianShares.length != guardians.length) revert InvalidSharesLength();

        for (uint i = 0; i < guardians.length; i++) {
            if (guardians[i] == address(0)) revert InvalidGuardians();
            if (guardians[i] == msg.sender) revert InvalidGuardians();
            for (uint j = i + 1; j < guardians.length; j++) {
                if (guardians[i] == guardians[j]) revert InvalidGuardians();
            }
        }

        vaults[msg.sender] = Vault({
            beneficiary: beneficiary,
            guardians: guardians,
            threshold: threshold,
            interval: interval,
            gracePeriod: gracePeriod,
            cid: cid,
            encryptedGuardianShares: encryptedGuardianShares,
            lastCheckIn: uint64(block.timestamp),
            round: 1,
            released: false
        });

        for (uint i = 0; i < guardians.length; i++) {
            vaultsAsGuardian[guardians[i]].push(msg.sender);
        }
        vaultsAsBeneficiary[beneficiary].push(msg.sender);

        emit VaultCreated(msg.sender, beneficiary, guardians, threshold, interval, gracePeriod, cid);
    }

    function checkIn() external {
        Vault storage vault = vaults[msg.sender];
        if (vault.beneficiary == address(0)) revert VaultNotFound();
        if (vault.released) revert AlreadyReleased();
        if (msg.sender != msg.sender) revert NotOwner(); // placeholder, msg.sender is owner

        vault.lastCheckIn = uint64(block.timestamp);
        vault.round++;
        emit CheckedIn(msg.sender, vault.round);
    }

    function castVote(
        address owner,
        bool confirm,
        bytes calldata shareForBeneficiary
    ) external {
        Vault storage vault = vaults[owner];
        if (vault.beneficiary == address(0)) revert VaultNotFound();
        if (vault.released) revert AlreadyReleased();

        Status s = statusOf(owner);
        if (s != Status.Voting) revert NotInVoting();

        bool isGuardian = false;
        for (uint i = 0; i < vault.guardians.length; i++) {
            if (vault.guardians[i] == msg.sender) {
                isGuardian = true;
                break;
            }
        }
        if (!isGuardian) revert NotGuardian();

        bytes32 voteKey = keccak256(abi.encodePacked(owner, msg.sender, vault.round));
        if (votes[voteKey]) revert AlreadyVoted();
        votes[voteKey] = true;

        if (confirm) {
            if (shareForBeneficiary.length == 0) revert EmptyShareForConfirm();
            confirmVotes[owner]++;
            releasedShares[owner].push(shareForBeneficiary);
        } else {
            rejectVotes[owner]++;
        }

        emit VoteCast(owner, msg.sender, confirm, vault.round);

        if (confirmVotes[owner] >= vault.threshold) {
            vault.released = true;
            emit VaultReleased(owner, vault.beneficiary);
        }
    }

    mapping(bytes32 => bool) private votes;
    mapping(address => uint8) private confirmVotes;
    mapping(address => uint8) private rejectVotes;
    mapping(address => bytes[]) private releasedShares;

    function rekey(
        string calldata newCid,
        bytes[] calldata newEncryptedGuardianShares
    ) external {
        Vault storage vault = vaults[msg.sender];
        if (vault.beneficiary == address(0)) revert VaultNotFound();
        if (vault.released) revert AlreadyReleased();
        if (newEncryptedGuardianShares.length != vault.guardians.length) revert InvalidSharesLength();

        vault.cid = newCid;
        vault.encryptedGuardianShares = newEncryptedGuardianShares;
        vault.lastCheckIn = uint64(block.timestamp);
        vault.round++;
        confirmVotes[msg.sender] = 0;
        rejectVotes[msg.sender] = 0;
        releasedShares[msg.sender] = new bytes[](0);

        emit Rekeyed(msg.sender, newCid, vault.round);
    }

    function getVault(address owner) external view returns (
        address beneficiary,
        address[] memory guardians,
        uint8 threshold,
        uint64 interval,
        uint64 gracePeriod,
        string memory cid,
        bytes[] memory encryptedGuardianShares,
        uint64 lastCheckIn,
        uint64 round,
        bool released
    ) {
        Vault storage vault = vaults[owner];
        if (vault.beneficiary == address(0)) revert VaultNotFound();
        return (
            vault.beneficiary,
            vault.guardians,
            vault.threshold,
            vault.interval,
            vault.gracePeriod,
            vault.cid,
            vault.encryptedGuardianShares,
            vault.lastCheckIn,
            vault.round,
            vault.released
        );
    }

    function getGuardianShare(address owner, address guardian) external view returns (bytes memory) {
        Vault storage vault = vaults[owner];
        if (vault.beneficiary == address(0)) revert VaultNotFound();
        for (uint i = 0; i < vault.guardians.length; i++) {
            if (vault.guardians[i] == guardian) {
                return vault.encryptedGuardianShares[i];
            }
        }
        revert NotGuardian();
    }

    function getReleasedShares(address owner) external view returns (bytes[] memory) {
        Vault storage vault = vaults[owner];
        if (vault.beneficiary == address(0)) revert VaultNotFound();
        if (!vault.released) revert NotReleased();
        return releasedShares[owner];
    }

    function getVotes(address owner) external view returns (uint8 confirms, uint8 rejects, address[] memory voters) {
        Vault storage vault = vaults[owner];
        if (vault.beneficiary == address(0)) revert VaultNotFound();
        voters = new address[](confirmVotes[owner] + rejectVotes[owner]);
        uint idx = 0;
        for (uint i = 0; i < vault.guardians.length; i++) {
            bytes32 voteKey = keccak256(abi.encodePacked(owner, vault.guardians[i], vault.round));
            if (votes[voteKey]) {
                voters[idx] = vault.guardians[i];
                idx++;
            }
        }
        return (confirmVotes[owner], rejectVotes[owner], voters);
    }

    function statusOf(address owner) public view returns (Status) {
        Vault storage vault = vaults[owner];
        if (vault.beneficiary == address(0)) return Status.None;
        if (vault.released) return Status.Released;

        uint64 expiry = vault.lastCheckIn + vault.interval;
        uint64 graceEnd = expiry + vault.gracePeriod;
        uint64 currentTime = uint64(block.timestamp);

        if (currentTime < expiry) return Status.Active;
        if (currentTime < graceEnd) return Status.Grace;
        return Status.Voting;
    }

    function secondsUntilExpiry(address owner) public view returns (uint64) {
        Vault storage vault = vaults[owner];
        if (vault.beneficiary == address(0)) return 0;
        if (vault.released) return 0;

        uint64 expiry = vault.lastCheckIn + vault.interval;
        uint64 currentTime = uint64(block.timestamp);
        if (currentTime >= expiry) return 0;
        return expiry - currentTime;
    }
}