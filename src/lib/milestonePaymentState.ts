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

  console.log('isPaid check:', {
    milestone: m?.name,
    paid: m?.paid,
    isPaid: m?.isPaid,
    paymentTxHash: m?.paymentTxHash,
    safeTxHash: m?.safeTxHash,
    status: status,
    paymentStatus: payStatus,
    paymentDate: m?.paymentDate
  });

  // Strong explicit flags or fields - these indicate payment is COMPLETE
  if (
    m?.paid === true ||
    m?.isPaid === true ||
    m?.released === true ||
    !!(m?.paymentTxHash || m?.payment_tx_hash) || // This is set when reconciliation marks as 'released'
    !!(m?.paymentDate || m?.payment_date) ||
    !!(m?.paidAt || m?.paid_at) ||
    status === 'released' || // Backend sets this after reconciliation
    payStatus === 'released' // Backend sets this after reconciliation
  ) {
    console.log('isPaid: TRUE - Found payment indicator');
    return true;
  }

  const finals = new Set(['paid', 'executed', 'complete', 'completed', 'released', 'success']);
  if (finals.has(status) || finals.has(payStatus)) {
    console.log('isPaid: TRUE - Final status found');
    return true;
  }

  // JSON fallbacks
  try {
    const raw = JSON.stringify(m || {}).toLowerCase();
    if (/"payment_status"\s*:\s*"released"/.test(raw)) return true;
    if (/"status"\s*:\s*"(paid|executed|complete|completed|released|success)"/.test(raw)) return true;
  } catch {}

  console.log('isPaid: FALSE - No payment indicators found');
  return false;
}

// Any SAFE signal that means "in flight" - checks for pending Safe transactions
export function hasSafeMarker(m: any): boolean {
  if (!m) return false;
  
  // If already paid, no safe marker
  if (isPaid(m)) {
    console.log('hasSafeMarker: FALSE - Already paid');
    return false;
  }

  const s = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  const ps = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();

  console.log('hasSafeMarker check:', {
    milestone: m?.name,
    safeStatus: s,
    paymentStatus: ps,
    safeTxHash: m?.safeTxHash,
    paymentPending: m?.paymentPending
  });

  // Check if we have a pending Safe transaction
  const hasPendingSafe = 
    m?.paymentPending === true ||
    ps === 'pending' ||
    s === 'pending' ||
    !!(m?.safeTxHash || m?.safe_tx_hash); // Safe transaction exists but not yet executed

  console.log('hasSafeMarker result:', hasPendingSafe);
  return hasPendingSafe;
}

// UI-level pending: show chip & hide buttons while in flight or locally queued
export function isPaymentPending(m: any, localPending?: boolean): boolean {
  const pending = !isPaid(m) && (!!localPending || hasSafeMarker(m));
  console.log('isPaymentPending:', { 
    milestone: m?.name, 
    isPaid: isPaid(m), 
    localPending, 
    hasSafeMarker: hasSafeMarker(m), 
    result: pending 
  });
  return pending;
}

// Button visibility for Pay actions (manual or SAFE)
export function canShowPayButtons(
  m: any,
  opts?: { approved?: boolean; localPending?: boolean }
): boolean {
  const approved = typeof opts?.approved === 'boolean' ? opts.approved : isApproved(m);
  const localPending = !!opts?.localPending;
  const canShow = approved && !isPaid(m) && !isPaymentPending(m, localPending);
  console.log('canShowPayButtons:', { milestone: m?.name, approved, isPaid: isPaid(m), isPaymentPending: isPaymentPending(m, localPending), result: canShow });
  return canShow;
}