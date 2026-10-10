// Shamir Secret Sharing over GF(256).
// A secret (Uint8Array) is split into `n` shares with reconstruction threshold `k`.
// Every byte of the secret is shared independently using a random polynomial of
// degree k-1. A share is encoded as [x, y0, y1, ...] where x is the evaluation point.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

function xtime(a) {
  return ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
}

(function initTables() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = xtime(x) ^ x; // multiply by the generator 0x03
  }
  for (let i = 255; i < 512; i++) {
    EXP[i] = EXP[i - 255];
  }
  LOG[0] = 0;
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function gfDiv(a, b) {
  if (a === 0) return 0;
  if (b === 0) throw new Error("division by zero in GF(256)");
  return EXP[(LOG[a] - LOG[b] + 255) % 255];
}

function randomByte() {
  const buf = new Uint8Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}

export function split(secret, n, k) {
  if (!(secret instanceof Uint8Array)) throw new Error("secret must be a Uint8Array");
  if (k < 1 || k > n) throw new Error("threshold must satisfy 1 <= k <= n");
  if (n > 255) throw new Error("cannot create more than 255 shares");

  const shares = Array.from({ length: n }, () => new Uint8Array(secret.length + 1));
  for (let i = 0; i < n; i++) shares[i][0] = i + 1;

  for (let j = 0; j < secret.length; j++) {
    const coeffs = new Uint8Array(k);
    coeffs[0] = secret[j];
    for (let c = 1; c < k; c++) coeffs[c] = randomByte();

    for (let i = 0; i < n; i++) {
      const x = i + 1;
      let y = 0;
      for (let d = coeffs.length - 1; d >= 0; d--) {
        y = gfMul(y, x) ^ coeffs[d];
      }
      shares[i][j + 1] = y;
    }
  }
  return shares;
}

export function combine(shares) {
  if (!shares || shares.length === 0) throw new Error("no shares provided");
  const len = shares[0].length - 1;
  const secret = new Uint8Array(len);

  for (let j = 0; j < len; j++) {
    let acc = 0;
    for (let i = 0; i < shares.length; i++) {
      const xi = shares[i][0];
      let num = 1;
      let den = 1;
      for (let m = 0; m < shares.length; m++) {
        if (m === i) continue;
        const xm = shares[m][0];
        num = gfMul(num, xm);
        den = gfMul(den, xi ^ xm);
      }
      acc ^= gfMul(shares[i][j + 1], gfDiv(num, den));
    }
    secret[j] = acc;
  }
  return secret;
}
