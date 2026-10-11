import { useState } from "react";
import { getContract, parseVault, ethers } from "../lib/contract.js";
import { deriveKeyPair } from "../lib/keys.js";
import { generateFileKey, encryptFile, buildGuardianShares } from "../lib/crypto.js";
import { uploadToIpfs } from "../lib/ipfs.js";
import { toast } from "../lib/toast.js";
import {
  Icon,
  Button,
  Notice,
  Field,
  MonoField,
  StatusBadge,
  Stat,
  Stepper,
  useCountdown,
} from "./ui.jsx";

function parseList(text) {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function OwnerPanel({ signer, account, onConnect }) {
  const [beneficiary, setBeneficiary] = useState("");
  const [guardiansText, setGuardiansText] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [intervalMin, setIntervalMin] = useState(10);
  const [graceMin, setGraceMin] = useState(5);
  const [file, setFile] = useState(null);
  const [vault, setVault] = useState(null);
  const [keyRegistered, setKeyRegistered] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const countdown = useCountdown(vault?.remaining);

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

  async function registerKey() {
    const { publicKey } = await deriveKeyPair(signer);
    const contract = getContract(signer);
    const tx = await contract.registerPublicKey(publicKey);
    await tx.wait();
    setKeyRegistered(true);
    setInfo("Encryption key registered on-chain.");
    toast("Encryption key registered", "success");
  }

  async function createVault() {
    const guardians = parseList(guardiansText);
    if (!ethers.isAddress(beneficiary)) throw new Error("Enter a valid beneficiary address");
    if (guardians.length < 2) throw new Error("At least 2 guardians are required");
    if (!guardians.every(ethers.isAddress)) throw new Error("One or more guardian addresses are invalid");
    if (!file) throw new Error("Choose a file to protect");

    const contract = getContract(signer);
    const publicKeys = [];
    for (const g of guardians) {
      const pk = await contract.publicKeyOf(g);
      if (!pk || pk === "0x") throw new Error(`Guardian ${g} has not registered an encryption key`);
      publicKeys.push(pk);
    }

    const fileKey = generateFileKey();
    const plaintext = new Uint8Array(await file.arrayBuffer());
    const encryptedBlob = await encryptFile(fileKey, plaintext);
    const cid = await uploadToIpfs(encryptedBlob, file.name);
    const encryptedGuardianShares = await buildGuardianShares(fileKey, publicKeys, threshold);

    const tx = await contract.createVault(
      beneficiary,
      guardians,
      threshold,
      Math.round(intervalMin * 60),
      Math.round(graceMin * 60),
      cid,
      encryptedGuardianShares
    );
    await tx.wait();
    setInfo("Vault created. The file key is now split across your guardians.");
    toast("Vault created successfully", "success");
    await loadVault();
  }

  async function rekey() {
    if (!file) throw new Error("Choose the replacement file first");
    const contract = getContract(signer);
    const existing = vault || parseVault(await contract.getVault(account));
    const publicKeys = [];
    for (const g of existing.guardians) {
      const pk = await contract.publicKeyOf(g);
      if (!pk || pk === "0x") throw new Error(`Guardian ${g} has not registered an encryption key`);
      publicKeys.push(pk);
    }

    const fileKey = generateFileKey();
    const plaintext = new Uint8Array(await file.arrayBuffer());
    const encryptedBlob = await encryptFile(fileKey, plaintext);
    const cid = await uploadToIpfs(encryptedBlob, file.name);
    const shares = await buildGuardianShares(fileKey, publicKeys, existing.threshold);

    const tx = await contract.rekey(cid, shares);
    await tx.wait();
    setInfo("Vault re-keyed with a new file and shares.");
    toast("Vault re-keyed", "success");
    await loadVault();
  }

  async function checkIn() {
    const contract = getContract(signer);
    const tx = await contract.checkIn();
    await tx.wait();
    setInfo("Checked in — timer reset.");
    toast("Checked in. Timer reset.", "success");
    await loadVault();
  }

  async function loadVault() {
    const contract = getContract(signer);
    try {
      const parsed = parseVault(await contract.getVault(account));
      const status = Number(await contract.statusOf(account));
      const remaining = Number(await contract.secondsUntilExpiry(account));
      setVault({ ...parsed, status, remaining });
    } catch {
      setVault(null);
    }
  }

  if (!signer) {
    return (
      <div className="panel">
        <section className="card center">
          <p className="card-lead">Connect your wallet to create and manage a vault.</p>
          <Button variant="primary" icon={<Icon.wallet size={17} />} onClick={onConnect}>Connect wallet</Button>
        </section>
      </div>
    );
  }

  const step = vault ? 2 : keyRegistered ? 1 : 0;

  return (
    <div className="panel">
      <Notice error={error} info={info} />

      <section className="card">
        <h3><span className="h3-ico"><Icon.heart size={16} /></span>Vault status</h3>
        {vault ? (
          <>
            <div className="row" style={{ marginBottom: 16 }}>
              <StatusBadge status={vault.status} />
              <span className="chip subtle">round {vault.round}</span>
            </div>
            <div className="hero-stats" style={{ marginTop: 0 }}>
              <Stat icon={<Icon.clock size={20} />} label="Time until expiry" value={countdown.text} />
              <Stat tone="violet" icon={<Icon.shield size={20} />} label="Guardians" value={`${vault.threshold} of ${vault.guardians.length}`} />
              <Stat tone="pink" icon={<Icon.vote size={20} />} label="Check-in round" value={vault.round} />
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              <MonoField label="Beneficiary" value={vault.beneficiary} />
              <MonoField label="CID" value={vault.cid} />
            </div>
          </>
        ) : (
          <p className="card-lead">No vault found for this account yet. Follow the steps below to create one.</p>
        )}
        <div className="row">
          <Button icon={<Icon.refresh size={16} />} loading={busy === "load"} onClick={() => guard("load", loadVault)}>Refresh</Button>
          <Button variant="primary" icon={<Icon.heart size={16} />} disabled={!vault} loading={busy === "checkin"} onClick={() => guard("checkin", checkIn)}>Check in</Button>
        </div>
      </section>

      <section className="card">
        <h3><span className="h3-ico"><Icon.spark size={16} /></span>Set up your vault</h3>
        <Stepper steps={["Register key", "Configure", "Live"]} active={step} />

        <div style={{ marginBottom: 20 }}>
          <p className="card-lead" style={{ marginTop: 0 }}>
            Sign a fixed message to derive your client-side encryption key pair. One-time on-chain registration.
          </p>
          <Button
            variant={keyRegistered ? "ghost" : "primary"}
            icon={keyRegistered ? <Icon.check size={16} /> : <Icon.lock size={16} />}
            loading={busy === "key"}
            onClick={() => guard("key", registerKey)}
          >
            {keyRegistered ? "Key registered" : "Register encryption key"}
          </Button>
        </div>

        <Field label="Beneficiary address">
          <input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="0x…" />
        </Field>
        <Field label="Guardian addresses" hint="2–10 addresses, comma, space or newline separated">
          <textarea rows={3} value={guardiansText} onChange={(e) => setGuardiansText(e.target.value)} placeholder="0xabc…  0xdef…" />
        </Field>
        <div className="grid">
          <Field label="Threshold">
            <input type="number" min={2} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </Field>
          <Field label="Interval (min)">
            <input type="number" min={1} value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} />
          </Field>
          <Field label="Grace (min)">
            <input type="number" min={0} value={graceMin} onChange={(e) => setGraceMin(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="File to protect">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
        {file && (
          <p className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon.file size={15} /> {file.name} · {(file.size / 1024).toFixed(1)} KB
          </p>
        )}
        <div className="row">
          <Button variant="primary" icon={<Icon.upload size={16} />} loading={busy === "create"} onClick={() => guard("create", createVault)}>
            Encrypt & create vault
          </Button>
        </div>
      </section>

      <section className="card">
        <h3><span className="h3-ico"><Icon.lock size={16} /></span>Update file</h3>
        <p className="card-lead">Re-encrypt the selected file for the existing guardians and reset the voting round.</p>
        <Button icon={<Icon.refresh size={16} />} disabled={!vault || !file} loading={busy === "rekey"} onClick={() => guard("rekey", rekey)}>
          Re-key vault
        </Button>
      </section>
    </div>
  );
}
