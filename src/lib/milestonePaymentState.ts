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

// Final “PAID” detector: treat as paid if any strong indicator is present.
export function isPaid(m: any): boolean {
  if (!m) return false;

  const status     = String(m?.status ?? '').toLowerCase();
  const payStatus  = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();
  const safeStatus = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();

  // Strong explicit fields/flags
  if (
    m?.paid === true ||
    m?.isPaid === true ||
    m?.released === true ||
    !!(m?.paymentTxHash || m?.payment_tx_hash) ||
    !!(m?.safePaymentTxHash || m?.safe_payment_tx_hash) ||
    !!(m?.txHash || m?.tx_hash) ||
    !!(m?.paymentDate || m?.payment_date) ||
    !!(m?.paidAt || m?.paid_at) ||
    !!(m?.safeExecutedAt || m?.safe_executed_at) ||
    !!m?.hash // legacy
  ) {
    return true;
  }

  // Final states from any of the status fields
  const finals = new Set(['paid','executed','complete','completed','released','success']);
  if (finals.has(status) || finals.has(payStatus) || finals.has(safeStatus)) return true;

  // JSON fallbacks (when server squirts raw blobs)
  try {
    const raw = JSON.stringify(m || {}).toLowerCase();
    if (/"payment_status"\s*:\s*"(released|success|paid|completed|complete)"/.test(raw)) return true;
    if (/"safe_status"\s*:\s*"(executed|released|success|paid)"/.test(raw)) return true;
    if (/"status"\s*:\s*"(paid|executed|complete|completed|released|success)"/.test(raw)) return true;
  } catch {}

  return false;
}

// Any SAFE signal that means “in flight” (but only if not already paid)
export function hasSafeMarker(m: any): boolean {
  if (!m) return false;
  if (isPaid(m)) return false; // once paid, do NOT treat as in-flight

  const s   = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  const ps  = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();

  // Only pre-execution stages are in-flight
  const inflightRegex =
    /(queued|pending|submitted|awaiting|awaiting_exec|awaiting-exec|awaiting_execution|waiting|proposed)/;

  if (inflightRegex.test(s) || inflightRegex.test(ps)) return true;

  // Low-signal markers (proposed/queued but not executed)
  if (m?.paymentPending || m?.safeTxHash || m?.safe_tx_hash || m?.safeNonce || m?.safe_nonce) {
    return true;
  }

  // JSON blob variants (only match inflight words)
  try {
    const raw = JSON.stringify(m || {}).toLowerCase();
    if (/"safe_status"\s*:\s*"(queued|pending|submitted|awaiting|awaiting_exec|awaiting-exec|awaiting_execution|waiting|proposed)"/.test(raw)) return true;
    if (/"payment_status"\s*:\s*"(queued|pending|submitted|awaiting|awaiting_exec|awaiting-exec|awaiting_execution|waiting|proposed)"/.test(raw)) return true;
  } catch {}

  return false;
}

// UI-level pending: show chip & hide buttons while in flight or locally queued
export function isPaymentPending(m: any, localPending?: boolean): boolean {
  return !isPaid(m) && (!!localPending || hasSafeMarker(m));
}

// Button visibility for Pay actions (manual or SAFE)
export function canShowPayButtons(
  m: any,
  opts?: { approved?: boolean; localPending?: boolean }
): boolean {
  const approved = typeof opts?.approved === 'boolean' ? opts.approved : isApproved(m);
  const localPending = !!opts?.localPending;
  return approved && !isPaid(m) && !isPaymentPending(m, localPending);
}
