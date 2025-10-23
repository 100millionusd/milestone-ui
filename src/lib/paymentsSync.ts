// src/lib/paymentsSync.ts
const CHANNEL_NAME = 'mx-payments';
const LS_KEY = 'mx:pay:pending';

export function openPaymentsChannel(): BroadcastChannel {
  return new BroadcastChannel(CHANNEL_NAME);
}

type PayMsg = { type: 'mx:pay:queued' | 'mx:pay:done'; bidId: number; milestoneIndex: number };

export function onPaymentsMessage(
  ch: BroadcastChannel,
  handler: (msg: PayMsg) => void
) {
  const fn = (ev: MessageEvent) => {
    const m = ev?.data;
    if (!m || (m.type !== 'mx:pay:queued' && m.type !== 'mx:pay:done')) return;
    if (typeof m.bidId !== 'number' || typeof m.milestoneIndex !== 'number') return;
    handler(m);
  };
  ch.addEventListener('message', fn);
  return () => ch.removeEventListener('message', fn);
}

export function postQueued(bidId: number, milestoneIndex: number) {
  try {
    new BroadcastChannel(CHANNEL_NAME).postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex });
  } catch {}
}
export function postDone(bidId: number, milestoneIndex: number) {
  try {
    new BroadcastChannel(CHANNEL_NAME).postMessage({ type: 'mx:pay:done', bidId, milestoneIndex });
  } catch {}
}

export function mkKey2(bidId: number, milestoneIndex: number) {
  return `${bidId}-${milestoneIndex}`;
}

// ---------- localStorage mirroring ----------
function readLS(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch { return []; }
}
function writeLS(keys: string[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(new Set(keys)))); } catch {}
}
export function addPendingLS(key: string) {
  const arr = readLS(); if (!arr.includes(key)) { arr.push(key); writeLS(arr); }
}
export function removePendingLS(key: string) {
  writeLS(readLS().filter(k => k !== key));
}
export function listPendingLS(): string[] { return readLS(); }

// Optional “cleanup” to keep state and LS consistent (no timestamps)
export function clearStalePendingKeys(
  current: Set<string>,
  _maxAgeMs: number,
  onStale: (k: string) => void
) {
  const ls = new Set(readLS());
  for (const k of current) { if (!ls.has(k)) onStale(k); }
  for (const k of ls) { if (!current.has(k)) removePendingLS(k); }
}

// ---------- small helpers to detect paid/markers ----------
export function isPaidLite(m: any): boolean {
  return !!(m?.paymentTxHash || m?.paid === true || String(m?.status || '').toLowerCase() === 'paid');
}
export function hasSafeMarkerLite(m: any): boolean {
  // allow any of these to mark a “safe-queued/safe-paid” state
  return !!(m?.safeTxHash || m?.safeQueued || m?.safeSubmitted);
}
