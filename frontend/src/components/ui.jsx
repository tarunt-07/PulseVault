import { useEffect, useRef, useState } from "react";
import { STATUS } from "../lib/abi.js";
import { subscribe } from "../lib/toast.js";

/* ------------------------------------------------------------------ icons */

function Svg({ children, size = 18, className = "", stroke = 1.8 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  heart: (p) => (
    <Svg {...p}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </Svg>
  ),
  shield: (p) => (
    <Svg {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  user: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  ),
  gift: (p) => (
    <Svg {...p}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M5 12v9h14v-9M12 8S9 3 6.5 5.5 12 8 12 8Zm0 0s3-5 5.5-2.5S12 8 12 8Z" />
    </Svg>
  ),
  wallet: (p) => (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="M3 10h18M16 15h2" />
    </Svg>
  ),
  copy: (p) => (
    <Svg {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </Svg>
  ),
  check: (p) => (
    <Svg {...p}>
      <path d="m5 13 4 4L19 7" />
    </Svg>
  ),
  upload: (p) => (
    <Svg {...p}>
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Svg>
  ),
  lock: (p) => (
    <Svg {...p}>
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  ),
  clock: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  refresh: (p) => (
    <Svg {...p}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />
    </Svg>
  ),
  alert: (p) => (
    <Svg {...p}>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4m0 3h.01" />
    </Svg>
  ),
  x: (p) => (
    <Svg {...p}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Svg>
  ),
  file: (p) => (
    <Svg {...p}>
      <path d="M14 3v5h5M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
    </Svg>
  ),
  vote: (p) => (
    <Svg {...p}>
      <path d="m9 12 2 2 4-5" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </Svg>
  ),
  external: (p) => (
    <Svg {...p}>
      <path d="M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </Svg>
  ),
  spark: (p) => (
    <Svg {...p}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </Svg>
  ),
};

/* ---------------------------------------------------------------- spinner */

export function Spinner({ size = 16 }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

/* ----------------------------------------------------------------- button */

export function Button({ variant = "default", loading = false, icon, children, className = "", disabled, ...props }) {
  return (
    <button className={`btn ${variant} ${className}`} disabled={loading || disabled} {...props}>
      {loading ? <Spinner /> : icon ? <span className="btn-ico">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

/* ------------------------------------------------------------ copy button */

export function CopyButton({ value, label = "Copy", size = 16 }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const el = document.createElement("textarea");
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }

  return (
    <button type="button" className={`copy ${copied ? "copied" : ""}`} onClick={copy} title={label}>
      {copied ? <Icon.check size={size} /> : <Icon.copy size={size} />}
    </button>
  );
}

/* -------------------------------------------------------------- copy line */

export function MonoField({ value, label }) {
  return (
    <div className="mono-field">
      <span className="mono-field-label">{label}</span>
      <code title={value}>{value}</code>
      <CopyButton value={value} />
    </div>
  );
}

/* ------------------------------------------------------------ status badge */

export function StatusBadge({ status }) {
  const name = typeof status === "number" ? STATUS[status] : status;
  const anim = name === "Active" ? "beat" : name === "Voting" ? "pulse" : "";
  return (
    <span className={`status status-${String(name).toLowerCase()}`}>
      <span className={`status-dot ${anim}`} />
      {name}
    </span>
  );
}

/* ------------------------------------------------------------------- stats */

export function Stat({ icon, label, value, tone = "" }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-ico">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- progress */

export function Progress({ value, max, tone = "accent" }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress">
      <div className={`progress-bar ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ----------------------------------------------------------------- stepper */

export function Stepper({ steps, active }) {
  return (
    <ol className="stepper">
      {steps.map((step, i) => {
        const state = i < active ? "done" : i === active ? "current" : "todo";
        return (
          <li key={step} className={`step ${state}`}>
            <span className="step-dot">{i < active ? <Icon.check size={13} /> : i + 1}</span>
            <span className="step-label">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ toaster */

export function Toaster() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const off = subscribe((item) => {
      setItems((list) => [...list, item]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== item.id)), 4200);
    });
    return () => off();
  }, []);

  return (
    <div className="toaster">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-ico">
            {t.type === "success" ? <Icon.check size={16} /> : t.type === "error" ? <Icon.alert size={16} /> : <Icon.spark size={16} />}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => setItems((l) => l.filter((x) => x.id !== t.id))}>
            <Icon.x size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- countdown */

export function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds || 0);
  useEffect(() => {
    setLeft(seconds || 0);
    if (!seconds) return undefined;
    const id = setInterval(() => setLeft((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return { left, text: h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}` };
}

/* -------------------------------------------------------------- small utils */

export function Notice({ error, info }) {
  if (error) {
    return (
      <p className="notice error">
        <Icon.alert size={16} /> <span>{error}</span>
      </p>
    );
  }
  if (info) {
    return (
      <p className="notice info">
        <Icon.spark size={16} /> <span>{info}</span>
      </p>
    );
  }
  return null;
}

export function Field({ label, hint, children, ...props }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children ? children : <input {...props} />}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function short(addr) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
