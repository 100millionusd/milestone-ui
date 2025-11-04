'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';
import AgentDigestWidget from "@/components/AgentDigestWidget";

// ———————————————————————————————————————————
// API base
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
const api = (p: string) => (API_BASE ? `${API_BASE}${p}` : `/api${p}`);
const EXPLORER_BASE = (process.env.NEXT_PUBLIC_ETHERSCAN_BASE || 'https://sepolia.etherscan.io').replace(/\/+$/, '');

// ———————————————————————————————————————————
// Types
type RoleInfo = { address?: string | null; role?: string | null; email?: string | null };

type BidRow = {
  id: number;
  proposal_id?: number | null;
  vendor_name?: string | null;
  amount_usd?: number | string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProofRow = {
  id: number;
  bid_id?: number | string | null;
  milestone_index?: number | null;
  vendor_name?: string | null;
  title?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  // NEW: used to join payments <-> proofs
  payment_tx_hash?: string | null;        // paymentTxHash
  safe_payment_tx_hash?: string | null;   // safePaymentTxHash
  safe_tx_hash?: string | null;           // safeTxHash
  paid_at?: string | null;                // paidAt/paymentDate
};

type MilestoneRow = {
  id: string;
  bid_id: number;
  milestone_index: number;
  title?: string | null;
  status?: string | null;
  last_update?: string | null;
};

type PaymentRow = {
  id: number | string;
  bid_id: number | null;
  milestone_index: number | null;
  amount_usd: number | string | null;
  status?: string | null;
  released_at?: string | null;
  tx_hash?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  // NEW (optional, used for robust joins / debugging)
  proof_id?: number | string | null;
  milestone_id?: number | string | null;
  __raw_index?: number; // index in the original array
};

// ———————————————————————————————————————————
// Helpers
function humanTime(s?: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function fmtUSD0(v: any) {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function downloadCSV(filename: string, rows: any[]) {
  const keys = Array.from(rows.reduce((set, r) => { Object.keys(r || {}).forEach(k => set.add(k)); return set; }, new Set<string>()));
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => esc((r as any)[k])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ———————————————————————————————————————————
// Updated Normalizers for your API structure
function normalizeBids(rows: any[]): BidRow[] {
  return (rows || []).map((r: any) => {
    console.log('Raw bid data:', r); // Debug log
    
    // Handle different ID fields
    const id = r?.id ?? r?.bidId ?? r?.bid_id;
    
    // Handle different proposal ID fields  
    const proposal_id = r?.proposalId ?? r?.proposal_id ?? r?.proposal?.id;
    
    // Handle different vendor name fields
    let vendor_name = r?.vendorName ?? r?.vendor_name ?? r?.vendor;
    if (!vendor_name && r?.vendor_profile) {
      vendor_name = r.vendor_profile.vendor_name ?? r.vendor_profile.name ?? r.vendor_profile.vendor;
    }
    
    // Handle different amount fields
    const amount_usd = r?.priceUsd ?? r?.amount_usd ?? r?.amountUsd ?? r?.usd ?? 
                      (r?.usdCents != null ? r.usdCents / 100 : r?.amount ?? null);
    
    // Handle different status fields
    const status = r?.status ?? r?.state ?? null;
    
    // Handle different date fields
    const created_at = r?.created_at ?? r?.createdAt ?? r?.created ?? r?.inserted_at;
    const updated_at = r?.updated_at ?? r?.updatedAt ?? r?.updated ?? r?.modified_at;

    return {
      id: Number(id || 0),
      proposal_id: proposal_id != null ? Number(proposal_id) : null,
      vendor_name,
      amount_usd,
      status,
      created_at,
      updated_at,
    };
  }).filter(bid => bid.id > 0);
}

function normalizeProofs(rows: any[]): ProofRow[] {
  return (rows || []).map((r: any, index) => {
    console.log('Raw proof data:', r); // Debug log
    
    // Handle different ID fields - use a combination of bid_id and milestone_index to ensure uniqueness
    const id = r?.id ?? r?.proof_id ?? r?.proofId ?? `proof-${r.bid_id}-${r.milestone_index}-${index}`;
    
    // Handle different bid ID fields
    const bid_id = r?.bid_id ?? r?.bidId ?? r?.bid?.id ?? r?.bid;
    
    // Extract milestone number from name (e.g., "Milestone 3" -> 3)
    let milestone_index = null;
    if (r?.name) {
      const match = r.name.match(/Milestone\s+(\d+)/);
      if (match) {
        milestone_index = parseInt(match[1]);
      }
    }
    
    // If no milestone from name, try other fields
    if (!milestone_index) {
      milestone_index = r?.milestone_index ?? r?.milestoneIndex ?? r?.milestone;
    }
    
    // Fallback to index if still no milestone index
    if (!milestone_index) {
      milestone_index = index + 1;
    }
    
    // Handle different vendor name fields
    const vendor_name = r?.vendor_name ?? r?.vendorName ?? r?.vendor;
    
    // Handle different title fields
    const title = r?.title ?? r?.name ?? r?.proof_title ?? `Milestone ${milestone_index}`;
    
    // FIXED: Handle different status fields - prioritize explicit status
    let status = r?.status ?? r?.state;
    
    // If no explicit status, derive from other fields
    if (!status) {
      if (r?.completed === true) status = 'completed';
      else if (r?.proof && r?.submitted_at) status = 'submitted';
      else if (r?.proof && !r?.submitted_at) status = 'open'; // Proof exists but not submitted
      else status = 'pending'; // No proof content yet
    }
    
    // Additional fix: If status is 'submitted' but no submission date, it should be 'open'
    if (status === 'submitted' && !r?.submitted_at && !r?.completionDate) {
      status = 'open';
    }

    // If payment info exists, treat as paid (covers direct/EOA payouts)
if (r?.paidAt || r?.paymentDate || r?.paymentTxHash || r?.payment_tx_hash) {
  status = 'paid';
}

    // Handle different date fields - use completionDate for submitted_at
    const submitted_at = r?.completionDate ?? r?.submitted_at ?? r?.submittedAt ?? r?.created_at ?? r?.createdAt;
    const created_at = r?.created_at ?? r?.createdAt ?? r?.created;
    const updated_at = r?.updated_at ?? r?.updatedAt ?? r?.updated;
    // capture tx hashes and payment time for join
const payment_tx_hash = r?.paymentTxHash ?? r?.payment_tx_hash ?? null;
const safe_payment_tx_hash = r?.safePaymentTxHash ?? r?.safe_payment_tx_hash ?? null;
const safe_tx_hash = r?.safeTxHash ?? r?.safe_tx_hash ?? null;
const paid_at = r?.paidAt ?? r?.paymentDate ?? null;


return {
  id: Number(index + 1),
  bid_id: bid_id != null ? Number(bid_id) : null,
  milestone_index: Number(milestone_index),
  vendor_name,
  title,
  status,
  submitted_at,
  created_at,
  updated_at,

  // NEW
  payment_tx_hash,
  safe_payment_tx_hash,
  safe_tx_hash,
  paid_at,
};
  });
}


// ---- helpers for robust extraction (must sit ABOVE normalizePayments) ----
function toNumberLoose(v: any): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/-?\d+/);
    if (m) return Number(m[0]);
  }
  return null;
}

function tryParseJSON(val: any) {
  if (typeof val !== 'string') return null;
  const s = val.trim();
  if (!s || (!s.startsWith('{') && !s.startsWith('['))) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// Depth-first scan for a number under any key that matches keyRegex.
function deepFindNumber(obj: any, keyRegex: RegExp, maxDepth = 6): number | null {
  const seen = new Set<any>();
  const stack: Array<{v:any; d:number}> = [{ v: obj, d: 0 }];

  while (stack.length) {
    const { v, d } = stack.pop()!;
    if (!v || typeof v !== 'object' || seen.has(v) || d > maxDepth) continue;
    seen.add(v);

    if (Array.isArray(v)) {
      for (const it of v) stack.push({ v: it, d: d + 1 });
      continue;
    }

    for (const [k, val] of Object.entries(v)) {
      if (keyRegex.test(k)) {
        const num = toNumberLoose(val);
        if (num != null) return num;
      }
      if (val && typeof val === 'object') stack.push({ v: val, d: d + 1 });
      if (typeof val === 'string') {
        const parsed = tryParseJSON(val);
        if (parsed) stack.push({ v: parsed, d: d + 1 });
      }
    }
  }
  return null;
}

// Scrape IDs from free text like "bid:123", "Milestone 2", "ms=2"
function parseIdsFromText(...texts: Array<string | undefined | null>) {
  let bidId: number | null = null;
  let milestoneIndex: number | null = null;
  for (const t of texts) {
    if (!t) continue;
    if (bidId == null) {
      const m = t.match(/(?:^|[^a-z])(bid(?:[_\s-]?id)?)[\s:=-]*#?\s*(\d+)/i);
      if (m) bidId = Number(m[2]);
    }
    if (milestoneIndex == null) {
      const m = t.match(/(?:^|[^a-z])(ms|milestone|mil)[\s:=-]*#?\s*(\d+)/i);
      if (m) milestoneIndex = Number(m[2] ?? m[1]);
    }
    if (bidId != null && milestoneIndex != null) break;
  }
  return { bidId, milestoneIndex };
}

// Shallow merge for object-likes
function mergeObjects(...objs: any[]) {
  return objs
    .filter(o => o && typeof o === 'object' && !Array.isArray(o))
    .reduce((acc, o) => Object.assign(acc, o), {} as any);
}

function normalizePayments(rows: any[]): PaymentRow[] {
  const toNumberLoose = (v: any): number | null => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const m = v.match(/-?\d+/);
      if (m) return Number(m[0]);
    }
    return null;
  };

  const tryParseJSON = (val: any) => {
    if (typeof val !== 'string') return null;
    const s = val.trim();
    if (!s || (!s.startsWith('{') && !s.startsWith('['))) return null;
    try { return JSON.parse(s); } catch { return null; }
  };

  const mergeObjects = (...objs: any[]) =>
    objs.filter(o => o && typeof o === 'object' && !Array.isArray(o))
        .reduce((acc, o) => Object.assign(acc, o), {} as any);

  const deepFind = (obj: any, keyRegex: RegExp, maxDepth = 6): any => {
    const seen = new Set<any>();
    const stack: Array<{ v: any; d: number }> = [{ v: obj, d: 0 }];
    while (stack.length) {
      const { v, d } = stack.pop()!;
      if (!v || typeof v !== 'object' || seen.has(v) || d > maxDepth) continue;
      seen.add(v);
      if (Array.isArray(v)) { for (const it of v) stack.push({ v: it, d: d + 1 }); continue; }
      for (const [k, val] of Object.entries(v)) {
        if (keyRegex.test(k)) return val;
        if (val && typeof val === 'object') stack.push({ v: val, d: d + 1 });
        if (typeof val === 'string') {
          const parsed = tryParseJSON(val);
          if (parsed) stack.push({ v: parsed, d: d + 1 });
        }
      }
    }
    return null;
  };

  const idsFromText = (...texts: Array<string | undefined | null>) => {
    let bidId: number | null = null;
    let milestoneIndex: number | null = null;
    for (const t of texts) {
      if (!t) continue;
      if (bidId == null) {
        const m = t.match(/(?:^|[^a-z])(bid(?:[_\s-]?id)?)[\s:=-]*#?\s*(\d+)/i);
        if (m) bidId = Number(m[2]);
      }
      if (milestoneIndex == null) {
        const m = t.match(/(?:^|[^a-z])(ms|milestone|mil)[\s:=-]*#?\s*(\d+)/i);
        if (m) milestoneIndex = Number(m[2] ?? m[1]);
      }
      if (bidId != null && milestoneIndex != null) break;
    }
    return { bidId, milestoneIndex };
  };

  return (rows || []).map((r: any, index) => {
    // Build merged “nested” bag (don’t let numeric milestone short-circuit object scans)
    const nestedParsed = mergeObjects(
      tryParseJSON(r?.note), tryParseJSON(r?.notes), tryParseJSON(r?.description), tryParseJSON(r?.memo),
      tryParseJSON(r?.metadata), tryParseJSON(r?.meta), tryParseJSON(r?.data)
    );
    const nested = mergeObjects(
      r?.context, r?.metadata, r?.meta, r?.details, r?.extra, nestedParsed,
      (typeof r?.milestone === 'object' ? r?.milestone : undefined)
    );

    // Free-text fallback
    const text = idsFromText(
      r?.note, r?.notes, r?.description, r?.memo, r?.id,
      typeof r?.metadata === 'string' ? r?.metadata : undefined,
      typeof r?.meta === 'string' ? r?.meta : undefined
    );

    // ids (explicit → nested → deep → text)
    const rawBid =
      r?.bid_id ?? r?.bidId ?? r?.bid?.id ?? r?.bid ??
      nested?.bid_id ?? nested?.bidId ?? nested?.bid?.id ??
      deepFind(r, /^(bid(_?id)?|^bid)$/i) ??
      deepFind(nested, /^(bid(_?id)?|^bid)$/i);
    const bid_id = rawBid != null ? toNumberLoose(rawBid) : text.bidId ?? null;

    const rawMs =
      r?.milestone_index ?? r?.milestoneIndex ?? (typeof r?.milestone === 'number' ? r?.milestone : undefined) ??
      r?.index ?? r?.i ??
      nested?.milestone_index ?? nested?.milestoneIndex ?? (typeof nested?.milestone === 'number' ? nested?.milestone : undefined) ?? nested?.index ??
      deepFind(r, /^(milestone(_?index)?|milestoneIndex|ms)$/i) ??
      deepFind(nested, /^(milestone(_?index)?|milestoneIndex|ms)$/i);
    const milestone_index = rawMs != null ? toNumberLoose(rawMs) : text.milestoneIndex ?? null;

    // also carry optional proof_id / milestone_id if present (for future joins)
    const rawProofId =
      r?.proof_id ?? r?.proofId ?? nested?.proof_id ?? nested?.proofId ??
      deepFind(r, /^proof(_?id)?$/i) ?? deepFind(nested, /^proof(_?id)?$/i);
    const rawMilestoneId =
      r?.milestone_id ?? r?.milestoneId ?? nested?.milestone_id ?? nested?.milestoneId ??
      deepFind(r, /^milestone(_?id)?$/i) ?? deepFind(nested, /^milestone(_?id)?$/i);

    // amount
    let amount_usd =
      r?.amount_usd ?? r?.amountUsd ?? r?.valueUsd ?? r?.usd ?? r?.amount ??
      nested?.amount_usd ?? nested?.amountUsd ?? nested?.valueUsd ?? nested?.usd ?? nested?.amount;
    if (amount_usd == null) {
      const cents = (r?.usd_cents ?? r?.usdCents ?? nested?.usd_cents ?? nested?.usdCents);
      if (cents != null) amount_usd = Number(cents) / 100;
    }

    const status =
      r?.status ?? r?.state ?? r?.payout_status ?? r?.release_status ??
      ((r?.completed || r?.released || r?.paid_at) ? 'completed' : 'pending');

    const released_at =
      r?.released_at ?? r?.releasedAt ?? r?.paid_at ?? r?.created_at ?? r?.createdAt;

    const tx_hash =
  r?.tx_hash ?? r?.transaction_hash ?? r?.hash ??
  r?.txHash ?? r?.transactionHash ?? r?.payment_hash ?? r?.paymentTxHash ??
  r?.onchain_tx_id ?? r?.onchain_tx_hash ??
  nested?.tx_hash ?? nested?.transaction_hash ?? nested?.paymentTxHash ?? null;

    const id =
      r?.id ?? r?.payment_id ?? r?.payout_id ?? r?.transfer_id ??
      r?.hash ?? r?.tx_hash ?? `payment-${index + 1}`;

    return {
      id: String(id),
      bid_id: bid_id != null ? Number(bid_id) : null,
      milestone_index: milestone_index != null ? Number(milestone_index) : null,
      amount_usd,
      status,
      released_at,
      tx_hash,
      created_at: r?.created_at ?? r?.createdAt ?? null,
      updated_at: r?.updated_at ?? r?.updatedAt ?? null,
      proof_id: rawProofId ?? null,
      milestone_id: rawMilestoneId ?? null,
      __raw_index: index,
    };
  });
}

// Join payments to proofs by tx hash; fill bid/milestone/status/time
function linkPaymentsToProofs(payments: PaymentRow[], proofs: ProofRow[]): PaymentRow[] {
  if (!Array.isArray(payments) || !Array.isArray(proofs)) return payments ?? [];

  // Build a lookup from any known proof hash -> proof row
  const byHash = new Map<string, ProofRow>();
  for (const pr of proofs) {
    for (const h of [pr.payment_tx_hash, pr.safe_payment_tx_hash, pr.safe_tx_hash]) {
      if (h) byHash.set(String(h).toLowerCase(), pr);
    }
  }

  const toNum = (v: any) =>
    typeof v === 'number' ? v : (v != null ? Number(String(v).replace(/[^0-9.-]/g, '')) : NaN);

  return payments.map((p) => {
    const key = p.tx_hash ? String(p.tx_hash).toLowerCase() : '';
    const match = key ? byHash.get(key) : undefined;

    if (!match) return p; // no proof with that tx — leave as-is

    // fill what’s missing from proof
    const filled: PaymentRow = {
      ...p,
      bid_id: p.bid_id ?? (match.bid_id != null ? Number(match.bid_id) : null),
      milestone_index: p.milestone_index ?? (match.milestone_index != null ? Number(match.milestone_index) : null),
      released_at: p.released_at ?? match.paid_at ?? p.created_at ?? null,
      status:
        p.status && p.status !== 'pending'
          ? p.status
          : (match.status === 'paid' ? 'completed' : (p.status ?? 'pending')),
    };

    // If amount came as cents/unknown, prefer proof.amount when amounts differ wildly (optional)
    const pAmt = toNum(p.amount_usd);
    // @ts-ignore: some proof payloads carry `amount`
    const prAmt = toNum((match as any).amount);
    if (!Number.isFinite(pAmt) && Number.isFinite(prAmt)) {
      filled.amount_usd = prAmt;
    }

    return filled;
  });
}

function deriveMilestonesFromProofs(proofs: ProofRow[]): MilestoneRow[] {
  const byKey = new Map<string, MilestoneRow>();
  const toTime = (s?: string | null) => (s ? new Date(s).getTime() || 0 : 0);

  for (const p of proofs || []) {
    const bidId = typeof p.bid_id === 'number' ? p.bid_id : Number(p.bid_id);
    const idx = typeof p.milestone_index === 'number' ? p.milestone_index : Number(p.milestone_index);
    if (!Number.isFinite(bidId) || !Number.isFinite(idx)) continue;

    const key = `${bidId}-${idx}`;
    const prev = byKey.get(key);
    const ts = Math.max(toTime(p.updated_at), toTime(p.submitted_at), toTime(p.created_at));
    const prevTs = prev ? toTime(prev.last_update) : 0;

    const row: MilestoneRow = {
      id: key,
      bid_id: Number(bidId),
      milestone_index: Number(idx),
      title: p.title ?? prev?.title ?? null,
      status: p.status ?? prev?.status ?? null,
      last_update: ts >= prevTs ? (p.updated_at ?? p.submitted_at ?? p.created_at ?? prev?.last_update ?? null) : prev?.last_update ?? null,
    };

    byKey.set(key, row);
  }

  return Array.from(byKey.values())
    .sort((a, b) => (a.bid_id - b.bid_id) || (a.milestone_index - b.milestone_index));
}

// ———————————————————————————————————————————
// UI Components
function Card(props: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden mb-6">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200/70 dark:border-neutral-800/60 bg-white/60 dark:bg-neutral-900/40 backdrop-blur">
        <div>
          <div className="text-lg font-semibold">{props.title}</div>
          {props.subtitle && <div className="text-xs text-neutral-500">{props.subtitle}</div>}
        </div>
        <div className="flex items-center gap-2">{props.right}</div>
      </div>
      <div className="p-0">{props.children}</div>
    </div>
  );
}

function Th(props: { children: React.ReactNode }) {
  return <th className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-neutral-600">{props.children}</th>;
}

function Td(props: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td className={`px-4 py-3 ${props.className ?? ''}`} colSpan={props.colSpan}>{props.children}</td>;
}

function RowPlaceholder({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="p-6 text-center text-neutral-400">Loading…</td>
    </tr>
  );
}

// ADD THIS BADGE COMPONENT
function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral"|"success"|"warning"|"danger" }) {
  const toneStyles = {
    neutral: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200", 
    danger: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
  }[tone];
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-medium ${toneStyles}`}>
      {children}
    </span>
  );
}

// ———————————————————————————————————————————
// Page Component
export default function VendorOversightPage() {
  const [role, setRole] = useState<RoleInfo | null>(null);
  const [bids, setBids] = useState<BidRow[] | null>(null);
  const [proofs, setProofs] = useState<ProofRow[] | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [rawPayments, setRawPayments] = useState<any[]>([]);


  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'bids' | 'proofs' | 'milestones' | 'payments'>('overview');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let aborted = false;
    
    const fetchVendorData = async () => {
      try {
        setErr(null);
        setLoading(true);

        // Use our aggregated vendor oversight endpoint
        const response = await fetch(`/api/vendor/oversight?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'include',
          headers: { 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (!aborted) {
          console.log('Vendor data:', data); // Debug log
          
          setRole(data.role || null);
          
          const normalizedBids = normalizeBids(data.bids || []);
          setBids(normalizedBids);
          console.log('Normalized bids:', normalizedBids); // Debug log
          
          const normalizedProofs = normalizeProofs(data.proofs || []);
          setProofs(normalizedProofs);
          console.log('Normalized proofs:', normalizedProofs); // Debug log
          
// accept multiple backend shapes (wide net) — now handles object buckets + fallbacks
let rawPaymentsAny: any =
  data.payments ??
  data.payouts ??
  data.releases ??
  data.transfers ??
  data.milestone_payments ??
  data.milestonePayments ??
  data.vendor?.payments ??
  data.vendor?.payouts ??
  data.wallet?.payments ??
  data.wallet?.transfers ??
  (Array.isArray(data.milestones)
    ? data.milestones.flatMap((m: any) => m?.releases ?? m?.payments ?? m?.payouts ?? [])
    : null) ??
  [];

// If payments came as an object (e.g. { safe:[], normal:[], eoa:[] }), flatten its arrays
if (!Array.isArray(rawPaymentsAny) && rawPaymentsAny && typeof rawPaymentsAny === 'object') {
  rawPaymentsAny = Object.values(rawPaymentsAny).flatMap((v: any) => Array.isArray(v) ? v : []);
}

// Extra keys sometimes used for direct/normal payouts
if (Array.isArray(rawPaymentsAny) && rawPaymentsAny.length === 0) {
  const extras = [
    data.normal_payments, data.direct_payments, data.eoa_payments,
    data.normalPayments, data.directPayments, data.eoaPayments,
    data.bank_transfers, data.chain_transfers, data.onchain_payments
  ].filter(Array.isArray).flat();
  if (extras.length) rawPaymentsAny = extras;
}

// Final fallback: hit vendor payments endpoint if the aggregate didn’t include them
if (!Array.isArray(rawPaymentsAny) || rawPaymentsAny.length === 0) {
  try {
    const r = await fetch(api('/vendor/payments'), { credentials: 'include', cache: 'no-store' });
    if (r.ok) rawPaymentsAny = await r.json();
  } catch {}
}

// store raw for inspection and normalize
setRawPayments(Array.isArray(rawPaymentsAny) ? rawPaymentsAny : []);
const normalizedPayments = normalizePayments(Array.isArray(rawPaymentsAny) ? rawPaymentsAny : []);
const paymentsJoined2 = linkPaymentsToProofs(normalizedPaymentsLocal, normalizedProofs);
setPayments(paymentsJoined2);
console.log('Normalized payments (joined):', paymentsJoined);

// store raw for inspection and normalize
setRawPayments(Array.isArray(rawPayments) ? rawPayments : []);
const normalizedPaymentsLocal = normalizePayments(Array.isArray(rawPayments) ? rawPayments : []);
const paymentsJoined2 = linkPaymentsToProofs(normalizedPaymentsLocal, normalizedProofs);
setPayments(paymentsJoined2);

// Derive milestones from proofs
const milestones = deriveMilestonesFromProofs(normalizedProofs);
setMilestones(milestones);
          console.log('Derived milestones:', milestones); // Debug log
        }
        
      } catch (e: any) {
        console.error('Vendor data fetch error:', e);
        if (!aborted) setErr(e?.message || 'Failed to load vendor activity');
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    fetchVendorData();
    return () => { aborted = true; };
  }, []);

  // ——— Filters
  const filteredBids = useMemo(() => {
    const list = bids ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(b =>
      String(b.id).includes(q) ||
      String(b.proposal_id ?? '').includes(q) ||
      (b.vendor_name ?? '').toLowerCase().includes(q) ||
      (b.status ?? '').toLowerCase().includes(q)
    );
  }, [bids, query]);

  const filteredProofs = useMemo(() => {
    const list = proofs ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(p =>
      String(p.id).includes(q) ||
      String(p.bid_id ?? '').includes(q) ||
      String(p.milestone_index ?? '').includes(q) ||
      (p.vendor_name ?? '').toLowerCase().includes(q) ||
      (p.title ?? '').toLowerCase().includes(q) ||
      (p.status ?? '').toLowerCase().includes(q)
    );
  }, [proofs, query]);

  const filteredMilestones = useMemo(() => {
    const list = milestones ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(m =>
      String(m.bid_id).includes(q) ||
      String(m.milestone_index).includes(q) ||
      (m.title ?? '').toLowerCase().includes(q) ||
      (m.status ?? '').toLowerCase().includes(q)
    );
  }, [milestones, query]);

  const filteredPayments = useMemo(() => {
    const list = payments ?? [];
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(p =>
      String(p.id).toLowerCase().includes(q) ||
      String(p.bid_id ?? '').includes(q) ||
      String(p.milestone_index ?? '').includes(q) ||
      (p.status ?? '').toLowerCase().includes(q) ||
      (p.tx_hash ?? '').toLowerCase().includes(q)
    );
  }, [payments, query]);

  // ——— UI
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'bids', label: 'Bids', count: bids?.length ?? 0 },
    { 
      key: 'proofs', 
      label: 'Proofs', 
      count: (proofs?.filter(p => p.status === 'paid' || p.completed === true)?.length ?? 0)
    },
    { key: 'milestones', label: 'Milestones', count: milestones?.length ?? 0 },
    { key: 'payments', label: 'Payments', count: payments?.length ?? 0 },
  ] as const;

  return (
    <div className="px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendor Overview</h1>
          <div className="text-sm text-neutral-500">
            {role?.role ? `Signed in as ${role.role}` : '—'} • {role?.address ?? role?.email ?? '—'}
          </div>
        </div>

        <div className="flex gap-2">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-2xl border text-sm ${tab === t.key ? 'bg-black text-white border-black' : 'bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700'}`}
            >
              {t.label}{' '}{t.count != null ? <span className="ml-1 text-neutral-500">{t.count}</span> : null}
            </button>
          ))}
        </div>
      </div>

     {/* Agent 2 — What’s New (compact, narrow) */}
<section className="mb-6">
  <AgentDigestWidget />
</section>

      {tab !== 'overview' && (
        <div className="flex items-center justify-end">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${tab}…`}
            className="text-sm rounded-xl bg-white/70 dark:bg-neutral-900/50 border border-neutral-300 dark:border-neutral-700 px-3 py-2"
          />
        </div>
      )}

      {err && <div className="text-rose-600 text-sm">{err}</div>}
      {loading && <div className="text-neutral-500 text-sm">Loading…</div>}

      {/* ——— Overview ——— */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card title="My Bids" subtitle="Count / Last created">
            <div className="p-4 flex items-baseline gap-3">
              <div className="text-3xl font-semibold">{bids?.length ?? 0}</div>
              <div className="text-sm text-neutral-500">
                {bids && bids.length ? `Last: ${humanTime(bids.slice().sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime())[0].created_at)}` : '—'}
              </div>
            </div>
          </Card>
          <Card title="My Proofs" subtitle="Completed proofs">
            <div className="p-4 flex items-baseline gap-3">
              <div className="text-3xl font-semibold">
                {(proofs?.filter(p => p.status === 'paid' || p.completed === true)?.length ?? 0)}
              </div>
            </div>
          </Card>
          <Card title="Milestones" subtitle="Derived from submissions">
            <div className="p-4 flex items-baseline gap-3">
              <div className="text-3xl font-semibold">{milestones?.length ?? 0}</div>
            </div>
          </Card>
        </div>
      )}

      {/* ——— Bids ——— */}
      {tab === 'bids' && (
        <Card
          title={`Bids (${filteredBids.length})`}
          subtitle="Newest first"
          right={
            <button
              onClick={() => downloadCSV(`my-bids-${new Date().toISOString().slice(0,10)}.csv`, filteredBids)}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              ⬇ CSV
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                <tr>
                  <Th>ID</Th>
                  <Th>Proposal</Th>
                  <Th>Status</Th>
                  <Th>USD</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {!bids && <RowPlaceholder cols={5} />}
                {bids && filteredBids.length === 0 && <tr><Td colSpan={5} className="text-center text-neutral-500">No bids</Td></tr>}
                {filteredBids
                  .slice()
                  .sort((a, b) => (new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()))
                  .map(b => (
                  <tr key={b.id} className="border-b border-neutral-100 dark:border-neutral-800">
                    <Td>#{b.id}</Td>
                    <Td>#{b.proposal_id ?? '—'}</Td>
                    <Td>
                      <Badge tone={
                        b.status === 'approved' ? 'success' : 
                        b.status === 'pending' ? 'warning' : 'neutral'
                      }>
                        {b.status ?? '—'}
                      </Badge>
                    </Td>
                    <Td className="tabular-nums">{fmtUSD0(b.amount_usd)}</Td>
                    <Td>{humanTime(b.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ——— Proofs ——— */}
      {tab === 'proofs' && (
        <Card
          title={`Proofs (${filteredProofs.length})`}
          subtitle="Newest first"
          right={
            <button
              onClick={() => downloadCSV(`my-proofs-${new Date().toISOString().slice(0,10)}.csv`, filteredProofs)}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              ⬇ CSV
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                <tr>
                  <Th>ID</Th>
                  <Th>Bid</Th>
                  <Th>Milestone</Th>
                  <Th>Status</Th>
                  <Th>Submitted</Th>
                  <Th>Title</Th>
                </tr>
              </thead>
              <tbody>
                {!proofs && <RowPlaceholder cols={6} />}
                {proofs && filteredProofs.length === 0 && <tr><Td colSpan={6} className="text-center text-neutral-500">No proofs</Td></tr>}
                {filteredProofs
                  .slice()
                  .sort((a, b) => (new Date(b.submitted_at || b.created_at || 0).getTime() - new Date(a.submitted_at || a.created_at || 0).getTime()))
                  .map(p => (
                  <tr key={p.id} className="border-b border-neutral-100 dark:border-neutral-800">
                    <Td>#{p.id}</Td>
                    <Td>{p.bid_id != null ? `#${p.bid_id}` : '—'}</Td>
                    <Td>{p.milestone_index ?? '—'}</Td>
                    <Td>
                      <Badge tone={
                        p.status === 'paid' ? 'success' :
                        p.status === 'approved' ? 'success' :
                        p.status === 'submitted' ? 'warning' :
                        p.status === 'open' ? 'neutral' : // Add this line for open status
                        'neutral'
                      }>
                        {p.status ?? '—'}
                      </Badge>
                    </Td>
                    <Td>{humanTime(p.submitted_at || p.created_at)}</Td>
                    <Td className="max-w-[360px] truncate" title={p.title || ''}>{p.title ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

 {/* ——— Payments ——— */}
{tab === 'payments' && (
  <Card
    title={`Payments (${filteredPayments.length})`}
    subtitle="Latest first"
    right={
      <button
        onClick={() => downloadCSV(`my-payments-${new Date().toISOString().slice(0,10)}.csv`, filteredPayments)}
        className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
      >
        ⬇ CSV
      </button>
    }
  >
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
          <tr>
            <Th>ID</Th>
            <Th>Bid</Th>
            <Th>Milestone</Th>
            <Th>Status</Th>
            <Th>Released</Th>
            <Th>Amount</Th>
            <Th>Tx</Th>
          </tr>
        </thead>
        <tbody>
          {!payments && <RowPlaceholder cols={7} />}
          {payments && filteredPayments.length === 0 && (
            <tr><Td colSpan={7} className="text-center text-neutral-500">No payments</Td></tr>
          )}
          {filteredPayments
            .slice()
            .sort((a, b) => (new Date(b.released_at || b.created_at || 0).getTime() - new Date(a.released_at || a.created_at || 0).getTime()))
            .map(p => (
            <tr key={String(p.id)} className="border-b border-neutral-100 dark:border-neutral-800">
              <Td className="font-mono text-xs">{String(p.id)}</Td>
              <Td>{p.bid_id ?? '—'}</Td>
              <Td>{p.milestone_index ?? '—'}</Td>
              <Td>
                <Badge tone={
                  p.status === 'completed' ? 'success' :
                  p.status === 'released' ? 'success' :
                  p.status === 'pending' ? 'warning' : 'neutral'
                }>
                  {p.status ?? '—'}
                </Badge>
              </Td>
              <Td>{humanTime(p.released_at || p.created_at)}</Td>
              <Td className="tabular-nums">{fmtUSD0(p.amount_usd)}</Td>
              <Td className="max-w-[160px] truncate">
                {p.tx_hash ? (
                  <a 
                    href={`${EXPLORER_BASE}/tx/${p.tx_hash}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="font-mono text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-800/50 hover:shadow-sm transition-all inline-block"
                  >
                    {p.tx_hash.slice(0, 8)}…{p.tx_hash.slice(-6)}
                  </a>
                ) : (
                  <span className="text-neutral-400">—</span>
                )}
              </Td>
            </tr>
          ))}
           </tbody>
      </table>

      {/* Debug: show keys when backend returned rows but normalization produced 0 */}
      {!loading && (payments?.length ?? 0) === 0 && (rawPayments?.length ?? 0) > 0 && (
        <div className="px-3 py-2 text-xs border-t bg-amber-50 border-amber-200 text-amber-800">
          Unexpected payments shape. First row keys:{" "}
          <code className="break-all">{Object.keys(rawPayments[0] || {}).join(", ")}</code>
        </div>
      )}

    </div>
  </Card>
)}

      {/* ——— Milestones ——— */}
      {tab === 'milestones' && (
        <Card
          title={`Milestones (${filteredMilestones.length})`}
          subtitle="Derived from your submitted proofs"
          right={
            <button
              onClick={() => downloadCSV(`my-milestones-${new Date().toISOString().slice(0,10)}.csv`, filteredMilestones)}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              ⬇ CSV
            </button>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left sticky top-0 bg-white/80 dark:bg-neutral-900/70 backdrop-blur border-b border-neutral-200/60 dark:border-neutral-800">
                <tr>
                  <Th>Bid</Th>
                  <Th>Milestone</Th>
                  <Th>Status</Th>
                  <Th>Last Update</Th>
                  <Th>Title</Th>
                </tr>
              </thead>
              <tbody>
                {!milestones && <RowPlaceholder cols={5} />}
                {milestones && filteredMilestones.length === 0 && <tr><Td colSpan={5} className="text-center text-neutral-500">No milestones</Td></tr>}
                {filteredMilestones.map(m => (
                  <tr key={m.id} className="border-b border-neutral-100 dark:border-neutral-800">
                    <Td>{m.bid_id}</Td>
                    <Td>{m.milestone_index}</Td>
                    <Td>
                      <Badge tone={
                        m.status === 'paid' ? 'success' :
                        m.status === 'approved' ? 'success' :
                        m.status === 'submitted' ? 'warning' :
                        m.status === 'open' ? 'neutral' : // Add this line for open status
                        'neutral'
                      }>
                        {m.status ?? '—'}
                      </Badge>
                    </Td>
                    <Td>{humanTime(m.last_update)}</Td>
                    <Td className="max-w-[360px] truncate" title={m.title || ''}>{m.title ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}