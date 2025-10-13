'use client';
import * as React from 'react';

// ---------- Types ----------
type ProofStatus = 'pending' | 'changes_requested' | 'approved' | 'archived' | 'rejected';

interface Summary {
  openProofs: number;
  breachingSLA: number;
  pendingPayouts: number;
  escrowsLocked?: number;
  cycleTimeHoursP50: number;
  revisionRate?: number;
}
interface QueueRow {
  id: string;
  bidId: number;
  milestoneIndex: number;
  vendor: string;
  project: string;
  status: ProofStatus;
  submittedAt?: string;
  ageHours: number;
  slaDueInHours: number;
  risk?: 'low' | 'medium' | 'high';
}
interface AlertItem {
  id: string;
  type?: string;
  title?: string;
  detail?: string;
  entityType?: string;
  entityId?: string | number;
  createdAt?: string;
}
interface AuditLog {
  id: string | number;
  actorLabel?: string | null;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | number | null;
  meta?: any;
  createdAt?: string;
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

// --- read token from localStorage and attach to /api/admin/oversight call
function b64urlDecode(s: string) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return atob(s);
}
function getToken(): string | null {
  try {
    const keys = ['lx_jwt', 'lx_token', 'token'];
    for (const k of keys) {
      const t = localStorage.getItem(k);
      if (!t) continue;
      try {
        const payload = JSON.parse(b64urlDecode(t.split('.')[1] || ''));
        if (payload?.exp && Date.now() > payload.exp * 1000) {
          localStorage.removeItem(k);
          continue;
        }
      } catch {}
      return t;
    }
    const anyJwt = Object.values(localStorage).find(
      (v) => typeof v === 'string' && v.split('.').length === 3 && (v as string).length > 40
    );
    return (anyJwt as string) || null;
  } catch {
    return null;
  }
}

// ---------- Page ----------
export default function AdminOversightPage() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [queue, setQueue] = React.useState<QueueRow[]>([]);
  const [alerts, setAlerts] = React.useState<AlertItem[]>([]);
  const [audit, setAudit] = React.useState<AuditLog[]>([]);
  const [vendors, setVendors] = React.useState<VendorPerf[]>([]);
  const [payouts, setPayouts] = React.useState<{ pending: PayoutItem[]; recent: PayoutItem[] }>({ pending: [], recent: [] });

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: HeadersInit = {};
      const tok = getToken();
      if (tok) headers['authorization'] = `Bearer ${tok}`;

      const r = await fetch('/api/admin/oversight', {
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);

      setSummary(data.summary ?? null);
      setQueue(Array.isArray(data.queue) ? data.queue : []);
      setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      setAudit(Array.isArray(data.audit) ? data.audit : []);
      const v = Array.isArray(data.vendors) ? data.vendors : [];
      setVendors(v.map((x: any) => ({
        walletAddress: x.walletAddress || x.wallet || '',
        vendorName: x.vendorName || x.name || '',
        proofsTotal: Number(x.proofsTotal || 0),
        approved: Number(x.approved || 0),
        changesRequested: Number(x.changesRequested || 0),
        approvalRate: Number.isFinite(x.approvalRate) ? x.approvalRate : 0,
        bidsCount: Number.isFinite(x.bidsCount) ? x.bidsCount : undefined,
        totalAwardedUSD: Number.isFinite(x.totalAwardedUSD) ? x.totalAwardedUSD : undefined,
        lastProofAt: x.lastProofAt ?? null,
        lastBidAt: x.lastBidAt ?? null,
        archived: !!x.archived,
      })));
      const p = data.payouts || {};
      setPayouts({
        pending: Array.isArray(p.pending) ? p.pending : [],
        recent: Array.isArray(p.recent) ? p.recent : [],
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load oversight');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin Oversight</h1>
          <div className="flex items-center gap-2">
            {error && <span className="text-sm text-red-600">{error}</span>}
            <button
              onClick={fetchAll}
              className="rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KPI title="Open proofs" value={fmt(summary?.openProofs)} />
          <KPI title="Breaching SLA" value={fmt(summary?.breachingSLA)} tone="danger" />
          <KPI title="Pending payouts" value={fmt(summary?.pendingPayouts)} />
          <KPI title="Escrows locked" value={fmt(summary?.escrowsLocked)} />
          <KPI title="P50 cycle (h)" value={fmt(summary?.cycleTimeHoursP50)} />
          <KPI title="Revision rate" value={summary?.revisionRate != null ? `${Math.round((summary.revisionRate || 0) * 100)}%` : '—'} />
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <Card title="Queue health">
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>ID</Th><Th>Vendor</Th><Th>Project / Milestone</Th>
                      <Th>Age</Th><Th>SLA</Th><Th>Status</Th><Th>Risk</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(queue || []).map((q) => (
                      <tr key={q.id} className="border-t hover:bg-gray-50">
                        <Td className="font-mono text-[13px]">{q.id}</Td>
                        <Td>{q.vendor}</Td>
                        <Td>{q.project} • M{Number.isFinite(q.milestoneIndex) ? q.milestoneIndex : '—'}</Td>
                        <Td>{Number.isFinite(q.ageHours) ? `${q.ageHours}h` : '—'}</Td>
                        <Td className={(q.slaDueInHours ?? 0) < 0 ? 'text-red-600' : 'text-gray-600'}>
                          {Number.isFinite(q.slaDueInHours)
                            ? (q.slaDueInHours < 0 ? `${-q.slaDueInHours}h over` : `${q.slaDueInHours}h left`)
                            : '—'}
                        </Td>
                        <Td><StatusPill status={q.status} /></Td>
                        <Td><RiskPill risk={q.risk} /></Td>
                      </tr>
                    ))}
                    {!queue?.length && (
                      <tr><Td colSpan={7} className="py-8 text-center text-gray-500">No items</Td></tr>
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
                    </tr>
                  </thead>
                  <tbody>
                    {(vendors || []).map((v) => (
                      <tr key={v.walletAddress} className="border-t hover:bg-gray-50">
                        <Td className="font-medium">{v.vendorName || '—'}</Td>
                        <Td className="hidden md:table-cell font-mono text-[12px]">{v.walletAddress || '—'}</Td>
                        <Td className="text-right">{v.proofsTotal}</Td>
                        <Td className="text-right">{v.approved}</Td>
                        <Td className="text-right">{v.changesRequested}</Td>
                        <Td className="text-right">{Math.round((v.approvalRate || 0) * 100)}%</Td>
                        <Td className="text-right hidden lg:table-cell">{v.bidsCount ?? '—'}</Td>
                        <Td className="text-right hidden lg:table-cell">{v.totalAwardedUSD != null ? usd(v.totalAwardedUSD) : '—'}</Td>
                        <Td className="hidden md:table-cell">
                          {v.lastProofAt ? new Date(v.lastProofAt).toLocaleString()
                           : v.lastBidAt ? new Date(v.lastBidAt).toLocaleString() : '—'}
                        </Td>
                      </tr>
                    ))}
                    {!vendors?.length && (
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
                {(alerts || []).map((a) => (
                  <li key={a.id} className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-gray-500">
                      {a.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}
                    </div>
                    <div className="font-medium">{a.title || a.type || '—'}</div>
                    {!!a.detail && <div className="text-xs text-gray-600">{a.detail}</div>}
                    {(a.entityType || a.entityId) && (
                      <div className="mt-1 text-xs text-gray-500">
                        {a.entityType || 'entity'} #{a.entityId ?? '—'}
                      </div>
                    )}
                  </li>
                ))}
                {!alerts?.length && <li className="py-8 text-center text-gray-500">No alerts</li>}
              </ul>
            </Card>

            <Card title="Payouts & Escrow">
              <div className="space-y-3">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Pending</div>
                  <ul className="divide-y rounded-lg border">
                    {(payouts.pending || []).map((p) => (
                      <li key={`p-${p.bidId}-${p.milestoneIndex}`} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <div className="font-medium">{p.vendorName || '—'} • Bid {p.bidId} • M{(p.milestoneIndex ?? 0) + 1}</div>
                          <div className="text-xs text-gray-500">{p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            {p.amount != null ? `${p.amount} ${p.currency || 'USDC'}` : (p.currency || '—')}
                          </div>
                        </div>
                      </li>
                    ))}
                    {!payouts.pending?.length && <li className="p-4 text-center text-gray-500">No pending payouts</li>}
                  </ul>
                </div>

                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-600">Recent</div>
                  <ul className="divide-y rounded-lg border">
                    {(payouts.recent || []).map((p) => (
                      <li key={`r-${p.bidId}-${p.milestoneIndex}-${p.txHash || Math.random()}`} className="flex items-center justify-between p-3 text-sm">
                        <div>
                          <div className="font-medium">{p.vendorName || '—'} • Bid {p.bidId} • M{(p.milestoneIndex ?? 0) + 1}</div>
                          <div className="text-xs text-gray-500">{p.createdAt ? new Date(p.createdAt).toLocaleString() : '—'}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">
                            {p.amount != null ? `${p.amount} ${p.currency || 'USDC'}` : (p.currency || '—')}
                          </div>
                          <div className="text-xs text-gray-500 truncate max-w-[160px]">{p.txHash || ''}</div>
                        </div>
                      </li>
                    ))}
                    {!payouts.recent?.length && <li className="p-4 text-center text-gray-500">No recent payouts</li>}
                  </ul>
                </div>
              </div>
            </Card>
          </section>
        </div>

        <section className="mt-6">
          <Card title="Recent activity">
            <ul className="divide-y rounded-xl border bg-white">
              {(audit || []).map((l) => (
                <li key={String(l.id)} className="p-3 text-sm">
                  <div className="text-xs text-gray-500">
                    {l.createdAt ? new Date(l.createdAt).toLocaleString() : '—'}
                  </div>
                  <div className="font-medium">{l.actorLabel || 'System'} • {l.action || '—'}</div>
                  <div className="text-xs text-gray-600">
                    {(l.entityType || 'entity')} #{l.entityId ?? '—'}
                  </div>
                  {l.meta && <pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(l.meta, null, 2)}</pre>}
                </li>
              ))}
              {!audit?.length && <li className="p-6 text-center text-gray-500">No recent activity</li>}
            </ul>
          </Card>
        </section>
      </div>
    </div>
  );
}

// ---------- Small UI helpers ----------
function fmt(v: any) {
  return (v == null || Number.isNaN(v)) ? '—' : String(v);
}
function usd(v: number) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v); }
  catch { return `$${Math.round(v)}`; }
}
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
function StatusPill({ status }: { status?: ProofStatus }) {
  const map: Record<ProofStatus, string> = {
    approved: 'bg-green-100 text-green-700',
    changes_requested: 'bg-yellow-100 text-yellow-800',
    archived: 'bg-gray-200 text-gray-700',
    rejected: 'bg-red-100 text-red-700',
    pending: 'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${status ? map[status] : 'bg-gray-100 text-gray-700'}`}>
      {status || '—'}
    </span>
  );
}
function RiskPill({ risk }: { risk?: 'low' | 'medium' | 'high' }) {
  const cls = risk === 'high' ? 'bg-red-100 text-red-700'
    : risk === 'medium' ? 'bg-yellow-100 text-yellow-800'
    : 'bg-gray-100 text-gray-700';
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${cls}`}>{risk || '—'}</span>;
}
