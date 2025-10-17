'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';

// ———————————————————————————————————————————
// API base + same-origin fallback (matches your pattern)
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
// Vendor portal must use same-origin to carry session cookies and avoid 400/CORS
const api = (p: string) => `/api${p}`;

// ———————————————————————————————————————————
// Types (tolerant to backend variations)
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
};

type MilestoneRow = {
  id: string;                 // `${bid_id}-${milestone_index}`
  bid_id: number;
  milestone_index: number;
  title?: string | null;
  status?: string | null;     // derived from proofs (submitted/—)
  last_update?: string | null;
};

type PaymentRow = {
  id: number | string;
  bid_id: number | null;
  milestone_index: number | null;
  amount_usd: number | string | null;
  status?: string | null;         // e.g. released, pending
  released_at?: string | null;
  tx_hash?: string | null;        // optional on-chain hash
  created_at?: string | null;
  updated_at?: string | null;
};

// ———————————————————————————————————————————
// Small helpers (copied/compatible with your admin page style)
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
function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/[^0-9.-]/g, '')) || 0;
}

// Accept only finite positive numeric ids
const isFiniteId = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
};

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
// Normalizers (map varying backend shapes → our rows)
function normalizeBids(rows: any[]): BidRow[] {
  return (rows || []).map((r: any) => ({
    id: Number(r?.id ?? r?.bid_id ?? r?.bidId),
    proposal_id: r?.proposal_id != null ? Number(r.proposal_id) : (r?.proposal?.id != null ? Number(r.proposal.id) : null),
    vendor_name: r?.vendor_name ?? r?.vendorName ?? r?.vendor ?? r?.vendor_profile?.vendor_name ?? r?.vendor_profile?.name ?? null,
    amount_usd: r?.amount_usd ?? r?.amountUsd ?? r?.usd ?? (r?.usdCents != null ? r.usdCents / 100 : r?.amount ?? null),
    status: r?.status ?? r?.state ?? null,
    created_at: r?.created_at ?? r?.createdAt ?? r?.created ?? null,
    updated_at: r?.updated_at ?? r?.updatedAt ?? r?.updated ?? null,
  }));
}
function normalizeProofs(rows: any[]): ProofRow[] {
  const toIdx = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return (rows || []).map((r: any) => {
    // try many possible keys for milestone index
    const idx =
      toIdx(r?.milestone_index) ??
      toIdx(r?.milestoneIndex) ??
      toIdx(r?.milestone) ??
      toIdx(r?.milestone_no) ??
      toIdx(r?.milestoneNumber) ??
      toIdx(r?.milestone_id) ??
      toIdx(r?.milestone?.index);

    // bid id can be number or string or nested
    const bidNum =
      toIdx(r?.bid_id) ??
      toIdx(r?.bidId) ??
      toIdx(r?.bid?.id) ??
      toIdx(r?.bid) ??
      null;

    return {
      id: Number(r?.id ?? r?.proof_id ?? r?.proofId),
      bid_id: bidNum,
      milestone_index: idx,
      vendor_name:
        r?.vendor_name ??
        r?.vendorName ??
        r?.vendor ??
        r?.vendor_profile?.vendor_name ??
        r?.vendor_profile?.name ??
        null,
      title: r?.title ?? r?.name ?? r?.proof_title ?? null,
      status: r?.status ?? r?.state ?? null,
      submitted_at: r?.submitted_at ?? r?.submittedAt ?? r?.created_at ?? r?.createdAt ?? null,
      created_at: r?.created_at ?? r?.createdAt ?? null,
      updated_at: r?.updated_at ?? r?.updatedAt ?? null,
    };
  });
}

function normalizePayments(rows: any[]): PaymentRow[] {
  const toNum = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const toUsd = (v: any): number | string | null => {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    const n = Number(String(v).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : v;
  };
  return (rows || []).map((r: any) => ({
    id: r?.id ?? r?.payment_id ?? r?.payout_id ?? r?.transfer_id ?? r?.hash ?? r?.tx_hash ?? '—',
    bid_id: toNum(r?.bid_id ?? r?.bidId ?? r?.bid?.id ?? r?.bid),
    milestone_index: toNum(r?.milestone_index ?? r?.milestoneIndex ?? r?.milestone ?? r?.milestone_no ?? r?.i),
    amount_usd: toUsd(r?.amount_usd ?? r?.amountUsd ?? r?.usd ?? (r?.usdCents != null ? r.usdCents / 100 : r?.amount)),
    status: r?.status ?? r?.state ?? r?.payout_status ?? null,
    released_at: r?.released_at ?? r?.releasedAt ?? r?.paid_at ?? r?.created_at ?? r?.createdAt ?? null,
    tx_hash: r?.tx_hash ?? r?.transaction_hash ?? r?.hash ?? null,
    created_at: r?.created_at ?? r?.createdAt ?? null,
    updated_at: r?.updated_at ?? r?.updatedAt ?? null,
  }));
}

// Derive milestones from proofs (fallback when API doesn't expose milestones list)
function deriveMilestonesFromProofs(proofs: ProofRow[]): MilestoneRow[] {
  const byKey = new Map<string, MilestoneRow & { _statusSeen?: Set<string> }>();
  const toTime = (s?: string | null) => (s ? new Date(s).getTime() || 0 : 0);

  for (const p of proofs || []) {
    const bidId = typeof p.bid_id === 'number' ? p.bid_id : Number(p.bid_id);
    const idx = typeof p.milestone_index === 'number' ? p.milestone_index : Number(p.milestone_index);
    if (!Number.isFinite(bidId) || !Number.isFinite(idx)) continue;

    const key = `${bidId}-${idx}`;
    const prev = byKey.get(key);
    const status = (p.status || '').toLowerCase();

    // Pick latest update
    const ts = Math.max(toTime(p.updated_at), toTime(p.submitted_at), toTime(p.created_at));
    const prevTs = prev ? toTime(prev.last_update) : 0;

    const statusSeen = prev?._statusSeen ?? new Set<string>();
    if (status) statusSeen.add(status);

    // Status precedence: approved > pending > submitted > anything else
    const resolveStatus = () => {
      if (statusSeen.has('approved')) return 'approved';
      if (statusSeen.has('pending')) return 'pending';
      if (statusSeen.size > 0) return Array.from(statusSeen.values())[0]; // first seen
      return 'submitted';
    };

    const row: MilestoneRow & { _statusSeen?: Set<string> } = {
      id: key,
      bid_id: Number(bidId),
      milestone_index: Number(idx),
      title: p.title ?? prev?.title ?? null,
      status: prev ? prev.status : resolveStatus(),
      last_update: ts >= prevTs ? (p.updated_at ?? p.submitted_at ?? p.created_at ?? prev?.last_update ?? null)
                                : prev?.last_update ?? null,
      _statusSeen: statusSeen,
    };

    // fix status after merging
    row.status = resolveStatus();
    byKey.set(key, row);
  }

  return Array.from(byKey.values())
    .map(({ _statusSeen, ...r }) => r)
    .sort((a, b) => (a.bid_id - b.bid_id) || (a.milestone_index - b.milestone_index));
}

async function tryLoadMilestonesFromApi(
  apiFn: (p: string) => string,
  bidList: BidRow[]
): Promise<MilestoneRow[]> {
  const out: MilestoneRow[] = [];

  const toIdx = (v: any): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const normalizeApiMilestones = (rows: any[], knownBid?: number): MilestoneRow[] => {
    const a: MilestoneRow[] = [];
    for (const r of (rows || [])) {
      const bid = toIdx(r?.bid_id) ?? toIdx(knownBid);
      const idx = toIdx(r?.milestone_index ?? r?.index ?? r?.i ?? r?.milestone ?? r?.number);
      if (!Number.isFinite(bid) || !Number.isFinite(idx)) continue;
      a.push({
        id: `${bid}-${idx}`,
        bid_id: Number(bid),
        milestone_index: Number(idx),
        title: r?.title ?? r?.name ?? null,
        status: r?.status ?? r?.state ?? null,
        last_update: r?.updated_at ?? r?.last_update ?? r?.submitted_at ?? r?.created_at ?? null,
      });
    }
    return a;
  };

  // 1) Try vendor-scoped list: /api/milestones?mine=1
  try {
    const r = await fetch(`${apiFn('/milestones')}?mine=1&t=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (r.ok) {
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j?.milestones ?? []);
      const rows = normalizeApiMilestones(arr);
      if (rows.length) return rows;
    }
  } catch { /* ignore */ }

  // 2) Per-bid fallback: /api/milestones?bidId= or ?bid_id=
  const ids = Array.from(new Set((bidList || []).map(b => Number(b.id)).filter(n => Number.isFinite(n))));
  const CONCURRENCY = 6;
  let i = 0;
  async function runBatch() {
    const batch = ids.slice(i, i + CONCURRENCY);
    i += CONCURRENCY;
    const chunkLists = await Promise.all(batch.map(async (id) => {
      // ?bidId=
      let r = await fetch(`${apiFn('/milestones')}?bidId=${id}&t=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (r.ok) {
        const j = await r.json();
        const arr = Array.isArray(j) ? j : (j?.milestones ?? []);
        return normalizeApiMilestones(arr, id);
      }
      // try ?bid_id=
      if (r.status === 400 || r.status === 404) {
        r = await fetch(`${apiFn('/milestones')}?bid_id=${id}&t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (r.ok) {
          const j2 = await r.json();
          const arr2 = Array.isArray(j2) ? j2 : (j2?.milestones ?? []);
          return normalizeApiMilestones(arr2, id);
        }
      }
      // last resort: /api/bids/:id (if it contains milestones)
      try {
        const rBid = await fetch(`${apiFn(`/bids/${id}`)}?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (rBid.ok) {
          const jb = await rBid.json();
          const arrB = Array.isArray(jb?.milestones) ? jb.milestones : [];
          return normalizeApiMilestones(arrB, id);
        }
      } catch { /* ignore */ }
      return [];
    }));
    chunkLists.forEach(arr => { if (Array.isArray(arr)) out.push(...arr); });
    if (i < ids.length) await runBatch();
  }
  if (ids.length) await runBatch();

  return out;
}

// ———————————————————————————————————————————
// Simple UI atoms (lightweight, match your admin feel)
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

// ———————————————————————————————————————————
// Page
export default function VendorOversightPage() {
  const [role, setRole] = useState<RoleInfo | null>(null);
  const [bids, setBids] = useState<BidRow[] | null>(null);
  const [proofs, setProofs] = useState<ProofRow[] | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'bids' | 'proofs' | 'milestones' | 'payments'>('overview');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        setErr(null);
        setLoading(true);

        // Who am I?
        const rRole = await fetch(`${api('/auth/role')}?t=${Date.now()}`, { cache: 'no-store', credentials: 'include' });
        if (!rRole.ok) throw new Error(`auth/role ${rRole.status}`);
        const roleJson = await rRole.json();
        if (!aborted) setRole(roleJson);

        // My bids (robust with fallbacks for vendor-scoped endpoints)
let bidList: BidRow[] = [];

const tryFetchBids = async (url: string) => {
  const r = await fetch(url, { cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' } });
  if (!r.ok) return null;
  const j = await r.json();
  return normalizeBids(Array.isArray(j) ? j : (j?.bids ?? j ?? []));
};

// 1) Standard path
bidList = (await tryFetchBids(`${api('/bids')}?t=${Date.now()}`)) ?? [];

// 2) Common vendor flags
if (bidList.length === 0) {
  bidList = (await tryFetchBids(`${api('/bids')}?mine=1&t=${Date.now()}`)) ?? [];
}
if (bidList.length === 0 && role?.address) {
  bidList = (await tryFetchBids(`${api('/bids')}?vendorAddress=${encodeURIComponent(role.address)}&t=${Date.now()}`)) ?? [];
}

if (!aborted) setBids(bidList);

 // Proofs (try list → vendor flags → per-bid fallback)
let proofsList: any[] = [];

// 1) Try direct list
try {
  const rp = await fetch(`${api('/proofs')}?t=${Date.now()}`, { cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' } });
  if (rp.ok) {
    const pj = await rp.json();
    proofsList = Array.isArray(pj) ? pj : (pj?.proofs ?? []);
  }
} catch { /* ignore */ }

// 2) Try vendor-scoped list if still empty
if (!Array.isArray(proofsList) || proofsList.length === 0) {
  try {
    const rpMine = await fetch(`${api('/proofs')}?mine=1&t=${Date.now()}`, { cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' } });
    if (rpMine.ok) {
      const pj2 = await rpMine.json();
      proofsList = Array.isArray(pj2) ? pj2 : (pj2?.proofs ?? []);
    }
  } catch { /* ignore */ }
}

// 3) Fallback: per-bid fetch if still empty
if (!Array.isArray(proofsList) || proofsList.length === 0) {
  // Use only valid, numeric ids (deduped)
  const ids = Array.from(
    new Set((bidList ?? []).map(b => Number(b.id)).filter(isFiniteId))
  );

  const results: any[] = [];
  const CONCURRENCY = 6;

  async function fetchProofsForBid(id: number): Promise<any[]> {
    // Try ?bidId= first
    const url1 = `${api('/proofs')}?bidId=${id}&t=${Date.now()}`;
    let r = await fetch(url1, {
      cache: 'no-store',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (r.ok) {
      const j = await r.json();
      return Array.isArray(j) ? j : (j?.proofs ?? []);
    }

    // If backend prefers snake_case, try ?bid_id=
    if (r.status === 400 || r.status === 404) {
      const url2 = `${api('/proofs')}?bid_id=${id}&t=${Date.now()}`;
      r = await fetch(url2, {
        cache: 'no-store',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (r.ok) {
        const j2 = await r.json();
        return Array.isArray(j2) ? j2 : (j2?.proofs ?? []);
      }
    }

    // Otherwise no data for this bid
    return [];
  }

  let idx = 0;
  async function runBatch(): Promise<void> {
    const batch = ids.slice(idx, idx + CONCURRENCY);
    idx += CONCURRENCY;
    const chunkLists = await Promise.all(batch.map(id => fetchProofsForBid(id)));
    chunkLists.forEach(arr => { if (Array.isArray(arr)) results.push(...arr); });
    if (idx < ids.length) await runBatch();
  }

  if (ids.length) {
    await runBatch();
    proofsList = results;
  }
}
        const proofRows = normalizeProofs(proofsList);
if (!aborted) setProofs(proofRows);

// Derive milestones from proofs, then fall back to API if empty
let ms = deriveMilestonesFromProofs(proofRows);
if (ms.length === 0) {
  try {
    const apiMilestones = await tryLoadMilestonesFromApi(api, bidList);
    if (apiMilestones.length) ms = apiMilestones;
  } catch { /* ignore */ }
}
if (!aborted) setMilestones(ms);
// ——— Payments (try list → vendor flags → per-bid) ———
try {
  let payList: any[] = [];

  // 1) Try a direct vendor-scoped list
  const r1 = await fetch(`${api('/payouts')}?mine=1&t=${Date.now()}`, {
    cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' },
  });
  if (r1.ok) {
    const j1 = await r1.json();
    payList = Array.isArray(j1) ? j1 : (j1?.payouts ?? j1?.payments ?? []);
  }

  // 2) Try generic list if still empty
  if (!Array.isArray(payList) || payList.length === 0) {
    const r2 = await fetch(`${api('/payouts')}?t=${Date.now()}`, {
      cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' },
    });
    if (r2.ok) {
      const j2 = await r2.json();
      payList = Array.isArray(j2) ? j2 : (j2?.payouts ?? j2?.payments ?? []);
    }
  }

  // 3) Per-bid fallback (handles backends that require bid scoping)
  if (!Array.isArray(payList) || payList.length === 0) {
    const ids = Array.from(new Set((bids ?? []).map(b => Number(b.id)).filter(n => Number.isFinite(n))));
    const CONCURRENCY = 6;
    const results: any[] = [];
    let idx = 0;

    async function fetchForBid(id: number): Promise<any[]> {
      // ?bidId=
      let r = await fetch(`${api('/payouts')}?bidId=${id}&t=${Date.now()}`, {
        cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' },
      });
      if (r.ok) {
        const j = await r.json();
        return Array.isArray(j) ? j : (j?.payouts ?? j?.payments ?? []);
      }
      // ?bid_id=
      if (r.status === 400 || r.status === 404) {
        r = await fetch(`${api('/payouts')}?bid_id=${id}&t=${Date.now()}`, {
          cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' },
        });
        if (r.ok) {
          const j2 = await r.json();
          return Array.isArray(j2) ? j2 : (j2?.payouts ?? j2?.payments ?? []);
        }
      }
      // /bids/:id (if it contains payouts)
      try {
        const rb = await fetch(`${api(`/bids/${id}`)}?t=${Date.now()}`, {
          cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json' },
        });
        if (rb.ok) {
          const bj = await rb.json();
          const arr = Array.isArray(bj?.payouts) ? bj.payouts : (Array.isArray(bj?.payments) ? bj.payments : []);
          return arr || [];
        }
      } catch { /* ignore */ }
      return [];
    }

    async function runBatch() {
      const batch = ids.slice(idx, idx + CONCURRENCY);
      idx += CONCURRENCY;
      const chunks = await Promise.all(batch.map(id => fetchForBid(id)));
      chunks.forEach(arr => { if (Array.isArray(arr)) results.push(...arr); });
      if (idx < ids.length) await runBatch();
    }
    if (ids.length) {
      await runBatch();
      payList = results;
    }
  }

  if (!aborted) setPayments(normalizePayments(payList));
} catch { /* ignore payments errors so page still loads */ }

      } catch (e: any) {
        if (!aborted) setErr(e?.message || 'Failed to load vendor activity');
      } finally {
        if (!aborted) setLoading(false);
      }
    })();
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
    { key: 'proofs', label: 'Proofs', count: proofs?.length ?? 0 },
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
          <Card title="My Proofs" subtitle="Submitted proofs">
            <div className="p-4 flex items-baseline gap-3">
              <div className="text-3xl font-semibold">{proofs?.length ?? 0}</div>
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
                    <Td>{b.status ?? '—'}</Td>
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
                    <Td>{p.bid_id ?? '—'}</Td>
                    <Td>{p.milestone_index ?? '—'}</Td>
                    <Td>{p.status ?? '—'}</Td>
                    <Td>{humanTime(p.submitted_at || p.created_at)}</Td>
                    <Td className="max-w-[360px] truncate" title={p.title || ''}>{p.title ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
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
              <Td>{p.status ?? '—'}</Td>
              <Td>{humanTime(p.released_at || p.created_at)}</Td>
              <Td className="tabular-nums">{fmtUSD0(p.amount_usd)}</Td>
              <Td className="max-w-[260px] truncate font-mono text-[11px]" title={p.tx_hash || ''}>
                {p.tx_hash ? p.tx_hash.slice(0, 10) + '…' + p.tx_hash.slice(-6) : '—'}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
)}

      {/* ——— Milestones (derived) ——— */}
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
                    <Td>{m.status ?? '—'}</Td>
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