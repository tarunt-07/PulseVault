import { useState } from "react";
import { getContract, parseVault, ethers } from "../lib/contract.js";
import { deriveKeyPair } from "../lib/keys.js";
import { rewrapShareForBeneficiary } from "../lib/crypto.js";
import { toast } from "../lib/toast.js";
import {
  Icon,
  Button,
  Notice,
  Field,
  MonoField,
  StatusBadge,
  Stat,
  Progress,
} from "./ui.jsx";

export default function GuardianPanel({ signer, account, onConnect }) {
  const [owner, setOwner] = useState("");
  const [vault, setVault] = useState(null);
  const [votes, setVotes] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function guard(name, fn) {
    setBusy(name);
    setError("");
    setInfo("");
    try {
      await fn();
    } catch (e) {
      const msg = e.shortMessage || e.message || String(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy("");
    }
  }

  async function load() {
    if (!ethers.isAddress(owner)) throw new Error("Enter a valid owner address");
    const contract = getContract(signer);
    const parsed = parseVault(await contract.getVault(owner));
    const status = Number(await contract.statusOf(owner));
    const v = await contract.getVotes(owner);
    setVault({ ...parsed, status });
    setVotes({ confirms: Number(v.confirms), rejects: Number(v.rejects), voters: Array.from(v.voters) });
    toast("Vault loaded", "info");
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
    setInfo(confirm ? "Vote recorded and your share was forwarded to the beneficiary." : "Rejection recorded.");
    toast(confirm ? "Passing confirmed" : "Passing rejected", confirm ? "success" : "info");
    await load();
  }

  if (!signer) {
    return (
      <div className="panel">
        <section className="card center">
          <p className="card-lead">Connect your wallet to act as a guardian.</p>
          <Button variant="primary" icon={<Icon.wallet size={17} />} onClick={onConnect}>Connect wallet</Button>
        </section>
      </div>
    );
  }

  const iAmGuardian = vault?.guardians.some((g) => g.toLowerCase() === account.toLowerCase());
  const alreadyVoted = votes?.voters.some((v) => v.toLowerCase() === account.toLowerCase());

  return (
    <div className="panel">
      <Notice error={error} info={info} />

      <section className="card">
        <h3><span className="h3-ico"><Icon.shield size={16} /></span>Inspect a vault</h3>
        <Field label="Owner address">
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x…" />
        </Field>
        <Button icon={<Icon.refresh size={16} />} loading={busy === "load"} onClick={() => guard("load", load)}>Load vault</Button>
      </section>

      {vault && (
        <section className="card">
          <h3><span className="h3-ico"><Icon.vote size={16} /></span>Voting</h3>
          <div className="row" style={{ marginBottom: 16 }}>
            <StatusBadge status={vault.status} />
            <span className="chip subtle">{iAmGuardian ? "You are a guardian" : "Observer"}</span>
          </div>

          <div className="hero-stats" style={{ marginTop: 0, marginBottom: 16 }}>
            <Stat icon={<Icon.check size={20} />} label="Confirms" value={votes?.confirms ?? 0} />
            <Stat tone="violet" icon={<Icon.vote size={20} />} label={`Threshold ${vault.threshold} of ${vault.guardians.length}`} value={`${votes?.confirms ?? 0}/${vault.threshold}`} />
            <Stat tone="pink" icon={<Icon.x size={20} />} label="Rejects" value={votes?.rejects ?? 0} />
          </div>

          <div style={{ marginBottom: 6, display: "flex", justifyContent: "space-between" }} className="muted">
            <span>Progress to release</span>
            <span>{votes?.confirms ?? 0} / {vault.threshold}</span>
          </div>
          <Progress value={votes?.confirms ?? 0} max={vault.threshold} tone="ok" />

          <div style={{ marginTop: 16 }}>
            <MonoField label="Beneficiary" value={vault.beneficiary} />
          </div>

          <div className="row">
            <Button
              variant="primary"
              icon={<Icon.shield size={16} />}
              disabled={!iAmGuardian || alreadyVoted || vault.released}
              loading={busy === "confirm"}
              onClick={() => guard("confirm", () => cast(true))}
            >
              Confirm passing
            </Button>
            <Button
              variant="danger"
              icon={<Icon.x size={16} />}
              disabled={!iAmGuardian || alreadyVoted || vault.released}
              loading={busy === "reject"}
              onClick={() => guard("reject", () => cast(false))}
            >
              Reject
            </Button>
          </div>
          {!iAmGuardian && <p className="muted" style={{ marginTop: 12 }}>Your connected account is not a guardian for this vault.</p>}
          {alreadyVoted && <p className="muted" style={{ marginTop: 12 }}>You have already voted this round.</p>}
        </section>
      )}
    </div>
  );
}
