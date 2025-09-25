'use client';

import {useEffect, useMemo, useState} from 'react';
import Link from 'next/link';
import { listProposers, type ProposerSummary } from '@/lib/api';

type Row = {
  orgName: string;

  // location
  address?: string | null;
  city?: string | null;
  country?: string | null;

  // contacts
  primaryEmail?: string | null;
  ownerEmail?: string | null;
  ownerWallet?: string | null;

  // counts
  proposalsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;

  // money + recency
  totalBudgetUSD: number;
  lastActivityAt?: string | null;
};

type SortKey =
  | 'org'
  | 'wallet'
  | 'proposals'
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'budget'
  | 'last';

export default function AdminEntitiesTable({ perPage = 10 }: { perPage?: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  // UI state
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last');
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const data = await listProposers();
        if (!alive) return;
        const normalized = (Array.isArray(data) ? data : []).map(normalize);
        setRows(normalized);
      } catch (e: any) {
        if (alive) setError(e?.message || 'Failed to load entities');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // filter
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(r => {
      const hay = [
        r.orgName, r.address, r.city, r.country,
        r.primaryEmail, r.ownerEmail, r.ownerWallet
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  // sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let va: any = 0, vb: any = 0;
      switch (sortKey) {
        case 'org':       va = a.orgName || ''; vb = b.orgName || ''; break;
        case 'wallet':    va = a.ownerWallet || ''; vb = b.ownerWallet || ''; break;
        case 'proposals': va = a.proposalsCount; vb = b.proposalsCount; break;
        case 'approved':  va = a.approvedCount;  vb = b.approvedCount;  break;
        case 'pending':   va = a.pendingCount;   vb = b.pendingCount;   break;
        case 'rejected':  va = a.rejectedCount;  vb = b.rejectedCount;  break;
        case 'budget':    va = a.totalBudgetUSD; vb = b.totalBudgetUSD; break;
        case 'last': {
          const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
          const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
          va = ta; vb = tb;
          break;
        }
      }
      if (typeof va === 'string' && typeof vb === 'string') {
        const cmp = va.localeCompare(vb);
        return asc ? cmp : -cmp;
      }
      if (va < vb) return asc ? -1 : 1;
      if (va > vb) return asc ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, asc]);

  // pagination
  const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
  const current = useMemo(() => {
    const start = (page - 1) * perPage;
    return sorted.slice(start, start + perPage);
  }, [sorted, page, perPage]);

  // UI
  if (loading) return <div className="p-6">Loading entities…</div>;
  if (error)   return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header + controls */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Admin — Entities</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Quick links:</span>
          <Link href="/admin/proposals" className="text-cyan-700 hover:underline">Proposals</Link>
          <Link href="/admin/bids" className="text-cyan-700 hover:underline">Bids</Link>
          <Link href="/admin/dashboard?tab=vendors" className="text-cyan-700 hover:underline">Vendors</Link>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:w-96">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder="Search org, email, wallet, city, country…"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Sort by</label>
          <select
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="last">Last activity</option>
            <option value="org">Entity</option>
            <option value="wallet">Wallet</option>
            <option value="proposals">Proposals</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
            <option value="budget">Total budget</option>
          </select>
          <button
            onClick={() => setAsc(a => !a)}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
            title="Toggle sort direction"
          >
            {asc ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Table — designed to AVOID horizontal scrolling */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full table-fixed text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th className="w-[22%]">Entity / Location</Th>
              <Th className="w-[20%]">Primary contact</Th>
              <Th className="w-[16%]">Wallet</Th>
              <Th className="w-[10%] text-right">Proposals</Th>
              <Th className="w-[10%] text-right">Approved</Th>
              <Th className="w-[10%] text-right">Pending</Th>
              <Th className="w-[10%] text-right">Rejected</Th>
              <Th className="w-[12%] text-right">Total Budget</Th>
              <Th className="w-[14%]">Last Activity</Th>
              <Th className="w-[12%]">Actions</Th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {current.map((r, i) => {
              const walletDisp = r.ownerWallet
                ? `${r.ownerWallet.slice(0, 6)}…${r.ownerWallet.slice(-4)}`
                : '—';

              const proposalsHref = buildProposalsHref(r);

              return (
                <tr key={`${r.orgName || '—'}-${i}`} className="align-top hover:bg-slate-50/60">
                  <Td>
                    <div className="font-medium text-slate-900 truncate">{r.orgName || '—'}</div>
                    {(r.city || r.country) && (
                      <div className="text-xs text-slate-500">
                        {[r.city, r.country].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {r.address && (
                      <div className="text-xs text-slate-500 break-words">{r.address}</div>
                    )}
                  </Td>

                  <Td>
                    <div className="text-slate-700 break-words">
                      {r.primaryEmail || r.ownerEmail || '—'}
                    </div>
                  </Td>

                  <Td className="font-mono text-xs text-slate-700 break-all">
                    {walletDisp}
                  </Td>

                  <Td className="text-right">{r.proposalsCount}</Td>
                  <Td className="text-right">{r.approvedCount}</Td>
                  <Td className="text-right">{r.pendingCount}</Td>
                  <Td className="text-right">{r.rejectedCount}</Td>
                  <Td className="text-right">${Number(r.totalBudgetUSD || 0).toLocaleString()}</Td>

                  <Td>{r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleString() : '—'}</Td>

                  <Td>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={proposalsHref}
                        className="px-3 py-1 rounded text-xs border border-cyan-600 text-cyan-700 hover:bg-cyan-50"
                        title="See proposals for this entity"
                      >
                        Proposals
                      </Link>
                      {/* Placeholder actions; wire up if/when API exists */}
                      <button
                        className="px-3 py-1 rounded text-xs bg-amber-100 text-amber-800 border border-amber-200 cursor-not-allowed"
                        title="Archive (not wired)"
                        disabled
                      >
                        Archive
                      </button>
                      <button
                        className="px-3 py-1 rounded text-xs bg-rose-100 text-rose-800 border border-rose-200 cursor-not-allowed"
                        title="Delete (not wired)"
                        disabled
                      >
                        Delete
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}

            {current.length === 0 && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-slate-500">
                  No entities match this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Page <b>{page}</b> of <b>{pageCount}</b> — {rows.length} total
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Prev
          </button>
          <button
            className="px-3 py-1 rounded border border-slate-200 disabled:opacity-50"
            onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            disabled={page >= pageCount}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function normalize(r: ProposerSummary): Row {
  return {
    orgName: r.orgName || '',

    address: r.address ?? null,
    city: r.city ?? null,
    country: r.country ?? null,

    primaryEmail: r.primaryEmail ?? null,
    ownerEmail: r.ownerEmail ?? null,
    ownerWallet: r.ownerWallet ?? null,

    proposalsCount: Number(r.proposalsCount || 0),
    approvedCount: Number(r.approvedCount || 0),
    pendingCount: Number(r.pendingCount || 0),
    rejectedCount: Number(r.rejectedCount || 0),

    totalBudgetUSD: Number(r.totalBudgetUSD || 0),
    lastActivityAt: r.lastActivityAt ?? null,
  };
}

function buildProposalsHref(r: Row) {
  const params = new URLSearchParams();
  if (r.orgName)      params.set('org', r.orgName);
  if (r.primaryEmail) params.set('contactEmail', r.primaryEmail);
  if (r.ownerEmail)   params.set('ownerEmail', r.ownerEmail);
  if (r.ownerWallet)  params.set('wallet', r.ownerWallet);
  return `/admin/proposals?${params.toString()}`;
}

function Th({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <td className={`px-4 py-3 align-top whitespace-normal break-words ${className}`}>{children}</td>;
}
