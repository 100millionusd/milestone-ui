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
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      console.warn('BroadcastChannel not supported');
      return null;
    }
    const channel = new BroadcastChannel(CH_NAME);
    console.log('BroadcastChannel opened:', CH_NAME);
    return channel;
  } catch (error) {
    console.error('Failed to open BroadcastChannel:', error);
    return null;
  }
}

export function onPaymentsMessage(
  ch: BroadcastChannel | null,
  cb: (msg: PayMsg) => void
) {
  if (!ch) return () => {};
  const handler = (e: MessageEvent) => {
    console.log('BroadcastChannel message received:', e.data);
    const d = e?.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'mx:pay:queued' || d.type === 'mx:pay:done') {
      cb(d as PayMsg);
    }
  };
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

export function postQueued(bidId: number, milestoneIndex: number) {
  console.log('postQueued:', { bidId, milestoneIndex });
  try {
    const ch = openPaymentsChannel();
    const msg = { type: 'mx:pay:queued', bidId, milestoneIndex } as PayMsg;
    ch?.postMessage(msg);
    console.log('Message posted:', msg);
    // Don't close immediately - let it handle the message
    setTimeout(() => {
      try { ch?.close(); } catch {}
    }, 100);
  } catch (error) {
    console.error('postQueued failed:', error);
  }
}

export function postDone(bidId: number, milestoneIndex: number) {
  console.log('postDone:', { bidId, milestoneIndex });
  try {
    const ch = openPaymentsChannel();
    const msg = { type: 'mx:pay:done', bidId, milestoneIndex } as PayMsg;
    ch?.postMessage(msg);
    console.log('Message posted:', msg);
    setTimeout(() => {
      try { ch?.close(); } catch {}
    }, 100);
  } catch (error) {
    console.error('postDone failed:', error);
  }
}

// ---- Pending persistence (timestamp per key) ----
export function addPendingLS(key: string) {
  console.log('addPendingLS:', key);
  try { 
    if (typeof window !== 'undefined') {
      localStorage.setItem(P_TS + key, String(Date.now()));
      console.log('Added to localStorage:', P_TS + key);
    }
  } catch (error) {
    console.error('addPendingLS failed:', error);
  }
}

export function removePendingLS(key: string) {
  console.log('removePendingLS:', key);
  try { 
    if (typeof window !== 'undefined') {
      localStorage.removeItem(P_TS + key);
      console.log('Removed from localStorage:', P_TS + key);
    }
  } catch (error) {
    console.error('removePendingLS failed:', error);
  }
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
    console.log('listPendingLS found:', keys);
    return keys;
  } catch (error) {
    console.error('listPendingLS failed:', error);
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
        console.log('Clearing stale key:', key);
        onStale(key);
        localStorage.removeItem(P_TS + key);
      }
    }
  } catch (error) {
    console.error('clearStalePendingKeys failed:', error);
  }
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
  console.log('pollUntilPaidLite started:', { bidId, milestoneIndex, key });
  
  for (let i = 0; i < tries; i++) {
    try {
      const bids = await fetchBids();
      const bid = bids.find(b => Number(b.bidId) === bidId);
      const m = bid?.milestones?.[milestoneIndex];
      
      if (m && (isPaidLite(m) || hasSafeMarkerLite(m))) {
        console.log('pollUntilPaidLite: payment detected, calling onDone');
        onDone();
        return;
      }
      console.log(`pollUntilPaidLite: attempt ${i + 1}/${tries} - not paid yet`);
    } catch (err: any) {
      console.error('pollUntilPaidLite error:', err);
      // If we lost auth, stop polling
      if (err?.status === 401 || err?.status === 403) {
        console.log('pollUntilPaidLite: auth error, stopping');
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
      console.log('pollUntilPaidLite: final attempt - payment detected');
      onDone();
    } else {
      console.log('pollUntilPaidLite: final attempt - still not paid, giving up');
    }
  } catch (error) {
    console.error('pollUntilPaidLite final attempt error:', error);
  }
}

// ---- Lightweight milestone state probes (no schema assumptions) ----
export function isPaidLite(m: any): boolean {
  const status = String(m?.status ?? '').toLowerCase();
  const paid = !!(
    m?.paymentTxHash || m?.payment_tx_hash ||
    m?.paymentDate   || m?.payment_date   ||
    m?.txHash        || m?.tx_hash        ||
    m?.paidAt        || m?.paid_at        ||
    m?.paid === true || m?.isPaid === true ||
    status === 'paid' || status === 'executed' || status === 'complete' || status === 'completed' ||
    m?.hash // legacy
  );
  
  if (paid) {
    console.log('isPaidLite: TRUE for milestone', m);
  }
  return paid;
}

export function hasSafeMarkerLite(m: any): boolean {
  if (!m) return false;
  const s = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  const hasSafe = !!(
    m?.safeTxHash || m?.safe_tx_hash ||
    m?.safePaymentTxHash || m?.safe_payment_tx_hash ||
    m?.safeNonce || m?.safe_nonce ||
    m?.safeExecutedAt || m?.safe_executed_at ||
    (s && ['queued','pending','submitted','awaiting_exec','success','executed'].includes(s))
  );

  // fallback sniff
  if (!hasSafe) {
    try {
      const raw = JSON.stringify(m).toLowerCase();
      if (raw.includes('"safe') || raw.includes('gnosis')) {
        console.log('hasSafeMarkerLite: TRUE (fallback) for milestone', m);
        return true;
      }
    } catch {
      return false;
    }
  }
  
  if (hasSafe) {
    console.log('hasSafeMarkerLite: TRUE for milestone', m);
  }
  return hasSafe;
}