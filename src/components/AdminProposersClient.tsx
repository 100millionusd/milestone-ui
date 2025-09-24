'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { listProposers } from '@/lib/api';

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
        const data = await listProposers();
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Failed to load entities');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [initial.length]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return rows;
    return rows.filter(r => {
      const hay = [
        r.entity, r.address, r.city, r.country, r.contactEmail, r.ownerEmail, r.wallet
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(n);
    });
  }, [rows, q]);

  if (loading) return <div className="p-6">Loading entities…</div>;
  if (error)   return <div className="p-6 text-red-600">Error: {error}</div>;

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
