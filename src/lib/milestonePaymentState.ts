// src/lib/milestonePaymentState.ts

// --- helpers ---------------------------------------------------------------

function str(v: any): string {
  return (v ?? '').toString();
}
function lo(v: any): string {
  return str(v).toLowerCase().trim();
}
function hasTruthy(...vals: any[]): boolean {
  return vals.some((v) => v === true || v === 'true' || v === 1);
}
function hasAny(obj: any, keys: string[]): boolean {
  if (!obj || typeof obj !== 'object') return false;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return true;
  }
  return false;
}
function parseMaybeJson(v: any): any | null {
  if (!v) return null;
  if (typeof v === 'object') return v;
  if (typeof v !== 'string') return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}
function textIncludes(v: any, needle: string): boolean {
  const s = lo(v);
  return !!s && s.includes(needle);
}

// --- API per spec ----------------------------------------------------------
//
// PAID iff ANY of these are present (from backend):
// - paymentTxHash / payment_tx_hash
// - paymentDate / payment_date
// - txHash / tx_hash
// - paidAt / paid_at
// - paid === true / isPaid === true
// - status in ['paid','executed','complete','completed','released']  <-- top-level status only
// - JSON blob contains "payment_status":"released"
//
// IMPORTANT: DO NOT treat Safe markers as paid.
// safeTxHash / safePaymentTxHash / safeNonce / safeExecutedAt / safeStatus => IN-FLIGHT ONLY.

export function isApproved(m: any): boolean {
  const s = lo(m?.status);
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

  // booleans
  if (hasTruthy(m?.paid, m?.isPaid)) return true;

  // transaction / date markers (NO SAFE FIELDS HERE!)
  if (
    hasAny(m, [
      'paymentTxHash',
      'payment_tx_hash',
      'txHash',
      'tx_hash',
      'paymentDate',
      'payment_date',
      'paidAt',
      'paid_at',
    ])
  ) {
    return true;
  }

  // top-level status values (NOT safeStatus)
  const status = lo(m?.status);
  if (['paid', 'executed', 'complete', 'completed', 'released'].includes(status)) return true;

  // JSON blob with payment_status: released
  const candidates = [
    m?.payment,
    m?.paymentInfo,
    m?.payment_info,
    m?.meta,
    m?.metadata,
    m?.raw,
    m?.raw_json,
    m?.blob,
  ];

  for (const c of candidates) {
    const j = parseMaybeJson(c);
    if (j && lo(j?.payment_status) === 'released') return true;

    // sometimes nested
    if (j?.payment && lo(j.payment.payment_status) === 'released') return true;
  }

  return false;
}

export function hasSafeMarker(m: any): boolean {
  if (!m) return false;
  if (isPaid(m)) return false; // paid supersedes "in-flight"

  // explicit safe hints => IN-FLIGHT
  const hasHashes =
    !!(m?.safeTxHash || m?.safe_tx_hash || m?.safePaymentTxHash || m?.safe_payment_tx_hash);
  const hasNonce = !!(m?.safeNonce || m?.safe_nonce);
  const hasExecAt = !!m?.safeExecutedAt;

  // "soft" safe status words (still NOT paid)
  const safeStatus = lo(m?.safeStatus ?? m?.safe_status);
  const inflightWords = [
    'queued',
    'pending',
    'submitted',
    'awaiting',
    'awaiting_exec',
    'executed',
    'success',
    'released',
  ]; // executed/released here still ≠ paid
  const hasSafeStatus = inflightWords.includes(safeStatus);

  // raw text cues
  const rawTextCue =
    textIncludes(m?.meta, 'safe') ||
    textIncludes(m?.metadata, 'safe') ||
    textIncludes(m?.raw, 'safe') ||
    textIncludes(m?.blob, 'safe') ||
    textIncludes(m?.meta, 'gnosis') ||
    textIncludes(m?.metadata, 'gnosis') ||
    textIncludes(m?.raw, 'gnosis') ||
    textIncludes(m?.blob, 'gnosis');

  return hasHashes || hasNonce || hasExecAt || hasSafeStatus || rawTextCue;
}

export function isPaymentPending(m: any, localPending?: boolean): boolean {
  return !isPaid(m) && (!!localPending || hasSafeMarker(m));
}

export function canShowPayButtons(
  m: any,
  opts?: { approved?: boolean; localPending?: boolean }
): boolean {
  const approved = typeof opts?.approved === 'boolean' ? opts.approved : isApproved(m);
  const local = !!opts?.localPending;
  return approved && !isPaid(m) && !hasSafeMarker(m) && !local;
}
