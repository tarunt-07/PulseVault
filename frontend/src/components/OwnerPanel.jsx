import { useState } from "react";
import { getContract, parseVault, ethers } from "../lib/contract.js";
import { deriveKeyPair } from "../lib/keys.js";
import { generateFileKey, encryptFile, buildGuardianShares } from "../lib/crypto.js";
import { uploadToIpfs } from "../lib/ipfs.js";
import { StatusPill, Notice, Field } from "./ui.jsx";

function parseList(text) {
  return text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function OwnerPanel({ signer, account }) {
  const [beneficiary, setBeneficiary] = useState("");
  const [guardiansText, setGuardiansText] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [intervalMin, setIntervalMin] = useState(10);
  const [graceMin, setGraceMin] = useState(5);
  const [file, setFile] = useState(null);
  const [vault, setVault] = useState(null);
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

  async function registerKey() {
    const { publicKey } = await deriveKeyPair(signer);
    const contract = getContract(signer);
    const tx = await contract.registerPublicKey(publicKey);
    await tx.wait();
    setInfo("Encryption key registered on-chain.");
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
    setInfo("Vault created. A new file key is shared across your guardians.");
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
    await loadVault();
  }

  async function checkIn() {
    const contract = getContract(signer);
    const tx = await contract.checkIn();
    await tx.wait();
    setInfo("Checked in. Timer reset.");
    await loadVault();
  }

  async function loadVault() {
    const contract = getContract(signer);
    try {
      const result = await contract.getVault(account);
      const parsed = parseVault(result);
      const status = await contract.statusOf(account);
      const remaining = await contract.secondsUntilExpiry(account);
      setVault({ ...parsed, status: Number(status), remaining: Number(remaining) });
    } catch {
      setVault(null);
    }
  }

  if (!signer) return <p className="muted">Connect your wallet to manage a vault.</p>;

  return (
    <div className="panel">
      <Notice error={error} info={info} />

      <section className="card">
        <h3>Vault status</h3>
        {vault ? (
          <div className="kv">
            <div><span>Status</span><StatusPill status={vault.status} /></div>
            <div><span>Round</span><b>{vault.round}</b></div>
            <div><span>Guardians</span><b>{vault.guardians.length}</b></div>
            <div><span>Threshold</span><b>{vault.threshold}</b></div>
            <div><span>Beneficiary</span><code>{vault.beneficiary}</code></div>
            <div><span>CID</span><code>{vault.cid}</code></div>
            <div><span>Time left</span><b>{vault.remaining}s</b></div>
          </div>
        ) : (
          <p className="muted">No vault found for this account.</p>
        )}
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => guard(loadVault)}>Refresh</button>
          <button className="btn primary" disabled={busy || !vault} onClick={() => guard(checkIn)}>Check in</button>
        </div>
      </section>

      <section className="card">
        <h3>1 · Register encryption key</h3>
        <p className="muted">Signs a fixed message to derive your client-side key pair. No gas required beyond the one-time registration.</p>
        <button className="btn" disabled={busy} onClick={() => guard(registerKey)}>Register key</button>
      </section>

      <section className="card">
        <h3>2 · Create a vault</h3>
        <Field label="Beneficiary address">
          <input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="0x…" />
        </Field>
        <Field label="Guardian addresses" hint="2–10 addresses, comma or space separated">
          <textarea rows={3} value={guardiansText} onChange={(e) => setGuardiansText(e.target.value)} placeholder="0xabc… 0xdef…" />
        </Field>
        <div className="grid">
          <Field label="Threshold">
            <input type="number" min={2} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </Field>
          <Field label="Interval (minutes)">
            <input type="number" min={1} value={intervalMin} onChange={(e) => setIntervalMin(Number(e.target.value))} />
          </Field>
          <Field label="Grace period (minutes)">
            <input type="number" min={0} value={graceMin} onChange={(e) => setGraceMin(Number(e.target.value))} />
          </Field>
        </div>
        <Field label="File to protect">
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
        <button className="btn primary" disabled={busy} onClick={() => guard(createVault)}>Encrypt & create vault</button>
      </section>

      <section className="card">
        <h3>3 · Update file (re-key)</h3>
        <p className="muted">Re-encrypts the currently selected file for the existing guardians and resets votes.</p>
        <button className="btn" disabled={busy || !vault || !file} onClick={() => guard(rekey)}>Re-key vault</button>
      </section>
    </div>
  );
}
