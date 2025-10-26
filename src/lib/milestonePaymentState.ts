// milestonePaymentState.ts
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

// Final "PAID" detector: treat as paid if any strong indicator is present.
export function isPaid(m: any): boolean {
  if (!m) return false;

  // Check boolean flags
  if (m?.paid === true || m?.isPaid === true) {
    return true;
  }

  // Check transaction hashes (both manual and Safe)
  if (m?.paymentTxHash || m?.payment_tx_hash || m?.safePaymentTxHash || m?.safe_payment_tx_hash || m?.txHash || m?.tx_hash) {
    return true;
  }

  // Check payment dates
  if (m?.paymentDate || m?.payment_date || m?.paidAt || m?.paid_at) {
    return true;
  }

  // Check status values
  const status = String(m?.status ?? '').toLowerCase();
  const payStatus = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();

  if (['paid', 'executed', 'complete', 'completed', 'released'].includes(status)) {
    return true;
  }

  if (payStatus === 'released' || payStatus === 'paid' || payStatus === 'executed') {
    return true;
  }

  return false;
}

// Check if payment is pending (Safe transaction created but not executed)
export function hasSafeMarker(m: any): boolean {
  if (!m) return false;
  
  // If already paid, no safe marker
  if (isPaid(m)) {
    return false;
  }

  // Check for Safe transaction indicators
  const hasSafeHash = !!(m?.safeTxHash || m?.safe_tx_hash || m?.safeNonce || m?.safe_nonce);
  const hasSafePaymentHash = !!(m?.safePaymentTxHash || m?.safe_payment_tx_hash);
  
  // If we have a Safe payment hash but it's not paid yet, it's in-flight
  if (hasSafePaymentHash && !isPaid(m)) {
    return true;
  }

  // Check Safe status
  const safeStatus = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  const safeStatusPending = ['queued', 'pending', 'submitted', 'awaiting', 'awaiting_exec', 'executed'].includes(safeStatus);

  // If we have any Safe indicator and it's not paid, it's in-flight
  return (hasSafeHash || safeStatusPending) && !isPaid(m);
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