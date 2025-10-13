'use client';
import * as React from 'react';

/* =========================
   Helpers: pick/normalize/format
   ========================= */

/** Pick the first defined value by key list. */
function pick<T = any>(obj: any, keys: string[], fallback?: any): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k];
  }
  return fallback;
}

/** Parse many date shapes: iso, seconds, ms, "YYYY-MM-DD HH:mm:ss". */
function parseWhen(x: any): Date | null {
  if (!x && x !== 0) return null;
  if (x instanceof Date) return isNaN(x.getTime()) ? null : x;
  if (typeof x === 'number') {
    const ms = x < 1e12 ? x * 1000 : x; // seconds vs ms
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof x === 'string') {
    let d = new Date(x);
    if (!isNaN(d.getTime())) return d;
    // Try space→T
    d = new Date(x.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d;
    // Try UTC
    d = new Date(x.replace(' ', 'T') + 'Z');
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}
function fmtWhen(x: any): string {
  const d = parseWhen(x);
  return d ? d.toLocaleString() : '—';
}

function pct(n?: number | null): string {
  if (typeof n !== 'number' || !isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

/* =========================
   Types (UI-level)
   ========================= */
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
  title: string;
  detail?: string;
  entityType: string;
  entityId: string;
  createdAt: string | number | Date;
}
interface AuditLog {
  id: string;
  actorLabel?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  meta?: any;
  createdAt: string | number | Date;
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
  createdAt: string | number | Date;
}

/* =========================
   API origin for direct write actions
   ========================= */
const API_ORIGIN =
  (process.env.NEXT_PUBLIC_API_BASE ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    '')!.toString().replace(/\/$/, '');

/* =========================
   Normalizers (accept many shapes)
   ========================= */
function normalizeSummary(raw: any): Summary {
  return {
    openProofs: Number(pick(raw, ['openProofs', 'open_proofs', 'open'], 0)) || 0,
    breachingSLA: Number(pick(raw, ['breachingSLA', 'sla_breach', 'breaching'], 0)) || 0,
    pendingPayouts: Number(pick(raw, ['pendingPayouts', 'pending_payouts'], 0)) || 0,
    escrowsLocked: Number(pick(raw, ['escrowsLocked', 'escrows_locked'], 0)) || 0,
    cycleTimeHoursP50:
      Number(pick(raw, ['cycleTimeHoursP50', 'cycle_time_p50_hours', 'p50_cycle_hours'], 0)) || 0,
    revisionRate: Number(pick(raw, ['revisionRate', 'revision_rate'], 0)) || 0,
  };
}

function normalizeQueue(raw: any): QueueRow[] {
  const arr = Array.isArray(raw?.queue) ? raw.queue : Array.isArray(raw) ? raw : [];
  const now = Date.now();
  return arr.map((r: any, i: number) => {
    const bidId = Number(pick(r, ['bidId', 'bid_id'], 0)) || 0;
    const mi = Number(pick(r, ['milestoneIndex', 'milestone_index', 'm'], 0)) || 0;
    const submitted = pick(r, ['submittedAt', 'createdAt', 'created_at', 'submitted_at', 'ts', 'time']);
    const submittedMs = parseWhen(submitted)?.getTime() ?? now;
    const ageH = Math.max(0, Math.round((now - submittedMs) / 36e5));
    const slaH = Number(pick(r, ['slaDueInHours', 'sla_due_in_hours', 'sla'], 0)) || 0;

    return {
      id:
        String(pick(r, ['id', 'proofId', 'proof_id'])) ||
        `${bidId}-${mi}-${submittedMs}-${i}`,
      bidId,
      milestoneIndex: mi,
      vendor:
        String(pick(r, ['vendor', 'vendorName', 'vendor_name', 'walletAddress'], '—')) ||
        '—',
      project: String(pick(r, ['project', 'proposalTitle', 'proposal_title'], 'Bid #' + bidId)),
      status:
        (pick(r, ['status', 'state'], 'pending') as ProofStatus) ?? 'pending',
      submittedAt: submitted ? String(submitted) : new Date(submittedMs).toISOString(),
      ageHours: ageH,
      slaDueInHours: slaH,
      risk: (pick(r, ['risk', 'risk_level']) as any) || (slaH < 0 ? 'high' : undefined),
    };
  });
}

function normalizeAlerts(raw: any): AlertItem[] {
  const arr = Array.isArray(raw?.alerts) ? raw.alerts : Array.isArray(raw) ? raw : [];
  return arr.map((a: any, i: number) => {
    const type = String(pick(a, ['type', 'kind', 'code'], 'alert'));
    const title =
      String(pick(a, ['title', 'message', 'summary'])) ||
      type.replace(/[_-]/g, ' ');
    const detail = pick(a, ['detail', 'reason', 'note', 'description']);
    const created = pick(a, ['createdAt', 'created_at', 'ts', 'time', 'occurredAt', 'occurred_at']);
    const eType = String(pick(a, ['entityType', 'entity_type', 'objectType', 'entity'], ''));
    const eId = String(pick(a, ['entityId', 'entity_id', 'objectId', 'object_id'], ''));

    return {
      id: String(pick(a, ['id', 'alertId', 'uuid'], i)),
      type,
      title,
      detail: typeof detail === 'object' ? JSON.stringify(detail) : detail,
      entityType: eType,
      entityId: eId,
      createdAt: created || new Date().toISOString(),
    };
  });
}

function normalizeAudit(raw: any): AuditLog[] {
  const arr = Array.isArray(raw?.events) ? raw.events : Array.isArray(raw) ? raw : [];
  return arr.map((e: any, i: number) => {
    const created = pick(e, [
      'createdAt',
      'created_at',
      'timestamp',
      'ts',
      'time',
      'occurredAt',
      'occurred_at',
      'inserted_at',
    ]);
    return {
      id: String(pick(e, ['id', 'eventId', 'uuid'], i)),
      actorLabel:
        pick(e, ['actorLabel', 'actor', 'actor_name', 'user', 'userName', 'user_label'], 'System') ||
        'System',
      action: String(pick(e, ['action', 'event', 'type', 'kind'], '')) || '',
      entityType: String(pick(e, ['entityType', 'entity_type', 'objectType', 'entity'], '')) || '',
      entityId: String(pick(e, ['entityId', 'entity_id', 'objectId', 'object_id'], '')) || '',
      meta: pick(e, ['meta', 'metadata', 'details', 'data']),
      createdAt: created || '',
    };
  });
}

function normalizeVendors(raw: any): VendorPerf[] {
  const arr = Array.isArray(raw?.vendors) ? raw.vendors : Array.isArray(raw) ? raw : [];
  return arr.map((v: any) => ({
    walletAddress: String(pick(v, ['walletAddress', 'wallet_address'], '')) || '',
    vendorName: String(pick(v, ['vendorName', 'name'], '')) || '',
    proofsTotal: Number(pick(v, ['proofsTotal', 'proofs_total'], 0)) || 0,
    approved: Number(pick(v, ['approved'], 0)) || 0,
    changesRequested: Number(pick(v, ['changesRequested', 'cr_count'], 0)) || 0,
    approvalRate: Number(pick(v, ['approvalRate', 'approval_rate'], 0)) || 0,
    bidsCount: Number(pick(v, ['bidsCount', 'bids_count'], 0)) || 0,
    totalAwardedUSD: Number(pick(v, ['totalAwardedUSD', 'awarded_usd'], 0)) || 0,
    lastProofAt: pick(v, ['lastProofAt', 'last_proof_at']) || null,
    lastBidAt: pick(v, ['lastBidAt', 'last_bid_at']) || null,
    email: pick(v, ['email'], null),
    phone: pick(v, ['phone'], null),
    archived: Boolean(pick(v, ['archived'], false)),
  }));
}

function normalizePayouts(raw: any): { pending: PayoutItem[]; recent: PayoutItem[] } {
  const pending = Array.isArray(raw?.pending) ? raw.pending : Array.isArray(raw?.toPay) ? raw.toPay : [];
  const recent = Array.isArray(raw?.recent) ? raw.recent : Array.isArray(raw?.paid) ? raw.paid : [];
  const mapOne = (p: any): PayoutItem => ({
    bidId: Number(pick(p, ['bidId', 'bid_id'], 0)) || 0,
    milestoneIndex: Number(pick(p, ['milestoneIndex', 'milestone_index'], 0)) || 0,
    vendorName: String(pick(p, ['vendorName', 'vendor_name'], '')) || '',
    walletAddress: String(pick(p, ['walletAddress', 'wallet_address'], '')) || '',
    currency: pick(p, ['currency'], 'USDC'),
    amount: Number(pick(p, ['amount', 'value'], 0)) || undefined,
    txHash: pick(p, ['txHash', 'tx_hash', 'hash'], null),
    createdAt: pick(p, ['createdAt', 'created_at', 'ts', 'time']) || '',
  });
  return { pending: pending.map(mapOne), recent: recent.map(mapOne) };
}

/* =========================
   Component
   ========================= */
export default function AdminOversightPage() {
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
  const [payouts, setPayouts] = React.useState<{ pending: PayoutItem[]; recent: PayoutItem[] }>({ pending: [], recent: [] });
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending' | 'changes_requested' | 'approved'>('all');
  const [olderThan, setOlderThan] = React.useState<number>(0);
  const [busy, setBusy] = React.useState<string>('');
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  const j = React.useCallback(async (path: string) => {
    try {
      const r = await fetch(path, { credentials: 'include', cache: 'no-store' });
      const text = await r.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { /* non-json */ }
      if (!r.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${r.status}`);
      return data;
    } catch (e: any) {
      setError(String(e?.message || e));
      return null;
    }
  }, []);

  const refreshAll = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const [s, q, a, au, v, p] = await Promise.all([
      j('/api/admin/oversight/summary'),
      j('/api/admin/oversight/queue'),
      j('/api/admin/oversight/alerts'),
      j('/api/audit?take=50'),
      j('/api/admin/oversight/vendors'),
      j('/api/admin/oversight/payouts'),
    ]);
    if (s) setSummary(normalizeSummary(s));
    if (q) setQueue(normalizeQueue(q));
    if (a) setAlerts(normalizeAlerts(a));
    if (au) setAudit(normalizeAudit(au));
    if (v) setVendors(normalizeVendors(v));
    if (p) setPayouts(normalizePayouts(p));
    setLoading(false);
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
      if (data) setQueue(normalizeQueue(data));
    })();
  }, [statusFilter, olderThan, j]);

  // ---- Actions (write hits API origin; your auth-injector adds Bearer) ----
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
      setPayouts((p) => ({ ...p, pending: (p?.pending ?? []).filter((x) => !(x.bidId === item.bidId && x.milestoneIndex === item.milestoneIndex)) }));
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
      const url = API_ORIGIN ? `${API_ORIGIN}/admin/vendors/${encodeURIComponent(wallet)}/archive` : `/admin/vendors/${encodeURIComponent(wallet)}/archive`;
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
      const url = API_ORIGIN ? `${API_ORIGIN}/admin/vendors/${encodeURIComponent(wallet)}/unarchive` : `/admin/vendors/${encodeURIComponent(wallet)}/unarchive`;
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
      const url = API_ORIGIN ? `${API_ORIGIN}/admin/vendors/${encodeURIComponent(wallet)}` : `/admin/vendors/${encodeURIComponent(wallet)}`;
      await fetch(url, { method: 'DELETE', credentials: 'include' });
    } catch (e: any) {
      alert(`Delete failed: ${e?.message || e}`);
      await refreshAll();
    } finally {
      setBusy('');
    }
  }

  /* =========================
     UI
     ========================= */
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Admin Oversight</h1>
          <div className="flex gap-2">
            <select className="rounded-md border px-2 py-1 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
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

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Oversight load: {error}</div>}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KPI title="Open proofs" value={summary?.openProofs ?? '—'} />
          <KPI title="Breaching SLA" value={summary?.breachingSLA ?? '—'} tone="danger" />
          <KPI title="Pending payouts" value={summary?.pendingPayouts ?? '—'} />
          <KPI title="Escrows locked" value={summary?.escrowsLocked ?? '—'} />
          <KPI title="P50 cycle (h)" value={summary?.cycleTimeHoursP50 ?? '—'} />
          <KPI title="Revision rate" value={pct(summary?.revisionRate)} />
        </section>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Queue */}
          <section className="lg:col-span-2">
            <Card title="Queue health">
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>ID</Th><Th>Vendor</Th><Th>Project / Milestone</Th><Th>Age</Th><Th>SLA</Th><Th>Status</Th><Th>Risk</Th><Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(queue ?? []).map((q) => (
                      <tr key={q.id} className="border-t hover:bg-gray-50">
                        <Td className="font-mono text-[13px]">{q.id}</Td>
                        <Td>{q.vendor || '—'}</Td>
                        <Td>{q.project || '—'} • M{Number.isFinite(q.milestoneIndex) ? q.milestoneIndex : '—'}</Td>
                        <Td>{q.ageHours ?? '—'}h</Td>
                        <Td className={q.slaDueInHours < 0 ? 'text-red-600' : 'text-gray-600'}>
                          {typeof q.slaDueInHours === 'number'
                            ? q.slaDueInHours < 0
                              ? `${-q.slaDueInHours}h over`
                              : `${q.slaDueInHours}h left`
                            : '—'}
                        </Td>
                        <Td>
                          <span className={
                            'inline-block rounded-full px-2 py-0.5 text-xs ' +
                            (q.status === 'approved' ? 'bg-green-100 text-green-700'
                              : q.status === 'changes_requested' ? 'bg-yellow-100 text-yellow-800'
                              : q.status === 'archived' ? 'bg-gray-200 text-gray-700'
                              : q.status === 'rejected' ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700')
                          }>{q.status}</span>
                        </Td>
                        <Td>
                          <span className={
                            'inline-block rounded-full px-2 py-0.5 text-xs ' +
                            (q.risk === 'high' ? 'bg-red-100 text-red-700'
                              : q.risk === 'medium' ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-gray-100 text-gray-700')
                          }>{q.risk || '—'}</span>
                        </Td>
                        <Td>
                          <div className="flex gap-2">
                            <button disabled={busy === `approve-${q.id}`} onClick={() => onApprove(q)}
                              className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">Approve</button>
                            <button disabled={busy === `request-${q.id}`} onClick={() => onRequestChanges(q)}
                              className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">Request</button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                    {!loading && !(queue ?? []).length && (
                      <tr><Td colSpan={8} className="py-8 text-center text-gray-500">No items</Td></tr>
                    )}
                    {loading && <tr><Td colSpan={8} className="py-8 text-center text-gray-400">Loading…</Td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Vendors */}
            <Card title="Vendor performance">
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <Th>Vendor</Th><Th className="hidden md:table-cell">Wallet</Th>
                      <Th className="text-right">Proofs</Th><Th className="text-right">Approved</Th>
                      <Th className="text-right">CR</Th><Th className="text-right">Approval %</Th>
                      <Th className="text-right hidden lg:table-cell">Bids</Th><Th className="text-right hidden lg:table-cell">Awarded USD</Th>
                      <Th className="hidden md:table-cell">Last activity</Th><Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(vendors ?? []).map((v) => (
                      <tr key={v.walletAddress} className="border-t hover:bg-gray-50">
                        <Td className="font-medium">{v.vendorName || '—'}</Td>
                        <Td className="hidden md:table-cell font-mono text-[12px]">{v.walletAddress || '—'}</Td>
                        <Td className="text-right">{v.proofsTotal ?? 0}</Td>
                        <Td className="text-right">{v.approved ?? 0}</Td>
                        <Td className="text-right">{v.changesRequested ?? 0}</Td>
                        <Td className="text-right">{pct(v.approvalRate)}</Td>
                        <Td className="text-right hidden lg:table-cell">{v.bidsCount ?? '—'}</Td>
                        <Td className="text-right hidden lg:table-cell">
                          {v.totalAwardedUSD
                            ? Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v.totalAwardedUSD)
                            : '—'}
                        </Td>
                        <Td className="hidden md:table-cell">
                          {v.lastProofAt ? fmtWhen(v.lastProofAt) : v.lastBidAt ? fmtWhen(v.lastBidAt) : '—'}
                        </Td>
                        <Td>
                          <div className="flex gap-2">
                            {!v.archived ? (
                              <button disabled={busy === `arch-${v.walletAddress}`} onClick={() => onArchiveVendor(v.walletAddress)}
                                className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">Archive</button>
                            ) : (
                              <button disabled={busy === `unarch-${v.walletAddress}`} onClick={() => onUnarchiveVendor(v.walletAddress)}
                                className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">Unarchive</button>
                            )}
                            <button disabled={busy === `del-${v.walletAddress}`} onClick={() => onDeleteVendor(v.walletAddress)}
                              className="rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">Delete</button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                    {!loading && !(vendors ?? []).length && (
                      <tr><Td colSpan={10} className="py-8 text-center text-gray-500">No vendor activity</Td></tr>
                    )}
                    {loading && <tr><Td colSpan={10} className="py-8 text-center text-gray-400">Loading…</Td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* Alerts + Payouts */}
          <section>
            <Card title="Alerts">
              <ul className="space-y-2">
                {(alerts ?? []).map((a) => (
                  <li key={a.id} className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-gray-500">{fmtWhen(a.createdAt)}</div>
                    <div className="font-medium">{a.title || a.type || 'Alert'}</div>
                    {a.detail ? <div className="text-xs text-gray-600">{a.detail}</div> : null}
                    {(a.entityType || a.entityId) && (
                      <div className="mt-1 text-xs text-gray-500">
                        {a.entityType || 'Entity'}{a.entityId ? ` #${a.entityId}` : ''}
                      </div>
                    )}
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
                          <div className="font-medium">{p.vendorName || '—'} • Bid {p.bidId} • M{p.milestoneIndex + 1}</div>
                          <div className="text-xs text-gray-500">{fmtWhen(p.createdAt)}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{p.amount ? `${p.amount} ${p.currency || 'USDC'}` : p.currency || ''}</div>
                          <button disabled={busy === `pay-${p.bidId}-${p.milestoneIndex}`} onClick={() => onPay(p)}
                            className="mt-1 rounded-md border bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50">Pay</button>
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
                          <div className="font-medium">{p.vendorName || '—'} • Bid {p.bidId} • M{p.milestoneIndex + 1}</div>
                          <div className="text-xs text-gray-500">{fmtWhen(p.createdAt)}</div>
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
                  <div className="text-xs text-gray-500">{fmtWhen(l.createdAt)}</div>
                  <div className="font-medium">{l.actorLabel || 'System'} • {l.action || '—'}</div>
                  {(l.entityType || l.entityId) && (
                    <div className="text-xs text-gray-600">
                      {l.entityType || 'Entity'}{l.entityId ? ` #${l.entityId}` : ''}
                    </div>
                  )}
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

/* =========================
   Tiny UI helpers
   ========================= */
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
