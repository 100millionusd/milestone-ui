// src/lib/milestonePaymentState.ts

export type Milestone = Record<string, any>;

const yes = (v: any) => v === true || v === 'true' || v === 1 || v === '1';

function low(v: any) {
  return String(v ?? '').trim().toLowerCase();
}

/**
 * Paid signals (ANY of these means paid):
 * - paymentTxHash / payment_tx_hash
 * - safePaymentTxHash / safe_payment_tx_hash
 * - paymentDate / payment_date
 * - txHash / tx_hash
 * - paidAt / paid_at
 * - paid === true / isPaid === true
 * - status in ['paid','executed','complete','completed','released','success']
 * - JSON blob contains "payment_status":"released"
 */
export function isPaidMs(m: Milestone | null | undefined): boolean {
  if (!m) return false;

  const status =
    low(m.status) ||
    low(m.paymentStatus) ||
    low(m.payment_status) ||
    low(m.safeStatus) ||
    low(m.safe_status);

  const raw = JSON.stringify(m || {}).toLowerCase();

  const anyHash =
    m.paymentTxHash ||
    m.payment_tx_hash ||
    m.txHash ||
    m.tx_hash ||
    m.safePaymentTxHash ||
    m.safe_payment_tx_hash;

  const anyDate = m.paymentDate || m.payment_date || m.paidAt || m.paid_at;
  const anyFlag = yes(m.paid) || yes(m.isPaid);

  const paidStatus =
    status === 'paid' ||
    status === 'executed' ||
    status === 'complete' ||
    status === 'completed' ||
    status === 'released' ||
    status === 'success'; // some backends return "success" on finalization

  const jsonReleased = /"payment_status"\s*:\s*"released"/.test(raw);

  return !!(anyHash || anyDate || anyFlag || paidStatus || jsonReleased);
}

/**
 * Safe in-flight (NOT paid). Only pre-exec states.
 * Treat queued/pending/submitted/awaiting/awaiting_exec as in-flight,
 * plus early safe markers (nonce/tx), but NEVER when isPaidMs(m) is true.
 */
export function isSafeInFlight(m: Milestone | null | undefined): boolean {
  if (!m) return false;
  if (isPaidMs(m)) return false;

  const status =
    low(m.safeStatus) ||
    low(m.safe_status) ||
    low(m.paymentStatus) ||
    low(m.payment_status);

  const preExec = /queued|pending|submitted|awaiting|awaiting_exec/.test(status);

  const earlyMarkers =
    yes(m.paymentPending) ||
    !!m.safeNonce ||
    !!m.safe_nonce ||
    !!m.safeTxHash ||
    !!m.safe_tx_hash;

  const raw = JSON.stringify(m || {}).toLowerCase();
  const mentionsSafe = raw.includes('"safe') || raw.includes('gnosis');

  return preExec || earlyMarkers || (!status && mentionsSafe);
}

/** Back-compat alias used by some components */
export const hasSafeMarkerMs = isSafeInFlight;

/** Optional: small helper if you like */
export function shouldShowPayButtons(opts: {
  approved: boolean;
  milestone: Milestone;
  localPending: boolean;
}) {
  const { approved, milestone, localPending } = opts;
  return approved && !isPaidMs(milestone) && !isSafeInFlight(milestone) && !localPending;
}
