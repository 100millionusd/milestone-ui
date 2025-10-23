// /src/lib/paymentsSync.ts

// Channel name used by both pages
const CH_NAME = 'mx-payments';

// LocalStorage timestamp prefix to TTL local "pending" flags
const P_TS = 'mx_pay_pending_ts:';

export type PayMsg =
  | { type: 'mx:pay:queued'; bidId: number; milestoneIndex: number }
  | { type: 'mx:pay:done';   bidId: number; milestoneIndex: number };

export function mkKey2(bidId: number, milestoneIndex: number) {
  return `${bidId}-${milestoneIndex}`;
}

// ---- Broadcast helpers ----
export function openPaymentsChannel(): BroadcastChannel | null {
  try {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
    return new BroadcastChannel(CH_NAME);
  } catch {
    return null;
  }
}

export function onPaymentsMessage(
  ch: BroadcastChannel | null,
  cb: (msg: PayMsg) => void
) {
  if (!ch) return () => {};
  const handler = (e: MessageEvent) => {
    const d = e?.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'mx:pay:queued' || d.type === 'mx:pay:done') cb(d as PayMsg);
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

export function postQueued(bidId: number, milestoneIndex: number) {
  try {
    const ch = openPaymentsChannel();
    ch?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex } as PayMsg);
    ch?.close();
  } catch {}
}

export function postDone(bidId: number, milestoneIndex: number) {
  try {
    const ch = openPaymentsChannel();
    ch?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex } as PayMsg);
    ch?.close();
  } catch {}
}

// ---- Pending persistence (timestamp per key) ----
export function addPendingLS(key: string) {
  try { if (typeof window !== 'undefined') localStorage.setItem(P_TS + key, String(Date.now())); } catch {}
}

export function removePendingLS(key: string) {
  try { if (typeof window !== 'undefined') localStorage.removeItem(P_TS + key); } catch {}
}

export function listPendingLS(): string[] {
  try {
    if (typeof window === 'undefined') return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(P_TS)) {
        keys.push(key.replace(P_TS, ''));
      }
    }
    return keys;
  } catch {
    return [];
  }
}

/** TTL sweep of local "pending" keys */
export function clearStalePendingKeys(
  inMemory: Set<string>,
  maxAgeMs: number,
  onStale: (staleKey: string) => void
) {
  try {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    for (const key of Array.from(inMemory)) {
      const tsRaw = localStorage.getItem(P_TS + key);
      const ts = tsRaw ? Number(tsRaw) : 0;
      if (!ts || now - ts > maxAgeMs) {
        onStale(key);
        localStorage.removeItem(P_TS + key);
      }
    }
  } catch {}
}

// ---- Polling helper ----
export async function pollUntilPaidLite(
  fetchBids: () => Promise<any[]>,
  bidId: number,
  milestoneIndex: number,
  onDone: () => void,
  tries = 20,
  intervalMs = 3000
) {
  const key = mkKey2(bidId, milestoneIndex);
  
  for (let i = 0; i < tries; i++) {
    try {
      const bids = await fetchBids();
      const bid = bids.find(b => Number(b.bidId) === bidId);
      const m = bid?.milestones?.[milestoneIndex];
      
      if (m && (isPaidLite(m) || hasSafeMarkerLite(m))) {
        onDone();
        return;
      }
    } catch (err: any) {
      // If we lost auth, stop polling
      if (err?.status === 401 || err?.status === 403) {
        onDone();
        return;
      }
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  
  // Final attempt
  try {
    const bids = await fetchBids();
    const bid = bids.find(b => Number(b.bidId) === bidId);
    const m = bid?.milestones?.[milestoneIndex];
    
    if (m && (isPaidLite(m) || hasSafeMarkerLite(m))) {
      onDone();
    }
  } catch {
    // Ignore final attempt errors
  }
}

// ---- Lightweight milestone state probes (no schema assumptions) ----
export function isPaidLite(m: any): boolean {
  const status = String(m?.status ?? '').toLowerCase();
  return !!(
    m?.paymentTxHash || m?.payment_tx_hash ||
    m?.paymentDate   || m?.payment_date   ||
    m?.txHash        || m?.tx_hash        ||
    m?.paidAt        || m?.paid_at        ||
    m?.paid === true || m?.isPaid === true ||
    status === 'paid' || status === 'executed' || status === 'complete' || status === 'completed' ||
    m?.hash // legacy
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

  // fallback sniff
  try {
    const raw = JSON.stringify(m).toLowerCase();
    return raw.includes('"safe') || raw.includes('gnosis');
  } catch {
    return false;
  }
}