// src/lib/milestonePaymentState.ts
export type Milestone = Record<string, any>;
const yes = (v: any) => v === true || v === 'true' || v === 1 || v === '1';
const low = (v: any) => String(v ?? '').trim().toLowerCase();

/** PAID if ANY of these signals exist (covers manual & Safe “released/executed/success”) */
export function isPaidMs(m: Milestone | null | undefined): boolean {
  if (!m) return false;
  const status =
    low(m.status) || low(m.paymentStatus) || low(m.payment_status) ||
    low(m.safeStatus) || low(m.safe_status);
  const raw = JSON.stringify(m || {}).toLowerCase();

  const anyHash =
    m.paymentTxHash || m.payment_tx_hash || m.txHash || m.tx_hash ||
    m.safePaymentTxHash || m.safe_payment_tx_hash;

  const anyDate = m.paymentDate || m.payment_date || m.paidAt || m.paid_at;
  const anyFlag = yes(m.paid) || yes(m.isPaid);
  const statusPaid = ['paid','executed','complete','completed','released','success'].includes(status || '');
  const jsonReleased = /"payment_status"\s*:\s*"released"/.test(raw);

  return !!(anyHash || anyDate || anyFlag || statusPaid || jsonReleased);
}

/** SAFE in-flight = pre-exec states ONLY. Never true once isPaidMs(m) is true. */
export function isSafeInFlight(m: Milestone | null | undefined): boolean {
  if (!m) return false;
  if (isPaidMs(m)) return false; // paid beats everything

  const status =
    low(m.safeStatus) || low(m.safe_status) || low(m.paymentStatus) || low(m.payment_status);

  const preExec = /queued|pending|submitted|awaiting|awaiting_exec/.test(status || '');

  const earlyMarkers =
    yes(m.paymentPending) || !!m.safeNonce || !!m.safe_nonce ||
    !!m.safeTxHash || !!m.safe_tx_hash;

  const raw = JSON.stringify(m || {}).toLowerCase();
  const mentionsSafe = raw.includes('"safe') || raw.includes('gnosis');

  return preExec || earlyMarkers || (!status && mentionsSafe);
}

export function shouldShowPayButtons(opts: {
  approved: boolean;
  milestone: Milestone;
  localPending: boolean;
}) {
  const { approved, milestone, localPending } = opts;
  return approved && !isPaidMs(milestone) && !isSafeInFlight(milestone) && !localPending;
}
