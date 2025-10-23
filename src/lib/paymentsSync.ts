// src/lib/paymentsSync.ts
export type PayMsg =
  | { type: 'mx:pay:queued'; bidId: number; milestoneIndex: number }
  | { type: 'mx:pay:done';   bidId: number; milestoneIndex: number };

export const PAYMENTS_CHANNEL = 'mx-payments';
const PENDING_TS_PREFIX = 'mx_pay_pending_ts:';

export const mkKey2 = (bidId: number, idx: number) => `${bidId}-${idx}`;

export function openPaymentsChannel(): BroadcastChannel | null {
  try {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
    return new BroadcastChannel(PAYMENTS_CHANNEL);
  } catch {
    return null;
  }
}

export function postQueued(bidId: number, milestoneIndex: number) {
  try { openPaymentsChannel()?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex } as PayMsg); } catch {}
}
export function postDone(bidId: number, milestoneIndex: number) {
  try { openPaymentsChannel()?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex } as PayMsg); } catch {}
}

export function onPaymentsMessage(
  ch: BroadcastChannel | null,
  handler: (msg: PayMsg) => void
) {
  if (!ch) return () => {};
  const fn = (e: MessageEvent) => {
    const msg = e?.data;
    if (!msg || (msg.type !== 'mx:pay:queued' && msg.type !== 'mx:pay:done')) return;
    if (!Number.isFinite(msg.bidId) || !Number.isFinite(msg.milestoneIndex)) return;
    handler(msg as PayMsg);
  };
  ch.addEventListener('message', fn);
  return () => ch.removeEventListener('message', fn);
}

// -------- Status detection (supports legacy fields) --------
export function isPaidLite(m: any): boolean {
  const s = String(m?.status ?? '').toLowerCase();
  return !!(
    m?.paymentTxHash || m?.paymentDate ||
    m?.txHash || m?.hash ||
    m?.paidAt || m?.paid === true ||
    s === 'paid' || s === 'executed' || s === 'complete' || s === 'completed'
  );
}

export function hasSafeMarkerLite(m: any): boolean {
  if (!m) return false;
  const s = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  if (
    m?.safeTxHash || m?.safe_tx_hash ||
    m?.safePaymentTxHash || m?.safe_payment_tx_hash ||
    m?.safeNonce || m?.safe_nonce ||
    m?.safeExecutedAt || m?.safe_executed_at ||
    (s && ['queued','pending','submitted','awaiting_exec','success','executed'].includes(s))
  ) return true;
  const raw = JSON.stringify(m).toLowerCase();
  return raw.includes('"safe') || raw.includes('gnosis');
}

// -------- Pending helpers (localStorage so it persists across tabs) --------
export function addPendingLS(key: string) {
  try { localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, String(Date.now())); } catch {}
}
export function removePendingLS(key: string) {
  try { localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`); } catch {}
}

// Generic poller; caller supplies getBids() + callback to clear pending
export async function pollUntilPaidLite(
  getBidsForProject: () => Promise<any[]>,
  bidId: number,
  milestoneIndex: number,
  onObservedDone: () => void,
  tries = 20,
  intervalMs = 3000
) {
  for (let i = 0; i < tries; i++) {
    try {
      const next = await getBidsForProject();
      const bid = (Array.isArray(next) ? next : []).find(b => Number(b?.bidId) === bidId);
      const m = bid?.milestones?.[milestoneIndex];
      if (m && (isPaidLite(m) || hasSafeMarkerLite(m))) {
        onObservedDone();
        postDone(bidId, milestoneIndex);
        return;
      }
    } catch {}
    await new Promise(r => setTimeout(r, intervalMs));
  }
}
