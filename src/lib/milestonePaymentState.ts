// src/lib/milestonePaymentState.ts
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

export function isPaid(m: any): boolean {
  if (!m) return false;
  if (m?.paid === true || m?.isPaid === true) return true;
  if (
    m?.paymentTxHash || m?.payment_tx_hash ||
    m?.safePaymentTxHash || m?.safe_payment_tx_hash ||
    m?.txHash || m?.tx_hash
  ) return true;
  if (m?.paymentDate || m?.payment_date || m?.paidAt || m?.paid_at) return true;

  const status = String(m?.status ?? '').toLowerCase();
  const payStatus = String(m?.paymentStatus ?? m?.payment_status ?? '').toLowerCase();

  // Treat executed/complete as paid (your prior working behavior)
  if (['paid', 'released', 'executed', 'complete', 'completed'].includes(status)) return true;
  if (['paid', 'released', 'executed'].includes(payStatus)) return true;

  return false;
}

export function hasSafeMarker(m: any): boolean {
  if (!m) return false;
  if (isPaid(m)) return false;
  const hasSafeHash = !!(m?.safeTxHash || m?.safe_tx_hash || m?.safeNonce || m?.safe_nonce);
  const hasSafePaymentHash = !!(m?.safePaymentTxHash || m?.safe_payment_tx_hash);
  if (hasSafePaymentHash) return true;
  const safeStatus = String(m?.safeStatus ?? m?.safe_status ?? '').toLowerCase();
  const pending = new Set(['proposed','queued','pending','submitted','awaiting','awaiting_exec','needs_signatures','next']);
  if (safeStatus && pending.has(safeStatus)) return true;
  return hasSafeHash;
}

export function isPaymentPending(m: any, localPending?: boolean): boolean {
  return !isPaid(m) && (!!localPending || hasSafeMarker(m));
}

export function canShowPayButtons(
  m: any,
  opts?: { approved?: boolean; localPending?: boolean }
): boolean {
  const approved = typeof opts?.approved === 'boolean' ? opts.approved : isApproved(m);
  const localPending = !!opts?.localPending;
  return approved && !isPaid(m) && !hasSafeMarker(m) && !localPending;
}
