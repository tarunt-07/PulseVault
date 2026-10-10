import { useState } from "react";
import { getContract, parseVault, ethers } from "../lib/contract.js";
import { deriveKeyPair } from "../lib/keys.js";
import { recoverFileKey, decryptFile } from "../lib/crypto.js";
import { fetchFromIpfs } from "../lib/ipfs.js";
import { StatusPill, Notice, Field } from "./ui.jsx";

function download(bytes, name) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name || "pulsevault-decrypted.bin";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function BeneficiaryPanel({ signer, account }) {
  const [owner, setOwner] = useState("");
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

  async function load() {
    if (!ethers.isAddress(owner)) throw new Error("Enter a valid owner address");
    const contract = getContract(signer);
    const parsed = parseVault(await contract.getVault(owner));
    const status = Number(await contract.statusOf(owner));
    setVault({ ...parsed, status });
  }

  async function claim() {
    const contract = getContract(signer);
    const released = await contract.getReleasedShares(owner);
    if (released.length < vault.threshold) {
      throw new Error(`Need ${vault.threshold} released shares, only ${released.length} available`);
    }
    const { privateKey } = await deriveKeyPair(signer);
    const fileKey = await recoverFileKey(released, privateKey);
    const blob = await fetchFromIpfs(vault.cid);
    const plaintext = await decryptFile(fileKey, blob);
    download(plaintext, `pulsevault-${owner.slice(2, 8)}.bin`);
    setInfo("Key reconstructed and file decrypted. Check your downloads.");
  }

  if (!signer) return <p className="muted">Connect your wallet to recover a vault.</p>;

  const isBeneficiary = vault && vault.beneficiary.toLowerCase() === account.toLowerCase();

  return (
    <div className="panel">
      <Notice error={error} info={info} />

      <section className="card">
        <h3>Find your inheritance</h3>
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
            <div><span>Released</span><b>{vault.released ? "yes" : "no"}</b></div>
            <div><span>Threshold</span><b>{vault.threshold}</b></div>
            <div><span>CID</span><code>{vault.cid}</code></div>
          </div>
          <button className="btn primary" disabled={busy || !vault.released || !isBeneficiary} onClick={() => guard(claim)}>
            Reconstruct key & decrypt
          </button>
          {!isBeneficiary && <p className="muted">Only {vault.beneficiary} can recover this vault.</p>}
          {!vault.released && <p className="muted">This vault has not been released yet.</p>}
        </section>
      )}
    </div>
  );
}
