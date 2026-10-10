import { useState } from "react";
import { getContract, parseVault, ethers } from "../lib/contract.js";
import { deriveKeyPair } from "../lib/keys.js";
import { rewrapShareForBeneficiary } from "../lib/crypto.js";
import { StatusPill, Notice, Field } from "./ui.jsx";

export default function GuardianPanel({ signer, account }) {
  const [owner, setOwner] = useState("");
  const [vault, setVault] = useState(null);
  const [votes, setVotes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const guard = async (fn) => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await fn();
    } catch (e) {
      setError(e.shortMessage || e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  async function load() {
    if (!ethers.isAddress(owner)) throw new Error("Enter a valid owner address");
    const contract = getContract(signer);
    const parsed = parseVault(await contract.getVault(owner));
    const status = Number(await contract.statusOf(owner));
    const v = await contract.getVotes(owner);
    setVault({ ...parsed, status });
    setVotes({ confirms: Number(v.confirms), rejects: Number(v.rejects), voters: v.voters });
  }

  async function cast(confirm) {
    const contract = getContract(signer);
    let share = "0x";
    if (confirm) {
      const { privateKey } = await deriveKeyPair(signer);
      const wrapped = await contract.getGuardianShare(owner, account);
      const beneficiaryPk = await contract.publicKeyOf(vault.beneficiary);
      if (!beneficiaryPk || beneficiaryPk === "0x") {
        throw new Error("Beneficiary has not registered an encryption key");
      }
      share = await rewrapShareForBeneficiary(wrapped, privateKey, beneficiaryPk);
    }
    const tx = await contract.castVote(owner, confirm, share);
    await tx.wait();
    setInfo(confirm ? "Vote recorded and share forwarded to the beneficiary." : "Rejection recorded.");
    await load();
  }

  if (!signer) return <p className="muted">Connect your wallet to act as a guardian.</p>;

  const iAmGuardian = vault?.guardians.some((g) => g.toLowerCase() === account.toLowerCase());
  const alreadyVoted = votes?.voters.some((v) => v.toLowerCase() === account.toLowerCase());

  return (
    <div className="panel">
      <Notice error={error} info={info} />

      <section className="card">
        <h3>Inspect a vault</h3>
        <Field label="Owner address">
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x…" />
        </Field>
        <button className="btn" disabled={busy} onClick={() => guard(load)}>Load vault</button>
      </section>

      {vault && (
        <section className="card">
          <h3>Vault</h3>
          <div className="kv">
            <div><span>Status</span><StatusPill status={vault.status} /></div>
            <div><span>Round</span><b>{vault.round}</b></div>
            <div><span>Threshold</span><b>{vault.threshold} of {vault.guardians.length}</b></div>
            <div><span>Beneficiary</span><code>{vault.beneficiary}</code></div>
            <div><span>Votes</span><b>{votes?.confirms} confirm / {votes?.rejects} reject</b></div>
            <div><span>Your role</span><b>{iAmGuardian ? "Guardian" : "Observer"}</b></div>
          </div>
          <div className="row">
            <button className="btn primary" disabled={busy || !iAmGuardian || alreadyVoted || vault.released} onClick={() => guard(() => cast(true))}>
              Confirm passing
            </button>
            <button className="btn danger" disabled={busy || !iAmGuardian || alreadyVoted || vault.released} onClick={() => guard(() => cast(false))}>
              Reject
            </button>
          </div>
          {!iAmGuardian && <p className="muted">Your connected account is not a guardian for this vault.</p>}
          {alreadyVoted && <p className="muted">You have already voted this round.</p>}
        </section>
      )}
    </div>
  );
}
