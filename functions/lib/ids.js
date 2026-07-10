// Small id/time helpers.

export function mintId(prefix = 'id') {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function nowISO() { return new Date().toISOString(); }

// YYYY-MM-DD for a Date (defaults to now). Uses local components of the passed Date.
export function ymd(d = new Date()) {
  const p = (n) => (n < 10 ? '0' : '') + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
