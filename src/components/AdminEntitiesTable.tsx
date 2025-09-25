// src/components/AdminEntitiesTable.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  listProposers,
  listProposals,
  type Proposal,
  adminArchiveEntity as archiveEntity,
  adminUnarchiveEntity as unarchiveEntity,
  adminDeleteEntity as deleteEntity,
} from '@/lib/api';

/* ---------- Types ---------- */

export type ProposerAgg = {
  id?: number | string | null;          // optional (if backend provides)
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
  lastActivity: string | null;          // ISO
  archived?: boolean;
};

type SortKey =
  | 'entity'
  | 'proposalsCount'
  | 'approvedCount'
  | 'pendingCount'
  | 'rejectedCount'
  | 'totalBudgetUSD'
  | 'lastActivity';

type Props = { initial?: ProposerAgg[] };

/* ---------- Helpers ---------- */

function normalizeRow(r: any): ProposerAgg {
  return {
    id: r.id ?? r.entityId ?? r.proposerId ?? null,
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
    archived: !!(r.archived ?? r.is_archived ?? false),
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
        id: null,
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
        archived: false,
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

function fmtMoney(n: number) {
  return `$${Number(n || 0).toLocaleString()}`;
}

// helper to create a stable row key for optimistic updates
function keyOf(r: ProposerAgg) {
  return `${r.id ?? ''}|${r.entity ?? ''}|${r.contactEmail ?? ''}|${r.wallet ?? ''}`;
}

/* ---------- Component ---------- */

export default function AdminEntitiesTable({ initial = [] }: Props) {
  const [rows, setRows] = useState<ProposerAgg[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('entity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const pageSize = 5;

  // per-row busy state
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initial.length) return;
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const server = await listProposers().catch(() => []);
        let data: ProposerAgg[] = (Array.isArray(server) ? server : []).map(normalizeRow);

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

  // Search
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

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;

      if (sortKey === 'entity') {
        const av = (a.entity || '').toLowerCase();
        const bv = (b.entity || '').toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }

      if (sortKey === 'lastActivity') {
        const av = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const bv = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return av === bv ? 0 : av < bv ? -1 * dir : 1 * dir;
      }

      const numA = Number((a as any)[sortKey] || 0);
      const numB = Number((b as any)[sortKey] || 0);
      return numA === numB ? 0 : numA < numB ? -1 * dir : 1 * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  // Build proposals filter link
  function proposalsHref(r: ProposerAgg) {
    const sp = new URLSearchParams();
    if (r.entity) sp.set('org', r.entity);
    if (r.contactEmail) sp.set('contactEmail', r.contactEmail);
    if (r.ownerEmail) sp.set('ownerEmail', r.ownerEmail);
    if (r.wallet) sp.set('wallet', r.wallet);
    return `/admin/proposals?${sp.toString()}`;
  }

  // Payload for backend (id if present, otherwise orgName/contactEmail/ownerWallet)
  function toIdOrKey(r: ProposerAgg) {
    if (r.id != null) return { id: r.id };
    return { orgName: r.entity, contactEmail: r.contactEmail, ownerWallet: r.wallet };
  }

  async function onArchive(r: ProposerAgg, nextArchived: boolean) {
    const k = keyOf(r);
    setBusy((b) => ({ ...b, [k]: true }));
    const payload = toIdOrKey(r);

    // optimistic
    setRows((prev) =>
      prev.map((x) => (keyOf(x) === k ? { ...x, archived: nextArchived } : x))
    );
    try {
      if (nextArchived) await adminArchiveEntity(payload);
      else await adminUnarchiveEntity(payload);
    } catch (e: any) {
      // revert on error
      setRows((prev) =>
        prev.map((x) => (keyOf(x) === k ? { ...x, archived: !nextArchived } : x))
      );
      alert(e?.message || 'Failed to update archive state');
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  }

  async function onDelete(r: ProposerAgg) {
    if (!confirm(`Delete "${r.entity || '—'}"? This cannot be undone.`)) return;
    const k = keyOf(r);
    setBusy((b) => ({ ...b, [k]: true }));
    const payload = toIdOrKey(r);

    // optimistic
    const prev = rows;
    setRows((p) => p.filter((x) => keyOf(x) !== k));
    try {
      await adminDeleteEntity(payload);
    } catch (e: any) {
      setRows(prev); // revert
      alert(e?.message || 'Failed to delete entity');
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  }

  // UI

  if (loading) return <div className="p-6">Loading entities…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Header + Controls */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-2xl font-bold">Admin — Entities</h1>

          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <div className="w-full sm:w-72">
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search entities, email, wallet…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
              >
                <option value="entity">Sort: Entity</option>
                <option value="proposalsCount">Sort: Proposals</option>
                <option value="approvedCount">Sort: Approved</option>
                <option value="pendingCount">Sort: Pending</option>
                <option value="rejectedCount">Sort: Rejected</option>
                <option value="totalBudgetUSD">Sort: Total Budget</option>
                <option value="lastActivity">Sort: Last Activity</option>
              </select>

              <button
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                title="Toggle sort direction"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {/* Card + Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <Th>Entity / Location</Th>
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
                {pageRows.map((r, i) => {
                  const k = keyOf(r);
                  const isBusy = !!busy[k];
                  return (
                    <tr
                      key={`${r.wallet || r.contactEmail || r.entity || ''}-${i}`}
                      className={`hover:bg-slate-50/60 ${r.archived ? 'opacity-70' : ''}`}
                    >
                      {/* Entity + city, country */}
                      <Td>
                        <div className="font-medium text-slate-900 flex items-center gap-2">
                          {r.entity || '—'}
                          {r.archived && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">
                              archived
                            </span>
                          )}
                        </div>
                        {(r.city || r.country) && (
                          <div className="text-xs text-slate-500">
                            {[r.city, r.country].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </Td>

                      {/* Contact */}
                      <Td>
                        <div className="text-slate-700">
                          {r.contactEmail || r.ownerEmail || '—'}
                        </div>
                        {r.address && (
                          <div className="text-xs text-slate-500 truncate max-w-[280px]" title={r.address}>
                            {r.address}
                          </div>
                        )}
                      </Td>

                      {/* Wallet */}
                      <Td className="font-mono text-xs text-slate-700">
                        {r.wallet ? `${r.wallet.slice(0, 6)}…${r.wallet.slice(-4)}` : '—'}
                      </Td>

                      {/* Counts */}
                      <Td className="text-right">{r.proposalsCount ?? 0}</Td>
                      <Td className="text-right">{r.approvedCount ?? 0}</Td>
                      <Td className="text-right">{r.pendingCount ?? 0}</Td>
                      <Td className="text-right">{r.rejectedCount ?? 0}</Td>
                      <Td className="text-right">{fmtMoney(r.totalBudgetUSD)}</Td>

                      {/* Last activity */}
                      <Td>
                        {r.lastActivity ? new Date(r.lastActivity).toLocaleString() : '—'}
                      </Td>

                      {/* Actions */}
                      <Td className="text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <Link
                            href={proposalsHref(r)}
                            className="inline-flex items-center px-3 py-1.5 rounded-md border border-cyan-600 text-cyan-700 hover:bg-cyan-50"
                          >
                            Proposals
                          </Link>

                          {r.archived ? (
                            <button
                              onClick={() => onArchive(r, false)}
                              disabled={isBusy}
                              className="inline-flex items-center px-3 py-1.5 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                            >
                              Unarchive
                            </button>
                          ) : (
                            <button
                              onClick={() => onArchive(r, true)}
                              disabled={isBusy}
                              className="inline-flex items-center px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                            >
                              Archive
                            </button>
                          )}

                          <button
                            onClick={() => onDelete(r)}
                            disabled={isBusy}
                            className="inline-flex items-center px-3 py-1.5 rounded-md bg-rose-100 text-rose-800 hover:bg-rose-200 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}

                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-500">
                      No entities found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
            <div className="text-sm text-slate-600">
              Page <b>{safePage}</b> of <b>{totalPages}</b> — {rows.length} total
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Small presentational helpers ---------- */

function Th({
  children,
  className = '',
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: React.PropsWithChildren<{ className?: string }>) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}
