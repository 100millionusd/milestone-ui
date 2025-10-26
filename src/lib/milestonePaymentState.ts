// src/lib/milestonePaymentState.ts

// Approved/completed gate (aka "milestone ready to pay")
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

/**
 * Final "PAID" detector.
 *
 * Important adjustments:
 * - DO NOT treat 'executed' (Safe) as paid; we wait for server reconciliation.
 * - DO NOT treat 'complete'/'completed' as paid; that’s approval/completion, not payment.
 */
export function isPaid(m: any): boolean {
  if (!m) return false;

  // Strong booleans
  if (m?.paid === true || m?.isPaid === true) return true;

  // Any explicit tx hash (EOA or Safe) means paid on-chain (server may lag, but this is authoritative)
  if (
    m?.paymentTxHash ||
    m?.payment_tx_hash ||
    m?.safePaymentTxHash ||
    m?.safe_payment_tx_hash ||
    m?.txHash ||
    m?.tx_hash
  ) {
    return true;
  }

  // Any explicit payment date flags as paid
  if (m?.paymentDate || m?.payment_date || m?.paidAt || m?.paid_at) return true;

  // Status fields
  const status = String(m?.status ?? '').toLowerCase();
  const payStatus = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();

  // Treat only true payment states as paid
  if (['paid', 'released', 'settled'].includes(status)) return true;
  if (['paid', 'released', 'settled'].includes(payStatus)) return true;

  // NOTE: deliberately NOT treating 'executed' as paid (Safe exec pending reconciliation)
  // NOTE: deliberately NOT treating 'complete'/'completed' as paid

  return false;
}

/**
 * Detects if a Safe payment is in-flight (created/submitted/queued/executed but not reconciled).
 * If already paid (per isPaid), returns false.
 */
export function hasSafeMarker(m: any): boolean {
  if (!m) return false;

  // If already paid, no in-flight marker
  if (isPaid(m)) return false;

  // Safe signals
  const hasSafeHash = !!(m?.safeTxHash || m?.safe_tx_hash || m?.safeNonce || m?.safe_nonce);
  const hasSafePaymentHash = !!(m?.safePaymentTxHash || m?.safe_payment_tx_hash);

  // If a Safe payment hash exists but we're not paid yet, it's in-flight
  if (hasSafePaymentHash && !isPaid(m)) return true;

  // Safe status text
  const safeStatus = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();

  // Treat these as in-flight (NOT final paid)
  const safeStatusPending = new Set([
    'proposed',
    'queued',
    'pending',
    'submitted',
    'awaiting',
    'awaiting_exec',
    'needs_signatures',
    'next',
    'executed', // executed on Safe, but backend may not have reconciled → still show pending
  ]);

  if (safeStatus && safeStatusPending.has(safeStatus)) return true;

  // Any Safe indicator + not paid ⇒ likely in-flight
  return hasSafeHash && !isPaid(m);
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

  // Only show buttons if: approved AND not paid AND not in-flight AND not locally pending
  return approved && !isPaid(m) && !hasSafeMarker(m) && !localPending;
}
