// src/lib/milestonePaymentState.ts

// Approved/completed gate (aka “milestone ready to pay”)
export function isApproved(m: any): boolean {
  const s = String(m?.status ?? '').toLowerCase();
  return !!(
    m?.approved === true ||
    m?.completed === true ||
    s === 'approved' ||
    s === 'completed' ||
    s === 'complete'
  );
}

// Final “PAID” detector
export function isPaid(m: any): boolean {
  if (!m) return false;

  const status     = String(m?.status ?? '').toLowerCase();
  const payStatus  = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();
  const safeStatus = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  const raw        = JSON.stringify(m || {}).toLowerCase();

  return !!(
    // canonical tx markers
    m?.paymentTxHash || m?.payment_tx_hash ||
    m?.safePaymentTxHash || m?.safe_payment_tx_hash ||
    m?.txHash || m?.tx_hash ||
    m?.paymentDate || m?.payment_date ||
    m?.paidAt || m?.paid_at ||
    m?.paid === true || m?.isPaid === true ||
    m?.hash /* legacy */ ||

    // server status flags
    ['paid','executed','complete','completed','released','success'].includes(status) ||
    ['released','success','paid','completed','complete'].includes(payStatus) ||
    ['executed','success','released'].includes(safeStatus) ||

    // JSON blob variants (be liberal)
    raw.includes('"payment_status":"released"') ||
    raw.includes('"payment_status":"success"') ||
    raw.includes('"payment_status":"paid"')
  );
}

// Any SAFE signal that means “in flight” (but only if not already paid)
export function hasSafeMarker(m: any): boolean {
  if (!m) return false;
  if (isPaid(m)) return false; // once paid, do NOT treat as in-flight

  const s   = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  const ps  = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();
  const raw = JSON.stringify(m || {}).toLowerCase();

  const inflightRegex =
    /(queued|pending|submitted|awaiting|awaiting_exec|awaiting-exec|awaiting_execution|waiting|proposed)/;

  const any =
    m?.paymentPending ||
    m?.safeTxHash || m?.safe_tx_hash ||
    m?.safeNonce || m?.safe_nonce ||
    // note: if safePaymentTxHash/safeExecutedAt exist, isPaid() would already be true and we'd have returned above
    inflightRegex.test(s) ||
    inflightRegex.test(ps) ||
    /"safe_(status|tx_hash|nonce)"\s*:\s*"(queued|pending|submitted|awaiting|awaiting_exec|awaiting-exec|awaiting_execution|waiting|proposed)"/.test(raw) ||
    /gnosis/.test(raw);

  return !!any;
}

// UI-level pending: show chip & hide buttons while in flight or locally queued
export function isPaymentPending(m: any, localPending?: boolean): boolean {
  return !isPaid(m) && (!!localPending || hasSafeMarker(m));
}

// Button visibility for “Release Payment”
export function canShowPayButtons(
  m: any,
  opts?: { approved?: boolean; localPending?: boolean }
): boolean {
  const approved = typeof opts?.approved === 'boolean' ? opts.approved : isApproved(m);
  const localPending = !!opts?.localPending;
  return approved && !isPaid(m) && !isPaymentPending(m, localPending);
}
