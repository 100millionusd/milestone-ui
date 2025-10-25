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
// Includes: paymentTxHash/safePaymentTxHash/txHash/paymentDate/paidAt,
//           paid/isPaid/released booleans,
//           status or payment_status in {paid, executed, complete, completed, released, success},
//           or JSON blob containing "payment_status":"released" (or executed).
export function isPaid(m: any): boolean {
  if (!m) return false;

  const status = String(m?.status ?? '').toLowerCase();
  const payStatus = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();
  const safeStatus = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();

  // Strong explicit flags or fields
  if (
    m?.paid === true ||
    m?.isPaid === true ||
    m?.released === true ||
    !!(m?.paymentTxHash || m?.payment_tx_hash) ||
    !!(m?.safePaymentTxHash || m?.safe_payment_tx_hash) ||
    !!(m?.txHash || m?.tx_hash) ||
    !!(m?.paymentDate || m?.payment_date) ||
    !!(m?.paidAt || m?.paid_at) ||
    !!(m?.safeExecutedAt || m?.safe_executed_at)
  ) {
    return true;
  }

  const finals = new Set(['paid', 'executed', 'complete', 'completed', 'released', 'success']);
  if (finals.has(status) || finals.has(payStatus) || finals.has(safeStatus)) return true;

  // JSON fallbacks
  try {
    const raw = JSON.stringify(m || {}).toLowerCase();
    if (/"payment_status"\s*:\s*"released"/.test(raw)) return true;
    if (/"payment_status"\s*:\s*"executed"/.test(raw)) return true;
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
  const raw = JSON.stringify(m || {}).toLowerCase();

  // Only pre-execution stages are in-flight
  const inflightRegex =
    /(queued|pending|submitted|awaiting|awaiting_exec|awaiting-exec|awaiting_execution|waiting|proposed)/;

  const any =
    m?.paymentPending ||
    m?.safeTxHash || m?.safe_tx_hash || // proposed/queued but not executed
    m?.safeNonce || m?.safe_nonce ||
    inflightRegex.test(s) ||
    inflightRegex.test(ps) ||
    /"safe_status"\s*:\s*"(queued|pending|submitted|awaiting|awaiting_exec|awaiting-exec|awaiting_execution|waiting|proposed)"/.test(raw) ||
    /"payment_status"\s*:\s*"(queued|pending|submitted|awaiting|awaiting_exec|awaiting-exec|awaiting_execution|waiting|proposed)"/.test(raw) ||
    // Broad fallback: any SAFE/Gnosis hint in raw blob while not in a final state
    // (final states are already caught by isPaid(...) above)
    /\bgnosis\b/.test(raw) || /\bsafe\b/.test(raw);

  return !!any;
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
