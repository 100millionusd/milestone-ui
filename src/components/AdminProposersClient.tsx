// src/components/AdminProposersClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listProposers, type ProposerSummary } from '@/lib/api';

type Props = { initial?: ProposerSummary[] };

export default function AdminProposersClient({ initial = [] }: Props) {
  const [rows, setRows] = useState<ProposerSummary[]>(initial);
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
        r.orgName,
        r.address,
        r.city,
        r.country,
        r.primaryEmail,
        r.ownerEmail,
        r.ownerWallet,
        String(r.totalBudgetUSD ?? ''),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
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
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((r, i) => {
                const key = `${r.ownerWallet || r.primaryEmail || r.ownerEmail || r.orgName || 'row'}-${i}`;
                const orgHref = `/admin/proposals?org=${encodeURIComponent(r.orgName)}`;
                const contactHref = r.primaryEmail ? `/admin/proposals?contactEmail=${encodeURIComponent(r.primaryEmail)}` : '';
                const ownerHref = r.ownerEmail ? `/admin/proposals?ownerEmail=${encodeURIComponent(r.ownerEmail)}` : '';
                const walletHref = r.ownerWallet ? `/admin/proposals?wallet=${encodeURIComponent(r.ownerWallet)}` : '';

                return (
                  <tr key={key} className="hover:bg-slate-50/60">
                    <Td>
                      {r.orgName ? (
                        <Link
                          href={orgHref}
                          className="font-medium text-slate-900 hover:text-cyan-700 hover:underline"
                          title="View proposals for this org"
                        >
                          {r.orgName}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {(r.city || r.country) && (
                        <div className="text-xs text-slate-500">
                          {[r.city, r.country].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </Td>

                    <Td className="text-slate-700">{r.address || '—'}</Td>

                    <Td>
                      <div className="text-slate-700 space-y-0.5">
                        {r.primaryEmail ? (
                          <Link
                            href={contactHref}
                            className="hover:underline hover:text-cyan-700"
                            title="Filter by contact email"
                          >
                            {r.primaryEmail}
                          </Link>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {r.ownerEmail && r.ownerEmail !== r.primaryEmail && (
                          <div className="text-xs">
                            <Link
                              href={ownerHref}
                              className="hover:underline hover:text-cyan-700"
                              title="Filter by owner email"
                            >
                              {r.ownerEmail}
                            </Link>
                          </div>
                        )}
                      </div>
                    </Td>

                    <Td className="font-mono text-xs text-slate-700">
                      {r.ownerWallet ? (
                        <Link
                          href={walletHref}
                          className="hover:underline hover:text-cyan-700"
                          title={r.ownerWallet}
                        >
                          {`${r.ownerWallet.slice(0, 6)}…${r.ownerWallet.slice(-4)}`}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </Td>

                    {/* Clickable counts -> org filter */}
                    <Td className="text-right">
                      <Link href={orgHref} className="hover:underline hover:text-cyan-700">
                        {r.proposalsCount ?? 0}
                      </Link>
                    </Td>
                    <Td className="text-right">
                      <Link href={orgHref} className="hover:underline hover:text-cyan-700">
                        {r.approvedCount ?? 0}
                      </Link>
                    </Td>
                    <Td className="text-right">
                      <Link href={orgHref} className="hover:underline hover:text-cyan-700">
                        {r.pendingCount ?? 0}
                      </Link>
                    </Td>
                    <Td className="text-right">
                      <Link href={orgHref} className="hover:underline hover:text-cyan-700">
                        {r.rejectedCount ?? 0}
                      </Link>
                    </Td>

                    <Td className="text-right">
                      ${Number(r.totalBudgetUSD || 0).toLocaleString()}
                    </Td>

                    <Td>
                      {r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleString() : '—'}
                    </Td>

                    <Td className="text-right">
                      <Link
                        href={orgHref}
                        className="inline-flex items-center px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
                        title="View proposals for this entity"
                      >
                        View
                      </Link>
                    </Td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-500">
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
