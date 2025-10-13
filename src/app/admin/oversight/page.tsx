'use client';
import * as React from 'react';
import { getBids, getProposals } from '@/lib/api'; // fallback aggregation

// ---------- Types ----------
interface Summary {
  openProofs: number;
  breachingSLA: number;
  pendingPayouts: number;
  escrowsLocked?: number;
  cycleTimeHoursP50: number;
  revisionRate?: number;
}
type ProofStatus = 'pending' | 'changes_requested' | 'approved' | 'archived' | 'rejected';
interface QueueRow {
  id: string;
  bidId: number;
  milestoneIndex: number;
  vendor: string;
  project: string;
  status: ProofStatus;
  submittedAt: string;
  ageHours: number;
  slaDueInHours: number;
  risk?: 'low' | 'medium' | 'high';
}
interface AlertItem {
  id: string;
  type: string;
  title?: string;
  detail?: string;
  entityType?: string;
  entityId?: string | number;
  createdAt?: string;
}
interface AuditLog {
  id: string;
  actorLabel?: string | null;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | number | null;
  createdAt?: string | number | null;
  timestamp?: string | number | null; // some APIs use timestamp
  meta?: any;
}
interface VendorPerf {
  walletAddress: string;
  vendorName: string;
  proofsTotal: number;
  approved: number;
  changesRequested: number;
  approvalRate: number; // 0..1
  bidsCount?: number;
  totalAwardedUSD?: number;
  lastProofAt?: string | null;
  lastBidAt?: string | null;
  email?: string | null;
  phone?: string | null;
  archived?: boolean;
}
interface PayoutItem {
  bidId: number;
  milestoneIndex: number;
  vendorName: string;
  walletAddress: string;
  currency?: string;
  amount?: number;
  txHash?: string | null;
  createdAt: string;
}

// ---------- Utils ----------
const safeDate = (v: any) => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  const d = isNaN(n) ? new Date(String(v)) : new Date(n);
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (v: any) => {
  const d = safeDate(v);
  return d ? d.toLocaleString() : '—';
};
const nonEmpty = <T,>(a: T[] | undefined | null): T[] => (Array.isArray(a) ? a : []);

// ---------- Page ----------
export default function AdminOversightPage() {
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [queue, setQueue] = React.useState<QueueRow[]>([]);
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [audit, setAudit] = React.useState<AuditLog[]>([]);
  const [vendors, setVendors] = React.useState<VendorPerf[]>([]);
  const [payouts, setPayouts] = React.useState<{ pending: PayoutItem[]; recent: PayoutItem[] }>({ pending: [], recent: [] });
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending' | 'changes_requested' | 'approved'>('all');
  const [olderThan, setOlderThan] = React.useState<number>(0);
  const [busy, setBusy] = React.useState<string>('');

  const fetchJSON = (url: string, init?: RequestInit) =>
    fetch(url, { credentials: 'include', cache: 'no-store', ...(init || {}) }).then(async (r) => {
      const text = await r.text();
      let data: any;
      try { data = text ? JSON.parse(text) : (Array.isArray(text) ? text : {}); } catch { data = {}; }
      if (!r.ok) {
        const msg = (data && (data.error || data.message)) || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      return data;
    });

  // Fallback: build vendor perf from bids if API returns empty
  const buildVendorsFromBids = async (): Promise<VendorPerf[]> => {
    try {
      const [bids, proposals] = await Promise.all([getBids(), getProposals()]);
      const titleById = new Map<number, string>();
      for (const p of nonEmpty(proposals)) titleById.set(Number(p.proposalId), p.title || `Project #${p.proposalId}`);

      const map = new Map<string, VendorPerf>();
      for (const b of nonEmpty(bids)) {
        const wallet = b.walletAddress || '';
        const key = wallet || (b.vendorName || 'unknown');
        const cur = map.get(key) || {
          walletAddress: wallet,
          vendorName: b.vendorName || '—',
          proofsTotal: 0,
          approved: 0,
          changesRequested: 0,
          approvalRate: 0,
          bidsCount: 0,
          totalAwardedUSD: 0,
          lastBidAt: null,
          lastProofAt: null,
          email: null,
          phone: null,
          archived: false,
        };
        cur.bidsCount = (cur.bidsCount || 0) + 1;
        if (b.status === 'approved' || b.status === 'completed') {
          cur.totalAwardedUSD = (cur.totalAwardedUSD || 0) + (Number(b.priceUSD) || 0);
        }
        map.set(key, cur);
      }
      return [...map.values()];
    } catch {
      return [];
    }
  };

  const refreshAll = React.useCallback(async () => {
    const [s, q, a, l, v, p] = await Promise.allSettled([
      fetchJSON('/api/admin/oversight/summary'),
      fetchJSON('/api/admin/oversight/queue'),
      fetchJSON('/api/admin/oversight/alerts'),
      fetchJSON('/api/audit?take=50'),
      fetchJSON('/api/admin/oversight/vendors'),
      fetchJSON('/api/admin/oversight/payouts'),
    ]);

    if (s.status === 'fulfilled') setSummary(s.value as Summary);
    if (q.status === 'fulfilled') setQueue(nonEmpty<QueueRow>(q.value));
    if (a.status === 'fulfilled') setAlerts(nonEmpty<AlertItem>(a.value));
    if (l.status === 'fulfilled') setAudit(nonEmpty<AuditLog>(l.value));
    if (p.status === 'fulfilled') setPayouts({ pending: nonEmpty<PayoutItem>(p.value?.pending), recent: nonEmpty<PayoutItem>(p.value?.recent) });

    if (v.status === 'fulfilled' && nonEmpty<VendorPerf>(v.value).length) {
      setVendors(v.value);
    } else {
      // 🔁 fallback if oversight/vendors not implemented or empty
      const fallback = await buildVendorsFromBids();
      setVendors(fallback);
    }
  }, []);

  React.useEffect(() => { refreshAll(); }, [refreshAll]);

  React.useEffect(() => {
    (async () => {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (olderThan) qs.set('olderThanHours', String(olderThan));
      try {
        const q = await fetchJSON(`/api/admin/oversight/queue?${qs.toString()}`);
        setQueue(nonEmpty<QueueRow>(q));
      } catch {
        // leave queue as-is
      }
    })();
  }, [statusFilter, olderThan]);

  // ---------- Quick actions ----------
  async function onApprove(row: QueueRow) {
    try {
      setBusy(`approve-${row.id}`);
      setQueue((q) => q.map((x) => (x.id === row.id ? { ...x, status: 'approved' } : x)));
      await fetchJSON(`/proofs/${row.bidId}/${row.milestoneIndex}/approve`, { method: 'POST' });
      await refreshAll();
    } catch (e: any) {
      alert(`Approve failed: ${e?.message || e}`);
      await refreshAll();
    } finally { setBusy(''); }
  }
  async function onRequestChanges(row: QueueRow) {
    const reason = prompt('Reason for change request?') || '';
    try {
      setBusy(`request-${row.id}`);
      setQueue((q) => q.map((x) => (x.id === row.id ? { ...x, status: 'changes_requested' } : x)));
      await fetchJSON(`/bids/${row.bidId}/milestones/${row.milestoneIndex}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await refreshAll();
    } catch (e: any) {
      alert(`Request failed: ${e?.message || e}`);
      await refreshAll();
    } finally { setBusy(''); }
  }
  async function onPay(item: PayoutItem) {
    try {
      setBusy(`pay-${item.bidId}-${item.milestoneIndex}`);
      setPayouts((p) => ({ ...p, pending: p.pending.filter((x) => !(x.bidId === item.bidId && x.milestoneIndex === item.milestoneIndex)) }));
      await fetchJSON(`/bids/${item.bidId}/pay-milestone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneIndex: item.milestoneIndex }),
      });
      await refreshAll();
    } catch (e: any) {
      alert(`Pay failed: ${e?.message || e}`);
      await refreshAll();
    } finally { setBusy(''); }
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin Oversight</h1>
          <div className="flex gap-2">
            <select
              className="rounded-md border px-2 py-1 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="changes_requested">Changes requested</option>
              <option value="approved">Approved</option>
            </select>
            <select className="rounded-md border px-2 py-1 text-sm" value={olderThan} onChange={(e) => setOlderThan(Number(e.target.value))}>
              <option value={0}>Any age</option>
              <option value={24}>&gt; 24h</option>
              <option value={48}>&gt; 48h</option>
              <option value={72}>&gt; 72h</option>
            </select>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KPI title="Open proofs" value={summary?.openProofs ?? '—'} />
          <KPI title="Breaching SLA" value={summary?.breachingSLA ?? '—'} tone="danger" />
          <KPI title="Pending payouts" value={summary?.pendingPayouts ?? '—'} />
          <KPI title="Escrows locked" value={summary?.escrowsLocked ?? '—'} />
          <KPI title="P50 cycle (h)" value={summary?.cycleTimeHoursP50 ?? '—'} />
          <KPI
            title="Revision rate"
            value={summary && typeof summary.revisionRate === 'number' ? `${Math.round(summary.revisionRate * 100)}%` : (summary ? '0%' : '—')}
          />
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <Card title="Queue health">
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>ID</Th>
                      <Th>Vendor</Th>
                      <Th>Project / Milestone</Th>
                      <Th>Age</Th>
                      <Th>SLA</Th>
                      <Th>Status</Th>
                      <Th>Risk</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonEmpty(queue).length ? nonEmpty(queue).map((q) => (
                      <tr key={q.id} className="border-t hover:bg-gray-50">
                        <Td className="font-mono text-[13px]">{q.id}</Td>
                        <Td>{q.vendor || '—'}</Td>
                        <Td>{q.project || '—'} • M{Number.isFinite(q.milestoneIndex) ? q.milestoneIndex : '—'}</Td>
                        <Td>{Math.max(0, Math.round(q.ageHours))}h</Td>
                        <Td className={q.slaDueInHours < 0 ? 'text-red-600' : 'text-gray-600'}>
                          {q.slaDueInHours < 0 ? `${-Math.round(q.slaDueInHours)}h over` : `${Math.round(q.slaDueInHours)}h left`}
                        </Td>
                        <Td>
                          <span
                            className={
                              'inline-block rounded-full px-2 py-0.5 text-xs ' +
                              (q.status === 'approved'
                                ? 'bg-green-100 text-green-700'
                                : q.status === 'changes_requested'
                                ? 'bg-yellow-100 text-yellow-800'
                                : q.status === 'archived'
                                ? 'bg-gray-200 text-gray-700'
                                : q.status === 'rejected'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-100 text-blue-700')
                            }
                          >
                            {q.status}
                          </span>
                        </Td>
                        <Td>
                          <span
                            className={
                              'inline-block rounded-full px-2 py-0.5 text-xs ' +
                              (q.risk === 'high'
                                ? 'bg-red-100 text-red-700'
                                : q.risk === 'medium'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-700')
                            }
                          >
                            {q.risk || '—'}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex gap-2">
                            <button
                              disabled={busy === `approve-${q.id}`}
                              onClick={() => onApprove(q)}
                              className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              disabled={busy === `request-${q.id}`}
                              onClick={() => onRequestChanges(q)}
                              className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                              Request
                            </button>
                          </div>
                        </Td>
                      </tr>
                    )) : (
                      <tr><Td colSpan={8} className="py-8 text-center text-gray-500">No items</Td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Vendor performance">
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Vendor</Th>
                      <Th className="hidden md:table-cell">Wallet</Th>
                      <Th className="text-right">Proofs</Th>
                      <Th className="text-right">Approved</Th>
                      <Th className="text-right">CR</Th>
                      <Th className="text-right">Approval %</Th>
                      <Th className="text-right hidden lg:table-cell">Bids</Th>
                      <Th className="text-right hidden lg:table-cell">Awarded USD</Th>
                      <Th className="hidden md:table-cell">Last activity</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonEmpty(vendors).length ? nonEmpty(vendors).map((v) => (
                      <tr key={v.walletAddress || v.vendorName} className="border-t hover:bg-gray-50">
                        <Td className="font-medium">{v.vendorName || '—'}</Td>
                        <Td className="hidden md:table-cell font-mono text-[12px]">{v.walletAddress || '—'}</Td>
                        <Td className="text-right">{v.proofsTotal ?? 0}</Td>
                        <Td className="text-right">{v.approved ?? 0}</Td>
                        <Td className="text-right">{v.changesRequested ?? 0}</Td>
                        <Td className="text-right">{Math.round((v.approvalRate ?? 0) * 100)}%</Td>
                        <Td className="text-right hidden lg:table-cell">{v.bidsCount ?? '—'}</Td>
                        <Td className="text-right hidden lg:table-cell">
                          {v.totalAwardedUSD != null
                            ? Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                                Number(v.totalAwardedUSD || 0)
                              )
                            : '—'}
                        </Td>
                        <Td className="hidden md:table-cell">
                          {v.lastProofAt ? fmt(v.lastProofAt) : v.lastBidAt ? fmt(v.lastBidAt) : '—'}
                        </Td>
                        <Td>
                          <div className="flex gap-2 opacity-60"><span className="text-xs">—</span></div>
                        </Td>
                      </tr>
                    )) : (
                      <tr><Td colSpan={10} className="py-8 text-center text-gray-500">No vendor activity</Td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <section>
            <Card title="Alerts">
              <ul className="space-y-2">
                {nonEmpty(alerts).length ? nonEmpty(alerts).map((a) => (
                  <li key={a.id} className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-gray-500">{fmt(a.createdAt)}</div>
                    <div className="font-medium">{a.title || a.type || '—'}</div>
                    <div className="text-xs text-gray-600">{a.detail}</div>
                    {(a.entityType || a.entityId) && (
                      <div className="mt-1 text-xs text-gray-500">
                        {a.entityType || 'entity'} #{String(a.entityId ?? '')}
                      </div>
                    )}
                  </li>
                )) : <li className="py-8 text-center text-gray-500">No alerts</li>}
              </ul>
            </Card>

            <Card title="Payouts & Escrow">
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Pending</div>
                  <ul className="divide-y rounded-lg border">
                    {nonEmpty(payouts.pending).length ? payouts.pending.map((p) => (
                      <li key={`p-${p.bidId}-${p.milestoneIndex}`} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <div className="font-medium">{p.vendorName || '—'} • Bid {p.bidId} • M{p.milestoneIndex + 1}</div>
                          <div className="text-xs text-gray-500">{fmt(p.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{p.amount ? `${p.amount} ${p.currency || 'USDC'}` : p.currency || ''}</div>
                          <button
                            disabled={busy === `pay-${p.bidId}-${p.milestoneIndex}`}
                            onClick={() => onPay(p)}
                            className="mt-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                          >
                            Pay
                          </button>
                        </div>
                      </li>
                    )) : <li className="p-4 text-center text-gray-500">No pending payouts</li>}
                  </ul>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Recent</div>
                  <ul className="divide-y rounded-lg border">
                    {nonEmpty(payouts.recent).length ? payouts.recent.map((p) => (
                      <li key={`r-${p.bidId}-${p.milestoneIndex}-${p.txHash || Math.random()}`} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <div className="font-medium">{p.vendorName || '—'} • Bid {p.bidId} • M{p.milestoneIndex + 1}</div>
                          <div className="text-xs text-gray-500">{fmt(p.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{p.amount ? `${p.amount} ${p.currency || 'USDC'}` : p.currency || ''}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[160px]">{p.txHash || ''}</div>
                        </div>
                      </li>
                    )) : <li className="p-4 text-center text-gray-500">No recent payouts</li>}
                  </ul>
                </div>
              </div>
            </Card>
          </section>
        </div>

        <section className="mt-6">
          <Card title="Recent activity">
            <ul className="divide-y rounded-xl border bg-white">
              {nonEmpty(audit).length ? nonEmpty(audit).map((l) => {
                const when = l.timestamp ?? l.createdAt;
                return (
                  <li key={String(l.id)} className="p-3 text-sm">
                    <div className="text-xs text-gray-500">{fmt(when)}</div>
                    <div className="font-medium">{l.actorLabel || 'System'} • {l.action || '—'}</div>
                    {(l.entityType || l.entityId) && (
                      <div className="text-xs text-gray-600">
                        {l.entityType || 'entity'} #{String(l.entityId ?? '')}
                      </div>
                    )}
                    {l.meta && <pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(l.meta, null, 2)}</pre>}
                  </li>
                );
              }) : <li className="p-6 text-center text-gray-500">No recent activity</li>}
            </ul>
          </Card>
        </section>
      </div>
    </div>
  );
}

// ---------- Small UI helpers ----------
function KPI({ title, value, tone }: { title: string; value: React.ReactNode; tone?: 'danger' | 'ok' }) {
  const toneCls = tone === 'danger' ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white';
  return (
    <div className={`rounded-2xl border ${toneCls} p-4 shadow-sm`}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}
function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 ${className || ''}`}>{children}</th>;
}
function Td({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-3 py-2 ${className || ''}`}>{children}</td>;
}
