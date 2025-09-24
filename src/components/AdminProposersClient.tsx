'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { listProposers, listProposals, type Proposal } from '@/lib/api';

export type ProposerAgg = {
  entity: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  contactEmail: string | null;
  ownerEmail: string | null;
  wallet: string | null;
  proposalsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalBudgetUSD: number;
  lastActivity: string | null; // ISO
};

type Props = { initial?: ProposerAgg[] };

/* ---------------- helpers ---------------- */

function normalizeRow(r: any): ProposerAgg {
  return {
    entity: (r.orgName ?? r.entity ?? r.organization ?? '') || null,
    address: r.address ?? null,
    city: r.city ?? null,
    country: r.country ?? null,
    contactEmail:
      r.primaryEmail ??
      r.primary_email ??
      r.contactEmail ??
      r.contact_email ??
      r.ownerEmail ??
      r.owner_email ??
      null,
    ownerEmail: r.ownerEmail ?? r.owner_email ?? null,
    wallet: r.ownerWallet ?? r.owner_wallet ?? r.wallet ?? null,
    proposalsCount: Number(r.proposalsCount ?? r.proposals_count ?? r.count ?? 0),
    approvedCount: Number(r.approvedCount ?? r.approved_count ?? 0),
    pendingCount: Number(r.pendingCount ?? r.pending_count ?? 0),
    rejectedCount: Number(r.rejectedCount ?? r.rejected_count ?? 0),
    totalBudgetUSD: Number(
      r.totalBudgetUSD ?? r.total_budget_usd ?? r.amountUSD ?? r.amount_usd ?? 0
    ),
    lastActivity:
      r.lastActivityAt ??
      r.last_activity_at ??
      r.updatedAt ??
      r.updated_at ??
      r.createdAt ??
      r.created_at ??
      null,
  };
}

function aggregateFromProposals(props: Proposal[]): ProposerAgg[] {
  const byKey = new Map<string, ProposerAgg>();

  for (const p of props) {
    const org = (p.orgName || 'Unknown Org').trim();
    const key = `${org}|${p.contact || ''}|${p.ownerWallet || ''}`;

    const existing = byKey.get(key);
    const row: ProposerAgg =
      existing || {
        entity: org || null,
        address: p.address || null,
        city: p.city || null,
        country: p.country || null,
        contactEmail: p.contact || p.ownerEmail || null,
        ownerEmail: p.ownerEmail || null,
        wallet: p.ownerWallet || null,
        proposalsCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        totalBudgetUSD: 0,
        lastActivity: null,
      };

    row.proposalsCount += 1;
    row.totalBudgetUSD += Number(p.amountUSD) || 0;

    const st = p.status || 'pending';
    if (st === 'approved') row.approvedCount += 1;
    else if (st === 'rejected') row.rejectedCount += 1;
    else row.pendingCount += 1;

    const prev = row.lastActivity ? new Date(row.lastActivity).getTime() : 0;
    const cand = new Date(p.updatedAt || p.createdAt).getTime();
    if (cand > prev) row.lastActivity = p.updatedAt || p.createdAt;

    byKey.set(key, row);
  }

  return Array.from(byKey.values());
}

/* ---------------- component ---------------- */

export default function AdminProposersClient({ initial = [] }: Props) {
  const [rows, setRows] = useState<ProposerAgg[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (initial.length) return;
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // 1) Try server rollup
        const server = await listProposers().catch(() => []);
        let data: ProposerAgg[] = (Array.isArray(server) ? server : []).map(normalizeRow);

        // 2) Fallback: aggregate from proposals if server returns nothing
        if (!data.length) {
          const proposals = await listProposals({ includeArchived: true });
          data = aggregateFromProposals(proposals);
        }

        if (alive) setRows(data);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Failed to load entities');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [initial.length]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter((r) => {
      const hay = [
        r.entity,
        r.address,
        r.city,
        r.country,
        r.contactEmail,
        r.ownerEmail,
        r.wallet,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(n);
    });
  }, [rows, q]);

  if (loading) return <div className="p-6">Loading entities…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-2xl font-bold">Admin — Entities</h1>
          <div className="w-full md:w-80">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search entities, email, wallet…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <Th>Entity / Org</Th>
                <Th>Address</Th>
                <Th>Primary contact</Th>
                <Th>Wallet</Th>
                <Th className="text-right">Proposals (#)</Th>
                <Th className="text-right">Approved</Th>
                <Th className="text-right">Pending</Th>
                <Th className="text-right">Rejected</Th>
                <Th className="text-right">Total Budget (USD)</Th>
                <Th>Last Activity</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r, i) => (
                <tr key={`${r.wallet || r.contactEmail || r.entity || ''}-${i}`} className="hover:bg-slate-50/60">
                  <Td>
                    <div className="font-medium text-slate-900">{r.entity || '—'}</div>
                    {(r.city || r.country) && (
                      <div className="text-xs text-slate-500">
                        {[r.city, r.country].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </Td>
                  <Td className="text-slate-700">{r.address || '—'}</Td>
                  <Td>
                    <div className="text-slate-700">
                      {r.contactEmail || r.ownerEmail || '—'}
                    </div>
                  </Td>
                  <Td className="font-mono text-xs text-slate-700">
                    {r.wallet ? `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}` : '—'}
                  </Td>
                  <Td className="text-right">{r.proposalsCount ?? 0}</Td>
                  <Td className="text-right">{r.approvedCount ?? 0}</Td>
                  <Td className="text-right">{r.pendingCount ?? 0}</Td>
                  <Td className="text-right">{r.rejectedCount ?? 0}</Td>
                  <Td className="text-right">${Number(r.totalBudgetUSD || 0).toLocaleString()}</Td>
                  <Td>{r.lastActivity ? new Date(r.lastActivity).toLocaleString() : '—'}</Td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-500">
                    No entities found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
