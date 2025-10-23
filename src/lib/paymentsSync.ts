// src/lib/paymentsSync.ts
// Single source of truth for payment sync + lite helpers

const CH_NAME = 'mx-payments';

type PayMsg =
  | { type: 'mx:pay:queued'; bidId: number; milestoneIndex: number }
  | { type: 'mx:pay:done'; bidId: number; milestoneIndex: number };

// ---- Broadcast Channel ----
export function openPaymentsChannel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CH_NAME);
  } catch {
    return null; // SSR / unsupported env
  }
}

export function onPaymentsMessage(
  ch: BroadcastChannel | null,
  handler: (msg: PayMsg) => void
) {
  if (!ch) return () => {};
  const fn = (ev: MessageEvent) => {
    const m = ev?.data;
    if (!m || (m.type !== 'mx:pay:queued' && m.type !== 'mx:pay:done')) return;
    handler(m);
  };
  ch.addEventListener('message', fn);
  return () => ch.removeEventListener('message', fn);
}

export function postQueued(bidId: number, milestoneIndex: number) {
  try {
    const ch = openPaymentsChannel();
    ch?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex });
    ch?.close();
  } catch {}
}

export function postDone(bidId: number, milestoneIndex: number) {
  try {
    const ch = openPaymentsChannel();
    ch?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex });
    ch?.close();
  } catch {}
}

// ---- Keys + Local Storage mirror ----
const LS_KEY = 'mx:payments:pending';
const TS_KEY = 'mx:payments:pending:ts';
const now = () => Date.now();

export function mkKey2(bidId: number, milestoneIndex: number) {
  return `${Number(bidId)}:${Number(milestoneIndex)}`;
}

export function listPendingLS(): string[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addPendingLS(key: string) {
  try {
    const cur = new Set(listPendingLS());
    cur.add(key);
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(cur)));
    stampPending(key);
  } catch {}
}

export function removePendingLS(key: string) {
  try {
    const cur = new Set(listPendingLS());
    cur.delete(key);
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(cur)));
    const tsRaw = localStorage.getItem(TS_KEY);
    const ts: Record<string, number> = tsRaw ? JSON.parse(tsRaw) : {};
    delete ts[key];
    localStorage.setItem(TS_KEY, JSON.stringify(ts));
  } catch {}
}

// Optional TTL pruning helper
export function clearStalePendingKeys(
  inMem: Set<string>,
  maxAgeMs: number,
  onStale?: (key: string) => void
) {
  try {
    const tsRaw = localStorage.getItem(TS_KEY);
    const ts: Record<string, number> = tsRaw ? JSON.parse(tsRaw) : {};
    const pending = new Set(listPendingLS());
    let changed = false;

    for (const k of Array.from(pending)) {
      const t = ts[k] || 0;
      if (now() - t > maxAgeMs) {
        pending.delete(k);
        delete ts[k];
        inMem.delete(k);
        onStale?.(k);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(LS_KEY, JSON.stringify(Array.from(pending)));
      localStorage.setItem(TS_KEY, JSON.stringify(ts));
    }
  } catch {}
}

function stampPending(key: string) {
  try {
    const tsRaw = localStorage.getItem(TS_KEY);
    const ts: Record<string, number> = tsRaw ? JSON.parse(tsRaw) : {};
    ts[key] = now();
    localStorage.setItem(TS_KEY, JSON.stringify(ts));
  } catch {}
}

// ---- Lite milestone helpers ----
export function isPaidLite(m: any): boolean {
  return !!(m?.paymentTxHash || m?.txHash || m?.hash || m?.status === 'paid');
}

export function hasSafeMarkerLite(m: any): boolean {
  // Markers your backend sets when a Safe tx is queued/mined
  return !!(m?.paymentPending || m?.safeTxHash || m?.safeMarker);
}
