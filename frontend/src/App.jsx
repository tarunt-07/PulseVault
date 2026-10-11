import { useCallback, useEffect, useState } from "react";
import { ethers, CONTRACT_ADDRESS } from "./lib/contract.js";
import { Icon, Toaster, CopyButton, short, Notice, Stat } from "./components/ui.jsx";
import OwnerPanel from "./components/OwnerPanel.jsx";
import GuardianPanel from "./components/GuardianPanel.jsx";
import BeneficiaryPanel from "./components/BeneficiaryPanel.jsx";

const TABS = [
  { id: "owner", label: "Owner", icon: <Icon.user size={16} /> },
  { id: "guardian", label: "Guardian", icon: <Icon.shield size={16} /> },
  { id: "beneficiary", label: "Beneficiary", icon: <Icon.gift size={16} /> },
];

const LOCAL_CHAIN_HEX = "0x7a69";

function friendlyError(e) {
  const msg = e?.message || String(e);
  if (e?.code === -32002 || /already pending/i.test(msg)) {
    return "MetaMask already has a pending request. Open the MetaMask extension, approve or dismiss it, then try again.";
  }
  if (e?.code === 4001 || /rejected|denied|user rejected/i.test(msg)) {
    return "Request rejected in MetaMask.";
  }
  return msg;
}

export default function App() {
  const [account, setAccount] = useState("");
  const [signer, setSigner] = useState(null);
  const [chainId, setChainId] = useState("");
  const [tab, setTab] = useState("owner");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  const loadAccount = useCallback(async (request) => {
    if (!window.ethereum) throw new Error("Install MetaMask or another EIP-1193 wallet to continue");
    const provider = new ethers.BrowserProvider(window.ethereum);
    let accounts = await provider.send("eth_accounts", []);
    if ((!accounts || accounts.length === 0) && request) {
      accounts = await provider.send("eth_requestAccounts", []);
    }
    if (!accounts || accounts.length === 0) {
      setSigner(null);
      setAccount("");
      return;
    }
    const nextSigner = await provider.getSigner();
    const network = await provider.getNetwork();
    setSigner(nextSigner);
    setAccount(accounts[0]);
    setChainId(network.chainId.toString());
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError("");
    try {
      await loadAccount(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setConnecting(false);
    }
  }, [loadAccount]);

  const switchNetwork = useCallback(async () => {
    setError("");
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: LOCAL_CHAIN_HEX }],
      });
    } catch (e) {
      if (e?.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: LOCAL_CHAIN_HEX,
                chainName: "Hardhat Localhost",
                rpcUrls: ["http://127.0.0.1:8545"],
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              },
            ],
          });
        } catch (addError) {
          setError(friendlyError(addError));
        }
      } else {
        setError(friendlyError(e));
      }
    }
  }, []);

  useEffect(() => {
    loadAccount(false).catch(() => {});
  }, [loadAccount]);

  useEffect(() => {
    if (!window.ethereum?.on) return undefined;
    const onChange = () => loadAccount(false).catch(() => {});
    window.ethereum.on("accountsChanged", onChange);
    window.ethereum.on("chainChanged", onChange);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", onChange);
      window.ethereum.removeListener?.("chainChanged", onChange);
    };
  }, [loadAccount]);

  const expected = chainId === "11155111" || chainId === "31337";
  const activeIndex = TABS.findIndex((t) => t.id === tab);

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="grid-lines" aria-hidden="true" />

      <div className="app">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <Icon.heart size={22} />
            </span>
            <div>
              <h1>PulseVault</h1>
              <p>Your digital will on the blockchain</p>
            </div>
          </div>
          <div className="wallet">
            {account ? (
              <>
                <span className="chip">
                  <span className={`dot ${expected ? "" : "warn"}`} />
                  {short(account)}
                  <CopyButton value={account} size={14} label="Copy address" />
                </span>
                <span className="chip subtle">chain {chainId || "?"}</span>
              </>
            ) : (
              <button className="btn primary" onClick={connect} disabled={connecting}>
                {connecting ? <span className="spinner" /> : <Icon.wallet size={17} />}
                <span>Connect wallet</span>
              </button>
            )}
          </div>
        </header>

        <section className="hero">
          <span className="eyebrow">
            <Icon.spark size={13} /> Decentralized dead man's switch
          </span>
          <h2>
            Check in. Stay sealed.
            <br />
            Go silent — <span className="grad">your legacy unlocks.</span>
          </h2>
          <p>
            Encrypt your files in the browser, split the key across trusted guardians,
            and let the contract hand it to your beneficiary only when the heartbeat stops.
          </p>

          <div className="hero-stats">
            <Stat icon={<Icon.lock size={20} />} label="Client-side encryption" value="AES-256-GCM" />
            <Stat tone="violet" icon={<Icon.shield size={20} />} label="Guardian consensus" value="M-of-N" />
            <Stat tone="pink" icon={<Icon.gift size={20} />} label="Release target" value="Beneficiary" />
          </div>
        </section>

        <main>
          <Notice error={error} />
          {!CONTRACT_ADDRESS && (
            <p className="notice error">
              <Icon.alert size={16} /> <span>VITE_CONTRACT_ADDRESS is not configured. Deploy and add it to frontend/.env.</span>
            </p>
          )}
          {account && !expected && (
            <div className="notice info">
              <Icon.alert size={16} />
              <span>Connected to chain {chainId}. This dApp targets Sepolia (11155111) or localhost (31337).</span>
              <button className="btn" style={{ marginLeft: "auto" }} onClick={switchNetwork}>
                Switch to localhost
              </button>
            </div>
          )}

          <nav className="tabs">
            <div className="tab-indicator" style={{ transform: `translateX(${activeIndex * 100}%)` }} />
            {TABS.map((t) => (
              <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
                {t.icon}
                <span>{t.label}</span>
              </button>
            ))}
          </nav>

          {tab === "owner" && <OwnerPanel signer={signer} account={account} onConnect={connect} />}
          {tab === "guardian" && <GuardianPanel signer={signer} account={account} onConnect={connect} />}
          {tab === "beneficiary" && <BeneficiaryPanel signer={signer} account={account} onConnect={connect} />}
        </main>

        <p className="footnote">
          PulseVault is an unaudited academic prototype · use testnets only · MIT licensed
        </p>
      </div>

      <Toaster />
    </>
  );
}
