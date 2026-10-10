// Encrypted blobs live on IPFS. Pinata is used when a JWT is configured.
// Without a JWT the dApp falls back to browser localStorage (`local://<id>`),
// which is enough to demo the full flow on a single device.

const PINATA_JWT = import.meta.env?.VITE_PINATA_JWT || "";
const PINATA_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const GATEWAY = import.meta.env?.VITE_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

const localKey = (id) => `pulsevault:blob:${id}`;

function toBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function uploadToIpfs(bytes, filename = "vault.bin") {
  if (!PINATA_JWT) {
    const id = crypto.randomUUID();
    localStorage.setItem(localKey(id), toBase64(bytes));
    return `local://${id}`;
  }

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/octet-stream" }), filename);
  const res = await fetch(PINATA_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json();
  return `ipfs://${json.IpfsHash}`;
}

export async function fetchFromIpfs(cidOrUri) {
  if (cidOrUri.startsWith("local://")) {
    const stored = localStorage.getItem(localKey(cidOrUri.slice("local://".length)));
    if (!stored) throw new Error("local encrypted blob not found in this browser");
    return fromBase64(stored);
  }
  const cid = cidOrUri.replace(/^ipfs:\/\//, "");
  const res = await fetch(`${GATEWAY}/${cid}`);
  if (!res.ok) throw new Error(`IPFS fetch failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export function ipfsWebUrl(cidOrUri) {
  if (cidOrUri.startsWith("local://")) return cidOrUri;
  return `${GATEWAY}/${cidOrUri.replace(/^ipfs:\/\//, "")}`;
}
