// src/lib/milestonePaymentState.ts

export type Milestone = Record<string, any>;

const LOW = (v: any) => String(v ?? '').trim().toLowerCase();

const PAID_STATUSES = new Set([
  'paid',
  'executed',
  'complete',
  'completed',
  'released',
  'success', // some backends use this
]);

const SAFE_INFLIGHT_REGEX =
  /queued|pending|submitted|awaiting|awaiting_exec|executed|success|released/; // in-flight markers from safe_status

/** True if the milestone has been approved/completed (gate for showing pay buttons). */
export function isApproved(m: Milestone): boolean {
  const s = LOW(m?.status);
  // Treat "completed" as approved; also accept explicit flags.
  return !!(m?.approved === true || m?.completed === true || s === 'completed' || s === 'approved');
}

/** True if the milestone is paid (ANY of the backend signals you listed). */
export function isPaid(m: Milestone): boolean {
  if (!m) return false;

  const statusMain = LOW(m?.status);
  const raw = JSON.stringify(m || {}).toLowerCase();

  const anyHash =
    m?.paymentTxHash ||
    m?.payment_tx_hash ||
    m?.txHash ||
    m?.tx_hash ||
    m?.safePaymentTxHash || // treat Safe tx hash as paid (per spec)
    m?.safe_payment_tx_hash ||
    m?.hash; // legacy

  const anyDate = m?.paymentDate || m?.payment_date || m?.paidAt || m?.paid_at;
  const anyFlag = m?.paid === true || m?.isPaid === true;
  const statusPaid = PAID_STATUSES.has(statusMain);
  const jsonReleased = /"payment_status"\s*:\s*"released"/.test(raw);

  return !!(anyHash || anyDate || anyFlag || statusPaid || jsonReleased);
}

/**
 * True if the milestone shows ANY Safe/Gnosis markers (queued/submitted/executing/etc),
 * but is NOT yet paid. We deliberately ignore these once `isPaid(m)` flips true.
 */
export function hasSafeMarker(m: Milestone): boolean {
  if (!m) return false;
  if (isPaid(m)) return false; // paid wins

  // Prefer explicit safe/payment status fields
  const s =
    LOW(m?.safeStatus) ||
    LOW(m?.safe_status) ||
    LOW(m?.paymentStatus) ||
    LOW(m?.payment_status);

  // Early explicit indicators: queued → executing → executed (until main paid flips)
  const statusSuggestsSafe = !!(s && SAFE_INFLIGHT_REGEX.test(s));

  const explicitFields =
    m?.paymentPending ||
    m?.safeTxHash ||
    m?.safe_tx_hash ||
    m?.safePaymentTxHash || // counts as a Safe marker until backend marks paid
    m?.safe_payment_tx_hash ||
    m?.safeNonce ||
    m?.safe_nonce ||
    m?.safeExecutedAt ||
    m?.safe_executed_at;

  // Fallback: any raw "safe"/"gnosis" mention in the blob
  const raw = JSON.stringify(m || {}).toLowerCase();
  const mentionsSafe = raw.includes('"safe') || raw.includes('gnosis');

  return !!(statusSuggestsSafe || explicitFields || mentionsSafe);
}

/** Convenience: true while NOT paid and either Safe is in-flight or a local pending flag is set. */
export function isPaymentPending(m: Milestone, localPending?: boolean): boolean {
  return !isPaid(m) && (hasSafeMarker(m) || !!localPending);
}

/** Gate for rendering the two pay buttons (manual + Safe). */
export function canShowPayButtons(
  m: Milestone,
  opts?: { approved?: boolean; localPending?: boolean }
): boolean {
  const approved = typeof opts?.approved === 'boolean' ? opts!.approved : isApproved(m);
  return !!approved && !isPaid(m) && !hasSafeMarker(m) && !opts?.localPending;
}

/** One-word state for the row, matching your acceptance criteria. */
export type RowState = 'not_approved' | 'ready_to_pay' | 'payment_pending' | 'paid';
export function deriveRowState(
  m: Milestone,
  opts?: { approved?: boolean; localPending?: boolean }
): RowState {
  if (isPaid(m)) return 'paid';
  const approved = typeof opts?.approved === 'boolean' ? opts!.approved : isApproved(m);
  if (!approved) return 'not_approved';
  if (hasSafeMarker(m) || opts?.localPending) return 'payment_pending';
  return 'ready_to_pay';
}

/** Small helper used in UIs when you need a precomputed bundle. */
export function getPaymentFlags(
  m: Milestone,
  opts?: { approved?: boolean; localPending?: boolean }
) {
  const paid = isPaid(m);
  const approved = typeof opts?.approved === 'boolean' ? opts!.approved : isApproved(m);
  const safeInFlight = !paid && hasSafeMarker(m);
  const pending = !paid && (safeInFlight || !!opts?.localPending);
  const showButtons = !!approved && !paid && !safeInFlight && !opts?.localPending;
  return { paid, approved, safeInFlight, pending, showButtons, state: deriveRowState(m, opts) };
}

export default {
  isApproved,
  isPaid,
  hasSafeMarker,
  isPaymentPending,
  canShowPayButtons,
  deriveRowState,
  getPaymentFlags,
};
