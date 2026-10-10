import { useCallback, useEffect, useState } from "react";
import { ethers, CONTRACT_ADDRESS } from "./lib/contract.js";
import { short, Notice } from "./components/ui.jsx";
import OwnerPanel from "./components/OwnerPanel.jsx";
import GuardianPanel from "./components/GuardianPanel.jsx";
import BeneficiaryPanel from "./components/BeneficiaryPanel.jsx";

const TABS = [
  { id: "owner", label: "Owner" },
  { id: "guardian", label: "Guardian" },
  { id: "beneficiary", label: "Beneficiary" },
];

export default function App() {
  const [account, setAccount] = useState("");
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState("");
  const [tab, setTab] = useState("owner");
  const [error, setError] = useState("");

  const connect = useCallback(async () => {
    try {
      if (!window.ethereum) throw new Error("Install MetaMask or another EIP-1193 wallet to continue");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const nextSigner = await provider.getSigner();
      const network = await provider.getNetwork();
      setSigner(nextSigner);
      setAccount(accounts[0]);
      setChainId(network.chainId.toString());
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum?.on) return undefined;
    const reload = () => window.location.reload();
    window.ethereum.on("accountsChanged", reload);
    window.ethereum.on("chainChanged", reload);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", reload);
      window.ethereum.removeListener?.("chainChanged", reload);
    };
  }, []);

  const expected = chainId === "11155111" || chainId === "31337";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="pulse">♥</span>
          <div>
            <h1>PulseVault</h1>
            <p>Your digital will on the blockchain</p>
          </div>
        </div>
        <div className="wallet">
          {account ? (
            <>
              <span className="chip">{short(account)}</span>
              <span className="chip subtle">chain {chainId || "?"}</span>
            </>
          ) : (
            <button className="btn primary" onClick={connect}>Connect wallet</button>
          )}
        </div>
      </header>

      <main>
        <Notice error={error} />
        {!CONTRACT_ADDRESS && (
          <p className="notice error">
            VITE_CONTRACT_ADDRESS is not configured. Deploy the contract and add it to frontend/.env.
          </p>
        )}
        {account && !expected && (
          <p className="notice info">
            Connected to chain {chainId}. This dApp targets Sepolia (11155111) or localhost (31337).
          </p>
        )}

        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === "owner" && <OwnerPanel signer={signer} account={account} />}
        {tab === "guardian" && <GuardianPanel signer={signer} account={account} />}
        {tab === "beneficiary" && <BeneficiaryPanel signer={signer} account={account} />}
      </main>

      <footer>
        <p>PulseVault is an unaudited academic prototype. Use testnets only.</p>
      </footer>
    </div>
  );
}
