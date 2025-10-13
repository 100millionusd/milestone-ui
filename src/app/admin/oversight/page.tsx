'use client';
import * as React from 'react';

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
  type: 'sla_breach' | 'risk' | 'payment_blocked' | 'missing_invoice' | string;
  title: string;
  detail?: string;
  entityType: 'proof' | 'milestone' | 'payment' | string;
  entityId: string;
  createdAt: string;
}

interface AuditLog {
  id: string;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  meta?: any;
  createdAt: string;
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

// Use your public API origin for direct writes (auth-injector will attach Bearer)
const API_ORIGIN =
  (process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    '')!.toString().replace(/\/$/, '');

// ---------- Page ----------
export default function AdminOversightPage() {
  // --- state (safe defaults) ---
  const [summary, setSummary] = React.useState<Summary>({
    openProofs: 0,
    breachingSLA: 0,
    pendingPayouts: 0,
    escrowsLocked: 0,
    cycleTimeHoursP50: 0,
    revisionRate: 0,
  });
  const [queue, setQueue] = React.useState<QueueRow[]>([]);
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [audit, setAudit] = React.useState<AuditLog[]>([]);
  const [vendors, setVendors] = React.useState<VendorPerf[]>([]);
  const [payouts, setPayouts] = React.useState<{ pending: PayoutItem[]; recent: PayoutItem[] }>({
    pending: [],
    recent: [],
  });
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending' | 'changes_requested' | 'approved'>('all');
  const [olderThan, setOlderThan] = React.useState<number>(0);
  const [busy, setBusy] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);

  // --- resilient fetcher that never throws; always returns parsed JSON or null
  const j = React.useCallback(async (path: string) => {
    try {
      const r = await fetch(path, { credentials: 'include', cache: 'no-store' });
      const text = await r.text();
      try {
        const data = JSON.parse(text);
        return r.ok ? data : data; // surface body for non-200 too
      } catch {
        return null;
      }
    } catch {
      return null;
    }
  }, []);

  const refreshAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, q, a, au, v, p] = await Promise.all([
        j('/api/admin/oversight/summary'),
        j('/api/admin/oversight/queue'),
        j('/api/admin/oversight/alerts'),
        j('/api/audit?take=50'),
        j('/api/admin/oversight/vendors'),
        j('/api/admin/oversight/payouts'),
      ]);

      setSummary({
        openProofs: s?.openProofs ?? 0,
        breachingSLA: s?.breachingSLA ?? 0,
        pendingPayouts: s?.pendingPayouts ?? 0,
        escrowsLocked: s?.escrowsLocked ?? 0,
        cycleTimeHoursP50: s?.cycleTimeHoursP50 ?? 0,
        revisionRate: s?.revisionRate ?? 0,
      });

      setQueue(Array.isArray(q) ? (q as QueueRow[]) : []);
      setAlerts(Array.isArray(a) ? (a as AlertItem[]) : []);
      setAudit(Array.isArray(au?.events) ? (au.events as AuditLog[]) : Array.isArray(au) ? (au as AuditLog[]) : []);
      setVendors(Array.isArray(v?.vendors) ? (v.vendors as VendorPerf[]) : Array.isArray(v) ? (v as VendorPerf[]) : []);
      setPayouts({
        pending: Array.isArray(p?.pending) ? (p.pending as PayoutItem[]) : [],
        recent: Array.isArray(p?.recent) ? (p.recent as PayoutItem[]) : [],
      });
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [j]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    (async () => {
      const qs = new URLSearchParams();
      if (statusFilter !== 'all') qs.set('status', statusFilter);
      if (olderThan) qs.set('olderThanHours', String(olderThan));
      const data = await j(`/api/admin/oversight/queue?${qs.toString()}`);
      setQueue(Array.isArray(data) ? (data as QueueRow[]) : []);
    })();
  }, [statusFilter, olderThan, j]);

  // ---------- Quick actions (optimistic + rollback) ----------
  // Note: we call the API origin directly for writes.
  async function onApprove(row: QueueRow) {
    try {
      setBusy(`approve-${row.id}`);
      setQueue((q) => q.map((x) => (x.id === row.id ? { ...x, status: 'approved' } : x)));
      const url = API_ORIGIN
        ? `${API_ORIGIN}/proofs/${row.bidId}/${row.milestoneIndex}/approve`
        : `/proofs/${row.bidId}/${row.milestoneIndex}/approve`;
      await fetch(url, { method: 'POST', credentials: 'include' });
      await refreshAll();
    } catch (e: any) {
      alert(`Approve failed: ${e?.message || e}`);
      await refreshAll();
    } finally {
      setBusy('');
    }
  }

  async function onRequestChanges(row: QueueRow) {
    const reason = prompt('Reason for change request?') || '';
    try {
      setBusy(`request-${row.id}`);
      setQueue((q) => q.map((x) => (x.id === row.id ? { ...x, status: 'changes_requested' } : x)));
      const url = API_ORIGIN
        ? `${API_ORIGIN}/bids/${row.bidId}/milestones/${row.milestoneIndex}/reject`
        : `/bids/${row.bidId}/milestones/${row.milestoneIndex}/reject`;
      await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await refreshAll();
    } catch (e: any) {
      alert(`Request failed: ${e?.message || e}`);
      await refreshAll();
    } finally {
      setBusy('');
    }
  }

  async function onPay(item: PayoutItem) {
    try {
      setBusy(`pay-${item.bidId}-${item.milestoneIndex}`);
      setPayouts((p) => ({
        ...p,
        pending: (p?.pending ?? []).filter((x) => !(x.bidId === item.bidId && x.milestoneIndex === item.milestoneIndex)),
      }));
      const url = API_ORIGIN
        ? `${API_ORIGIN}/bids/${item.bidId}/pay-milestone`
        : `/bids/${item.bidId}/pay-milestone`;
      await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneIndex: item.milestoneIndex }),
      });
      await refreshAll();
    } catch (e: any) {
      alert(`Pay failed: ${e?.message || e}`);
      await refreshAll();
    } finally {
      setBusy('');
    }
  }

  async function onArchiveVendor(wallet: string) {
    try {
      setBusy(`arch-${wallet}`);
      setVendors((vs) => (vs ?? []).map((v) => (v.walletAddress === wallet ? { ...v, archived: true } : v)));
      const url = API_ORIGIN
        ? `${API_ORIGIN}/admin/vendors/${encodeURIComponent(wallet)}/archive`
        : `/admin/vendors/${encodeURIComponent(wallet)}/archive`;
      await fetch(url, { method: 'POST', credentials: 'include' });
    } catch (e: any) {
      alert(`Archive failed: ${e?.message || e}`);
      await refreshAll();
    } finally {
      setBusy('');
    }
  }
  async function onUnarchiveVendor(wallet: string) {
    try {
      setBusy(`unarch-${wallet}`);
      setVendors((vs) => (vs ?? []).map((v) => (v.walletAddress === wallet ? { ...v, archived: false } : v)));
      const url = API_ORIGIN
        ? `${API_ORIGIN}/admin/vendors/${encodeURIComponent(wallet)}/unarchive`
        : `/admin/vendors/${encodeURIComponent(wallet)}/unarchive`;
      await fetch(url, { method: 'POST', credentials: 'include' });
    } catch (e: any) {
      alert(`Unarchive failed: ${e?.message || e}`);
      await refreshAll();
    } finally {
      setBusy('');
    }
  }
  async function onDeleteVendor(wallet: string) {
    if (!confirm('Delete vendor profile? Bids remain.')) return;
    try {
      setBusy(`del-${wallet}`);
      setVendors((vs) => (vs ?? []).filter((v) => v.walletAddress !== wallet));
      const url = API_ORIGIN
        ? `${API_ORIGIN}/admin/vendors/${encodeURIComponent(wallet)}`
        : `/admin/vendors/${encodeURIComponent(wallet)}`;
      await fetch(url, { method: 'DELETE', credentials: 'include' });
    } catch (e: any) {
      alert(`Delete failed: ${e?.message || e}`);
      await refreshAll();
    } finally {
      setBusy('');
    }
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

        {/* Error banner */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Oversight data load issue: {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KPI title="Open proofs" value={summary?.openProofs ?? '—'} />
          <KPI title="Breaching SLA" value={summary?.breachingSLA ?? '—'} tone="danger" />
          <KPI title="Pending payouts" value={summary?.pendingPayouts ?? '—'} />
          <KPI title="Escrows locked" value={summary?.escrowsLocked ?? '—'} />
          <KPI title="P50 cycle (h)" value={summary?.cycleTimeHoursP50 ?? '—'} />
          <KPI
            title="Revision rate"
            value={typeof summary?.revisionRate === 'number' ? `${Math.round((summary?.revisionRate ?? 0) * 100)}%` : '—'}
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
                    {(queue ?? []).map((q) => (
                      <tr key={q.id} className="border-t hover:bg-gray-50">
                        <Td className="font-mono text-[13px]">{q.id}</Td>
                        <Td>{q.vendor}</Td>
                        <Td>
                          {q.project} • M{Number.isFinite(q.milestoneIndex) ? q.milestoneIndex : '—'}
                        </Td>
                        <Td>{q.ageHours}h</Td>
                        <Td className={q.slaDueInHours < 0 ? 'text-red-600' : 'text-gray-600'}>
                          {q.slaDueInHours < 0 ? `${-q.slaDueInHours}h over` : `${q.slaDueInHours}h left`}
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
                    ))}
                    {!loading && !(queue ?? []).length && (
                      <tr>
                        <Td colSpan={8} className="py-8 text-center text-gray-500">
                          No items
                        </Td>
                      </tr>
                    )}
                    {loading && (
                      <tr>
                        <Td colSpan={8} className="py-8 text-center text-gray-400">
                          Loading…
                        </Td>
                      </tr>
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
                    {(vendors ?? []).map((v) => (
                      <tr key={v.walletAddress} className="border-t hover:bg-gray-50">
                        <Td className="font-medium">{v.vendorName || '—'}</Td>
                        <Td className="hidden md:table-cell font-mono text-[12px]">{v.walletAddress || '—'}</Td>
                        <Td className="text-right">{v.proofsTotal}</Td>
                        <Td className="text-right">{v.approved}</Td>
                        <Td className="text-right">{v.changesRequested}</Td>
                        <Td className="text-right">{Math.round((v.approvalRate ?? 0) * 100)}%</Td>
                        <Td className="text-right hidden lg:table-cell">{v.bidsCount ?? '—'}</Td>
                        <Td className="text-right hidden lg:table-cell">
                          {v.totalAwardedUSD
                            ? Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
                                v.totalAwardedUSD
                              )
                            : '—'}
                        </Td>
                        <Td className="hidden md:table-cell">
                          {v.lastProofAt
                            ? new Date(v.lastProofAt).toLocaleString()
                            : v.lastBidAt
                            ? new Date(v.lastBidAt).toLocaleString()
                            : '—'}
                        </Td>
                        <Td>
                          <div className="flex gap-2">
                            {!v.archived ? (
                              <button
                                disabled={busy === `arch-${v.walletAddress}`}
                                onClick={() => onArchiveVendor(v.walletAddress)}
                                className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                disabled={busy === `unarch-${v.walletAddress}`}
                                onClick={() => onUnarchiveVendor(v.walletAddress)}
                                className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                              >
                                Unarchive
                              </button>
                            )}
                            <button
                              disabled={busy === `del-${v.walletAddress}`}
                              onClick={() => onDeleteVendor(v.walletAddress)}
                              className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                    {!loading && !(vendors ?? []).length && (
                      <tr>
                        <Td colSpan={10} className="py-8 text-center text-gray-500">
                          No vendor activity
                        </Td>
                      </tr>
                    )}
                    {loading && (
                      <tr>
                        <Td colSpan={10} className="py-8 text-center text-gray-400">
                          Loading…
                        </Td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <section>
            <Card title="Alerts">
              <ul className="space-y-2">
                {(alerts ?? []).map((a) => (
                  <li key={a.id} className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-gray-500">{new Date(a.createdAt).toLocaleString()}</div>
                    <div className="font-medium">{a.title}</div>
                    <div className="text-xs text-gray-600">{a.detail}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {a.entityType} #{a.entityId}
                    </div>
                  </li>
                ))}
                {!loading && !(alerts ?? []).length && <li className="py-8 text-center text-gray-500">No alerts</li>}
                {loading && <li className="py-8 text-center text-gray-400">Loading…</li>}
              </ul>
            </Card>

            <Card title="Payouts & Escrow">
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Pending</div>
                  <ul className="divide-y rounded-lg border">
                    {(payouts?.pending ?? []).map((p) => (
                      <li key={`p-${p.bidId}-${p.milestoneIndex}`} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <div className="font-medium">
                            {p.vendorName || '—'} • Bid {p.bidId} • M{p.milestoneIndex + 1}
                          </div>
                          <div className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</div>
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
                    ))}
                    {!loading && !(payouts?.pending ?? []).length && <li className="p-4 text-center text-gray-500">No pending payouts</li>}
                    {loading && <li className="p-4 text-center text-gray-400">Loading…</li>}
                  </ul>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Recent</div>
                  <ul className="divide-y rounded-lg border">
                    {(payouts?.recent ?? []).map((p) => (
                      <li key={`r-${p.bidId}-${p.milestoneIndex}-${p.txHash || 'tx'}`} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <div className="font-medium">
                            {p.vendorName || '—'} • Bid {p.bidId} • M{p.milestoneIndex + 1}
                          </div>
                          <div className="text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{p.amount ? `${p.amount} ${p.currency || 'USDC'}` : p.currency || ''}</div>
                          <div className="text-xs text-gray-500 truncate max-w-[160px]">{p.txHash || ''}</div>
                        </div>
                      </li>
                    ))}
                    {!loading && !(payouts?.recent ?? []).length && <li className="p-4 text-center text-gray-500">No recent payouts</li>}
                    {loading && <li className="p-4 text-center text-gray-400">Loading…</li>}
                  </ul>
                </div>
              </div>
            </Card>
          </section>
        </div>

        <section className="mt-6">
          <Card title="Recent activity">
            <ul className="divide-y rounded-xl border bg-white">
              {(audit ?? []).map((l) => (
                <li key={l.id} className="p-3 text-sm">
                  <div className="text-xs text-gray-500">{new Date(l.createdAt).toLocaleString()}</div>
                  <div className="font-medium">{l.actorLabel || 'System'} • {l.action}</div>
                  <div className="text-xs text-gray-600">
                    {l.entityType} #{l.entityId}
                  </div>
                  {l.meta && <pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(l.meta, null, 2)}</pre>}
                </li>
              ))}
              {!loading && !(audit ?? []).length && <li className="p-6 text-center text-gray-500">No recent activity</li>}
              {loading && <li className="p-6 text-center text-gray-400">Loading…</li>}
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
  return (
    <td colSpan={colSpan} className={`px-3 py-2 ${className || ''}`}>
      {children}
    </td>
  );
}
