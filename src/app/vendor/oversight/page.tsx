'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useState } from 'react';

// ———————————————————————————————————————————
// API base + same-origin fallback
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
const api = (p: string) => (API_BASE ? `${API_BASE}${p}` : `/api${p}`);

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
// Normalizers
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
    const idx = toIdx(r?.milestone_index) ?? toIdx(r?.milestoneIndex) ?? toIdx(r?.milestone) ?? null;
    const bidNum = toIdx(r?.bid_id) ?? toIdx(r?.bidId) ?? toIdx(r?.bid?.id) ?? null;

    return {
      id: Number(r?.id ?? r?.proof_id ?? r?.proofId),
      bid_id: bidNum,
      milestone_index: idx,
      vendor_name: r?.vendor_name ?? r?.vendorName ?? r?.vendor ?? null,
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
    id: r?.id ?? r?.payment_id ?? r?.payout_id ?? '—',
    bid_id: toNum(r?.bid_id ?? r?.bidId ?? r?.bid?.id),
    milestone_index: toNum(r?.milestone_index ?? r?.milestoneIndex ?? r?.milestone),
    amount_usd: toUsd(r?.amount_usd ?? r?.amountUsd ?? r?.usd ?? (r?.usdCents != null ? r.usdCents / 100 : r?.amount)),
    status: r?.status ?? r?.state ?? r?.payout_status ?? null,
    released_at: r?.released_at ?? r?.releasedAt ?? r?.paid_at ?? r?.created_at ?? r?.createdAt ?? null,
    tx_hash: r?.tx_hash ?? r?.transaction_hash ?? r?.hash ?? null,
    created_at: r?.created_at ?? r?.createdAt ?? null,
    updated_at: r?.updated_at ?? r?.updatedAt ?? null,
  }));
}

// Derive milestones from proofs
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

// ———————————————————————————————————————————
// Page Component
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
    
    const fetchWithAuth = async (url: string) => {
      try {
        const response = await fetch(url, {
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
        
        return await response.json();
      } catch (error) {
        console.warn(`Failed to fetch ${url}:`, error);
        return null;
      }
    };

    (async () => {
      try {
        setErr(null);
        setLoading(true);

        // Get user role
        const roleData = await fetchWithAuth(`${api('/auth/role')}?t=${Date.now()}`);
        if (!aborted && roleData) setRole(roleData);

        // Fetch bids - try multiple vendor-specific endpoints
        let bidList: BidRow[] = [];
        
        // Try vendor-specific bid endpoints
        const bidEndpoints = [
          '/bids?mine=1',
          '/vendor/bids',
          '/my/bids',
          '/bids'
        ];

        for (const endpoint of bidEndpoints) {
          if (aborted) break;
          const data = await fetchWithAuth(`${api(endpoint)}?t=${Date.now()}`);
          if (data) {
            const normalized = normalizeBids(Array.isArray(data) ? data : (data?.bids ?? data ?? []));
            if (normalized.length > 0) {
              bidList = normalized;
              break;
            }
          }
        }

        if (!aborted) setBids(bidList);

        // Fetch proofs - only use per-bid approach since /proofs endpoints return 400
        let proofsList: any[] = [];
        
        if (bidList.length > 0) {
          const results: any[] = [];
          const ids = Array.from(new Set(bidList.map(b => Number(b.id)).filter(n => Number.isFinite(n) && n > 0)));
          
          // Fetch proofs for each bid individually
          for (const id of ids) {
            if (aborted) break;
            
            // Try multiple proof endpoints per bid
            const proofEndpoints = [
              `/bids/${id}/proofs`,
              `/vendor/bids/${id}/proofs`,
              `/my/bids/${id}/proofs`
            ];

            for (const endpoint of proofEndpoints) {
              const data = await fetchWithAuth(`${api(endpoint)}?t=${Date.now()}`);
              if (data) {
                const proofData = Array.isArray(data) ? data : (data?.proofs ?? []);
                results.push(...proofData);
                break;
              }
            }
          }
          
          proofsList = results;
        }

        const proofRows = normalizeProofs(proofsList);
        if (!aborted) setProofs(proofRows);

        // Derive milestones from proofs
        const ms = deriveMilestonesFromProofs(proofRows);
        if (!aborted) setMilestones(ms);

        // Fetch payments - try multiple endpoints
        let payList: any[] = [];
        
        const paymentEndpoints = [
          '/vendor/payments',
          '/my/payments', 
          '/vendor/transactions',
          '/my/transactions'
        ];

        for (const endpoint of paymentEndpoints) {
          if (aborted) break;
          const data = await fetchWithAuth(`${api(endpoint)}?t=${Date.now()}`);
          if (data) {
            payList = Array.isArray(data) ? data : (data?.payments ?? data?.transactions ?? []);
            if (payList.length > 0) break;
          }
        }

        // Fallback: get payments from bids if direct endpoints don't work
        if (payList.length === 0 && bidList.length > 0) {
          const paymentResults: any[] = [];
          
          for (const bid of bidList) {
            if (aborted) break;
            
            const paymentEndpoints = [
              `/bids/${bid.id}/payments`,
              `/vendor/bids/${bid.id}/payments`,
              `/my/bids/${bid.id}/payments`
            ];

            for (const endpoint of paymentEndpoints) {
              const data = await fetchWithAuth(`${api(endpoint)}?t=${Date.now()}`);
              if (data) {
                const paymentData = Array.isArray(data) ? data : (data?.payments ?? []);
                paymentResults.push(...paymentData);
                break;
              }
            }
          }
          
          payList = paymentResults;
        }

        if (!aborted) setPayments(normalizePayments(payList));

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