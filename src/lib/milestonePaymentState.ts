// src/lib/milestonePaymentState.ts

export function isPaidMs(m: any): boolean {
  if (!m) return false;
  const status = String(m?.status ?? '').toLowerCase();
  const raw = JSON.stringify(m || {}).toLowerCase();

  return !!(
    m?.paymentTxHash || m?.payment_tx_hash ||
    m?.safePaymentTxHash || m?.safe_payment_tx_hash ||
    m?.paymentDate || m?.payment_date ||
    m?.txHash || m?.tx_hash ||
    m?.paidAt || m?.paid_at ||
    m?.paid === true || m?.isPaid === true ||
    status === 'paid' || status === 'executed' || status === 'complete' ||
    status === 'completed' || status === 'released' ||
    raw.includes('"payment_status":"released"') ||
    m?.hash // legacy fallback
  );
}

export function hasSafeMarkerMs(m: any): boolean {
  if (!m) return false;

  const s = String(
    m?.safeStatus ?? m?.safe_status ?? m?.paymentStatus ?? m?.payment_status ?? ''
  ).toLowerCase();

  if (
    m?.paymentPending ||
    m?.safeTxHash || m?.safe_tx_hash ||
    m?.safePaymentTxHash || m?.safe_payment_tx_hash ||
    m?.safeNonce || m?.safe_nonce ||
    m?.safeExecutedAt || m?.safe_executed_at ||
    (s && /queued|pending|submitted|awaiting|awaiting_exec|executed|success|released/.test(s))
  ) return true;

  const raw = JSON.stringify(m || {}).toLowerCase();
  return raw.includes('"safe') || raw.includes('gnosis');
}

export function canShowPayButtons(opts: {
  approved: boolean;
  milestone: any;
  localPending: boolean;
}) {
  const { approved, milestone, localPending } = opts;
  return approved && !isPaidMs(milestone) && !hasSafeMarkerMs(milestone) && !localPending;
}
