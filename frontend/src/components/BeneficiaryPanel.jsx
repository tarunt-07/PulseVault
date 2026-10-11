import { useState } from "react";
import { getContract, parseVault, ethers } from "../lib/contract.js";
import { deriveKeyPair } from "../lib/keys.js";
import { recoverFileKey, decryptFile } from "../lib/crypto.js";
import { fetchFromIpfs } from "../lib/ipfs.js";
import { toast } from "../lib/toast.js";
import {
  Icon,
  Button,
  Notice,
  Field,
  MonoField,
  StatusBadge,
  Stat,
} from "./ui.jsx";

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

export default function BeneficiaryPanel({ signer, account, onConnect }) {
  const [owner, setOwner] = useState("");
  const [vault, setVault] = useState(null);
  const [releasedShares, setReleasedShares] = useState(null);
  const [recovered, setRecovered] = useState(false);
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
    setRecovered(false);
    const contract = getContract(signer);
    const parsed = parseVault(await contract.getVault(owner));
    const status = Number(await contract.statusOf(owner));
    let shares = null;
    if (parsed.released) {
      shares = await contract.getReleasedShares(owner);
    }
    setVault({ ...parsed, status });
    setReleasedShares(shares);
    toast("Vault loaded", "info");
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
    setRecovered(true);
    setInfo("Key reconstructed and file decrypted. Check your downloads.");
    toast("Vault recovered — file downloaded", "success");
  }

  if (!signer) {
    return (
      <div className="panel">
        <section className="card center">
          <p className="card-lead">Connect your wallet to recover a vault.</p>
          <Button variant="primary" icon={<Icon.wallet size={17} />} onClick={onConnect}>Connect wallet</Button>
        </section>
      </div>
    );
  }

  const isBeneficiary = vault && vault.beneficiary.toLowerCase() === account.toLowerCase();

  return (
    <div className="panel">
      <Notice error={error} info={info} />

      <section className="card">
        <h3><span className="h3-ico"><Icon.gift size={16} /></span>Find your inheritance</h3>
        <Field label="Owner address">
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="0x…" />
        </Field>
        <Button icon={<Icon.refresh size={16} />} loading={busy === "load"} onClick={() => guard("load", load)}>Load vault</Button>
      </section>

      {vault && (
        <section className="card">
          <h3><span className="h3-ico"><Icon.gift size={16} /></span>Vault</h3>
          <div className="row" style={{ marginBottom: 16 }}>
            <StatusBadge status={vault.status} />
            {releasedShares && <span className="chip subtle">{releasedShares.length} shares released</span>}
          </div>

          <div className="hero-stats" style={{ marginTop: 0, marginBottom: 16 }}>
            <Stat icon={<Icon.lock size={16} />} label="Released" value={vault.released ? "Yes" : "No"} />
            <Stat tone="violet" icon={<Icon.shield size={16} />} label="Threshold" value={vault.threshold} />
            <Stat tone="pink" icon={<Icon.file size={16} />} label="Shares available" value={releasedShares?.length ?? 0} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <MonoField label="CID" value={vault.cid} />
          </div>

          {recovered ? (
            <div className="verify-ok">
              <span className="big-check"><Icon.check size={30} /></span>
              <div>
                <h3 style={{ margin: 0, justifyContent: "center" }}>Key reconstructed</h3>
                <p className="muted" style={{ margin: "6px 0 0" }}>Your decrypted file was downloaded.</p>
              </div>
            </div>
          ) : (
            <>
              <Button
                variant="primary"
                icon={<Icon.lock size={16} />}
                disabled={!vault.released || !isBeneficiary}
                loading={busy === "claim"}
                onClick={() => guard("claim", claim)}
              >
                Reconstruct key & decrypt
              </Button>
              {!isBeneficiary && (
                <p className="muted" style={{ marginTop: 12 }}>
                  Only {vault.beneficiary} can recover this vault.
                </p>
              )}
              {!vault.released && (
                <p className="muted" style={{ marginTop: 12 }}>
                  This vault has not been released yet — guardians must reach the threshold first.
                </p>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
