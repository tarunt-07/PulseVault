// Tiny toast bus. Call `toast(message, type)` from anywhere; <Toaster/> renders them.
let listeners = new Set();
let nextId = 0;

export function toast(message, type = "info") {
  const item = { id: ++nextId, message, type };
  listeners.forEach((fn) => fn(item));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
