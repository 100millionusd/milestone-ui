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

  const status = String(m?.status ?? '').toLowerCase();
  const payStatus = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();

  // Check if backend marked it as paid after reconciliation
  if (m?.paid === true) {
    return true;
  }

  // Check if paymentTxHash is set (this happens after reconciliation)
  if (m?.paymentTxHash || m?.payment_tx_hash) {
    return true;
  }

  // Check if status is 'released' (what your reconciliation sets)
  if (status === 'released') {
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

  // Check if we have a Safe transaction hash but payment isn't completed yet
  const hasSafeHash = !!(m?.safeTxHash || m?.safe_tx_hash);
  
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
  return approved && !isPaid(m) && !isPaymentPending(m, localPending);
}