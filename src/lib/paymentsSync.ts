// src/lib/paymentsSync.ts

// ---- One channel everywhere ----
const CH_NAME = 'mx-payments';
let _ch: BroadcastChannel | null = null;

export function openPaymentsChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
  if (!_ch) {
    try { _ch = new BroadcastChannel(CH_NAME); } catch { _ch = null; }
  }
  return _ch;
}

type PaymentsMsg =
  | { type: 'mx:pay:queued'; bidId: number; milestoneIndex: number }
  | { type: 'mx:pay:done';   bidId: number; milestoneIndex: number };

export function onPaymentsMessage(
  channel: BroadcastChannel,
  handler: (msg: PaymentsMsg) => void
): () => void {
  const fn = (e: MessageEvent) => {
    const m = e?.data;
    if (!m || typeof m !== 'object') return;
    const t = (m as any).type;
    if (t === 'mx:pay:queued' || t === 'mx:pay:done') handler(m as PaymentsMsg);
  };
  channel.addEventListener('message', fn);
  return () => channel.removeEventListener('message', fn);
}

function ch(): BroadcastChannel | null { return openPaymentsChannel(); }

export function postQueued(bidId: number, milestoneIndex: number) {
  try { ch()?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex } as PaymentsMsg); } catch {}
}
export function postDone(bidId: number, milestoneIndex: number) {
  try { ch()?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex } as PaymentsMsg); } catch {}
}

// ---- Keys + LocalStorage with timestamps ----
export const mkKey2 = (bidId: number, milestoneIndex: number) => `${bidId}-${milestoneIndex}`;

const PENDING_KEYS = 'mx_pay_pending_keys';
const PENDING_TS_PREFIX = 'mx_pay_pending_ts:';

function readKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(PENDING_KEYS);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function writeKeys(s: Set<string>) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PENDING_KEYS, JSON.stringify(Array.from(s))); } catch {}
}

export function addPendingLS(key: string) {
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, String(Date.now())); } catch {}
  }
  const s = readKeys();
  s.add(key);
  writeKeys(s);
}
export function removePendingLS(key: string) {
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`); } catch {}
  }
  const s = readKeys();
  if (s.delete(key)) writeKeys(s);
}
export function listPendingLS(): string[] {
  return Array.from(readKeys());
}

/** TTL cleanup helper */
export function clearStalePendingKeys(
  stateSet: Set<string>,
  maxAgeMs: number,
  onStale?: (k: string) => void
) {
  const now = Date.now();
  const union = new Set([...listPendingLS(), ...Array.from(stateSet || [])]);

  union.forEach((k) => {
    try {
      const tsRaw = typeof window !== 'undefined' ? localStorage.getItem(`${PENDING_TS_PREFIX}${k}`) : null;
      const ts = tsRaw ? Number(tsRaw) : 0;
      if (!ts || now - ts > maxAgeMs) {
        removePendingLS(k);
        onStale?.(k);
      }
    } catch {}
  });
}

// ---- Lightweight milestone state checks (shared) ----
export function isPaidLite(m: any): boolean {
  const status = String(m?.status ?? '').toLowerCase();
  return !!(
    m?.paymentTxHash || m?.payment_tx_hash ||
    m?.paymentDate   || m?.payment_date   ||
    m?.txHash        || m?.tx_hash        ||
    m?.paidAt        || m?.paid_at        ||
    m?.paid === true || m?.isPaid === true ||
    status === 'paid' || status === 'executed' || status === 'complete' || status === 'completed' ||
    m?.hash
  );
}
export function hasSafeMarkerLite(m: any): boolean {
  if (!m) return false;
  const s = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  const direct =
    m?.safeTxHash || m?.safe_tx_hash ||
    m?.safePaymentTxHash || m?.safe_payment_tx_hash ||
    m?.safeNonce || m?.safe_nonce ||
    m?.safeExecutedAt || m?.safe_executed_at ||
    (s && ['queued','pending','submitted','awaiting_exec','success','executed'].includes(s));
  if (direct) return true;
  const raw = JSON.stringify(m).toLowerCase();
  return raw.includes('"safe') || raw.includes('gnosis');
}
