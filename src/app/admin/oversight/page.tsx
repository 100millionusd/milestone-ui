'use client';

import { useEffect, useState } from 'react';

type Tiles = {
  openProofs: number;
  breachingSla: number;
  pendingPayouts: { count: number; totalUSD: number };
  escrowsLocked: number;
  p50CycleHours: number;
  revisionRatePct: number;
};

type QueueItem = {
  id: number;
  vendor: string;
  project: string;
  milestone: number;
  ageHours: number;
  status: string;
  risk: string;
  actions: { bidId: number; proposalId: number };
};

type VendorRow = {
  vendor: string;
  wallet: string;
  proofs: number;
  approved: number;
  cr: number;
  approvalPct: number;
  bids: number;
  lastActivity: string;
};

type AlertRow = {
  type: string;
  createdAt: string;
  bidId: string;
  details: Record<string, any>;
};

type PayoutRow = {
  id: string;
  bid_id: string;
  milestone_index: number;
  amount_usd: string;
  released_at: string;
};

type OversightPayload = {
  tiles: Tiles;
  queue: QueueItem[];
  vendors: VendorRow[];
  alerts: AlertRow[];
  payouts: { pending: PayoutRow[]; recent: PayoutRow[] };
  recent: any[];
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

export default function OversightPage() {
  const [data, setData] = useState<OversightPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!API_BASE) {
      setErr('NEXT_PUBLIC_API_BASE_URL is not set');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin/oversight`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as OversightPayload;
        setData(json);
      } catch (e: any) {
        setErr(e.message || 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="p-6">Loading…</div>;
  if (err) return <div className="p-6 text-red-600">Error: {err}</div>;
  if (!data) return <div className="p-6">No data</div>;

  const { tiles, queue, vendors, alerts, payouts, recent } = data;

  return (
    <div className="p-6 space-y-8">
      {/* TILES */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Tile label="OPEN PROOFS" value={tiles.openProofs} />
        <Tile label="BREACHING SLA" value={tiles.breachingSla} />
        <Tile label="PENDING PAYOUTS" value={tiles.pendingPayouts.count} />
        <Tile label="PAYOUTS USD" value={tiles.pendingPayouts.totalUSD} />
        <Tile label="ESCROWS LOCKED" value={tiles.escrowsLocked} />
        <Tile label="P50 CYCLE (H)" value={tiles.p50CycleHours} />
        <Tile label="REVISION RATE (%)" value={tiles.revisionRatePct} />
      </section>

      {/* QUEUE */}
      <Section title={`Queue (${queue.length})`}>
        <Table
          headers={['ID', 'Vendor', 'Project', 'Milestone', 'Age (h)', 'Status', 'Risk', 'Bid', 'Proposal']}
          rows={queue.map(q => [
            q.id,
            q.vendor,
            q.project,
            q.milestone,
            q.ageHours.toFixed(1),
            q.status,
            q.risk,
            q.actions.bidId,
            q.actions.proposalId,
          ])}
        />
      </Section>

      {/* VENDORS */}
      <Section title={`Vendors (${vendors.length})`}>
        <Table
          headers={['Vendor', 'Wallet', 'Proofs (Approved/Total)', 'CR', 'Approval %', 'Bids', 'Last Activity']}
          rows={vendors.map(v => [
            v.vendor,
            v.wallet,
            `${v.approved}/${v.proofs}`,
            v.cr,
            v.approvalPct,
            v.bids,
            new Date(v.lastActivity).toLocaleString(),
          ])}
        />
      </Section>

      {/* ALERTS */}
      <Section title={`Alerts (${alerts.length})`}>
        <Table
          headers={['Type', 'Created', 'Bid', 'Details']}
          rows={alerts.map(a => [
            a.type,
            new Date(a.createdAt).toLocaleString(),
            a.bidId,
            JSON.stringify(a.details),
          ])}
        />
      </Section>

      {/* PAYOUTS */}
      <Section title={`Recent Payouts (${payouts.recent.length})`}>
        <Table
          headers={['ID', 'Bid', 'Milestone', 'USD', 'Released At']}
          rows={payouts.recent.map(p => [
            p.id,
            p.bid_id,
            p.milestone_index,
            p.amount_usd,
            new Date(p.released_at).toLocaleString(),
          ])}
        />
      </Section>

      {/* RECENT ACTIVITY */}
      <Section title={`Recent Activity (${recent.length})`}>
        <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
          {JSON.stringify(recent, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-auto border rounded-xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            {headers.map(h => (
              <th key={h} className="text-left px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
      </table>
      <div className="max-h-[480px] overflow-auto">
        <table className="min-w-full text-sm">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                {r.map((c, j) => (
                  <td key={j} className="px-3 py-2 whitespace-nowrap">{String(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
