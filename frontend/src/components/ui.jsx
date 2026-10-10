import { STATUS } from "../lib/abi.js";

export function StatusPill({ status }) {
  const name = typeof status === "number" ? STATUS[status] : status;
  return <span className={`pill pill-${String(name).toLowerCase()}`}>{name}</span>;
}

export function Notice({ error, info }) {
  if (error) return <p className="notice error">{error}</p>;
  if (info) return <p className="notice info">{info}</p>;
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
