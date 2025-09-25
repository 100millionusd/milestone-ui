// src/components/AdminEntitiesTable.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listProposers, listProposals, type Proposal } from '@/lib/api';

/* ---------------- types (normalized row) ---------------- */

type Row = {
  entity: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  contactEmail: string | null;
  ownerEmail: string | null;
  ownerWallet: string | null;
  proposalsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  totalBudgetUSD: number;
  lastActivityAt: string | null;
};

type SortKey =
  | 'entity'
  | 'wallet'
  | 'proposals'
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'budget'
  | 'last';

/* ---------------- helpers: normalize + fallback ---------------- */

function normalizeRow(r: any): Row {
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
    ownerWallet: r.ownerWallet ?? r.owner_wallet ?? r.wallet ?? null,
    proposalsCount: Number(r.proposalsCount ?? r.proposals_count ?? r.count ?? 0),
    approvedCount: Number(r.approvedCount ?? r.approved_count ?? 0),
    pendingCount: Number(r.pendingCount ?? r.pending_count ?? 0),
    rejectedCount: Number(r.rejectedCount ?? r.rejected_count ?? 0),
    totalBudgetUSD: Number(
      r.totalBudgetUSD ?? r.total_budget_usd ?? r.amountUSD ?? r.amount_usd ?? 0
    ),
    lastActivityAt:
      r.lastActivityAt ??
      r.last_activity_at ??
      r.updatedAt ??
      r.updated_at ??
      r.createdAt ??
      r.created_at ??
      null,
  };
}

function aggregateFromProposals(props: Proposal[]): Row[] {
  const byKey = new Map<string, Row>();

  for (const p of props) {
    const org = (p.orgName || 'Unknown Org').trim();
    const key = `${org}|${p.contact || ''}|${p.ownerWallet || ''}`;

    const existing = byKey.get(key);
    const row: Row =
      existing || {
        entity: org || null,
        address: p.address || null,
        city: p.city || null,
        country: p.country || null,
        contactEmail: p.contact || p.ownerEmail || null,
        ownerEmail: p.ownerEmail || null,
        ownerWallet: p.ownerWallet || null,
        proposalsCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        totalBudgetUSD: 0,
        lastActivityAt: null,
      };

    row.proposalsCount += 1;
    row.totalBudgetUSD += Number(p.amountUSD) || 0;

    const st = p.status || 'pending';
    if (st === 'approved') row.approvedCount += 1;
    else if (st === 'rejected') row.rejectedCount += 1;
    else row.pendingCount += 1;

    const prev = row.lastActivityAt ? new Date(row.lastActivityAt).getTime() : 0;
    const cand = new Date(p.updatedAt || p.createdAt).getTime();
    if (cand > prev) row.lastActivityAt = p.updatedAt || p.createdAt;

    byKey.set(key, row);
  }

  return Array.from(byKey.values());
}

/* ---------------- component ---------------- */

export default function AdminEntitiesTable({ perPage = 10 }: { perPage?: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last');
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const server = await listProposers().catch(() => []);
        let data: Row[] = (Array.isArray(server) ? server : []).map(normalizeRow);

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
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = [
        r.entity,
        r.address,
        r.city,
        r.country,
        r.contactEmail,
        r.ownerEmail,
        r.ownerWallet,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const getVal = (r: Row) => {
      switch (sortKey) {
        case 'entity': return r.entity || '';
        case 'wallet': return r.ownerWallet || '';
        case 'proposals': return r.proposalsCount;
        case 'approved': return r.approvedCount;
        case 'pending': return r.pendingCount;
        case 'rejected': return r.rejectedCount;
        case 'budget': return r.totalBudgetUSD;
        case 'last': return r.lastActivityAt ? new Date(r.lastActivityAt).getTime() : 0;
      }
    };
    arr.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === 'string' && typeof vb === 'string') {
        const cmp = va.localeCompare(vb);
        return asc ? cmp : -cmp;
      }
      return asc ? (Number(va) - Number(vb)) : (Number(vb) - Number(va));
    });
    return arr;
  }, [filtered, sortKey, asc]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / perPage));
  const current = useMemo(() => {
    const start = (page - 1) * perPage;
    return sorted.slice(start, start + perPage);
  }, [sorted, page, perPage]);

  if (loading) return <div className="p-6">Loading entities…</div>;
  if (error)   return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="max-w-7xl mx-auto p-6">
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
            <option value="entity">Entity</option>
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

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full table-fixed text-sm">
          {/* Ensure consistent widths and a comfy Actions column */}
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[7%]" />
            <col className="w-[10%]" />
            <col className="w-[12%]" />
            <col className="min-w-[220px] w-[14%]" />
          </colgroup>

          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <Th>Entity / Location</Th>
              <Th>Primary contact</Th>
              <Th>Wallet</Th>
              <Th className="text-right">Proposals</Th>
              <Th className="text-right">Approved</Th>
              <Th className="text-right">Pending</Th>
              <Th className="text-right">Rejected</Th>
              <Th className="text-right">Total Budget</Th>
              <Th>Last Activity</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {current.map((r, i) => {
              const walletDisp = r.ownerWallet
                ? `${r.ownerWallet.slice(0, 6)}…${r.ownerWallet.slice(-4)}`
                : '—';

              const proposalsHref = buildProposalsHref(r);

              return (
                <tr key={`${r.ownerWallet || r.contactEmail || r.entity || ''}-${i}`} className="align-top hover:bg-slate-50/60">
                  <Td>
                    <div className="font-medium text-slate-900 truncate">{r.entity || '—'}</div>
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
                      {r.contactEmail || r.ownerEmail || '—'}
                    </div>
                  </Td>

                  <Td className="font-mono text-xs text-slate-700 break-all">
                    {walletDisp}
                  </Td>

                  <Td className="text-right">{r.proposalsCount ?? 0}</Td>
                  <Td className="text-right">{r.approvedCount ?? 0}</Td>
                  <Td className="text-right">{r.pendingCount ?? 0}</Td>
                  <Td className="text-right">{r.rejectedCount ?? 0}</Td>
                  <Td className="text-right">${Number(r.totalBudgetUSD || 0).toLocaleString()}</Td>

                  <Td>{r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleString() : '—'}</Td>

                  {/* Actions: tidy, right-aligned, fixed height buttons */}
                  <Td className="text-right">
                    <div className="inline-flex flex-wrap justify-end gap-2 min-w-[220px]">
                      <Link
                        href={proposalsHref}
                        className="h-8 px-3 rounded-lg border border-cyan-600 text-cyan-700 hover:bg-cyan-50 text-xs font-medium leading-8"
                        title="See proposals for this entity"
                      >
                        Proposals
                      </Link>
                      <button
                        className="h-8 px-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-xs font-medium leading-8 cursor-not-allowed"
                        title="Archive (not wired)"
                        disabled
                      >
                        Archive
                      </button>
                      <button
                        className="h-8 px-3 rounded-lg border border-rose-300 bg-rose-50 text-rose-800 text-xs font-medium leading-8 cursor-not-allowed"
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

/* ---------------- small UI helpers ---------------- */

function buildProposalsHref(r: Row) {
  const params = new URLSearchParams();
  if (r.entity)       params.set('org', r.entity);
  if (r.contactEmail) params.set('contactEmail', r.contactEmail);
  if (r.ownerEmail)   params.set('ownerEmail', r.ownerEmail);
  if (r.ownerWallet)  params.set('wallet', r.ownerWallet);
  return `/admin/proposals?${params.toString()}`;
}

function Th({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return (
    <th className={`px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}
function Td({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <td className={`px-6 py-3 align-top whitespace-normal break-words ${className}`}>{children}</td>;
}
