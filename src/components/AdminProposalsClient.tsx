// src/components/AdminProposalsClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Proposal } from '@/lib/api';
import {
  listProposals,           // fetch with includeArchived so "Archived" tab works
  getProposals,            // (kept to not break other imports/usages)
  approveProposal,
  rejectProposal,
  archiveProposal,
  API_BASE,
  deleteProposal,
} from '@/lib/api';
import ProposalAgent from './ProposalAgent';

// ---- Attachments helpers (images + pdfs) ----
const PINATA_GATEWAY =
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY) ||
  'gateway.pinata.cloud';

function resolveUrl(d: any): string | null {
  const url = String(d?.url || d?.href || '').trim();
  if (url) return url;
  const cid = String(d?.cid || '').trim();
  if (cid) return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  if (typeof d === 'string' && d.startsWith('ipfs://')) {
    const cidOnly = d.replace(/^ipfs:\/\//, '');
    return `https://${PINATA_GATEWAY}/ipfs/${cidOnly}`;
  }
  if (typeof d === 'string' && /^https?:\/\//i.test(d)) return d;
  return null;
}

function isImageUrl(u: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(u);
}
function isPdfUrl(u: string) {
  return /\.pdf(\?.*)?$/i.test(u) || u.toLowerCase().includes('application/pdf');
}

function AttachmentGrid({
  items,
  onOpenLightbox,
}: {
  items: any[];
  onOpenLightbox: (src: string) => void;
}) {
  const list = (Array.isArray(items) ? items : []).map((d) => {
    const url = resolveUrl(d);
    const name =
      String(d?.name || d?.filename || d?.title || '').trim() ||
      (url ? url.split('/').pop() || 'file' : 'file');
    return { url, name };
  }).filter(x => !!x.url) as { url: string; name: string }[];

  if (list.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-slate-900 mb-2">Attachments</h4>
      <div className="flex flex-wrap gap-3">
        {list.map((f, i) => {
          const img = isImageUrl(f.url);
          const pdf = isPdfUrl(f.url);
          if (img) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onOpenLightbox(f.url)}
                className="group relative w-28 h-28 overflow-hidden rounded-lg border border-slate-200 bg-white hover:shadow"
                title={f.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={f.name}
                  className="w-full h-full object-cover"
                />
                <span className="absolute inset-x-0 bottom-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate">
                  {f.name}
                </span>
              </button>
            );
          }
          return (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs"
              title={f.name}
            >
              {pdf ? (
                <span className="inline-block w-2 h-2 rounded-full bg-rose-600" />
              ) : (
                <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
              )}
              <span className="truncate max-w-[160px]">{f.name}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

/** =======================
 * Entities (proposers) types
 * ======================= */
type ProposerRow = {
  id: string;                    // entity_key (wallet/email/org)
  orgName: string;
  address: string | null;
  walletAddress: string | null;
  contactEmail: string | null;
  ownerEmail: string | null;
  proposalsCount: number;
  totalBudgetUSD: number;
  lastProposalAt: string | null;
  statusCounts: { approved: number; pending: number; rejected: number; archived: number };
};
type ProposersResponse = {
  items: ProposerRow[];
  total: number;
  page: number;
  pageSize: number;
};
const fmtUSD = (n: number) =>
  Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const fmtDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
async function loadProposers(params: { q?: string; includeArchived?: boolean; page?: number; limit?: number } = {}) {
  const { q = '', includeArchived = false, page = 1, limit = 50 } = params;
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) qs.set('q', q);
  if (includeArchived) qs.set('includeArchived', 'true');
  const res = await fetch(`/admin/proposers?${qs.toString()}`, { credentials: 'include' }); // <-- THIS LINE IS WRONG
  if (!res.ok) throw new Error('Failed to load entities');
  return (await res.json()) as ProposersResponse;
}

type TabKey = 'all' | 'pending' | 'approved' | 'rejected' | 'completed' | 'archived';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'completed', label: 'Completed' },
  { key: 'archived', label: 'Archived' },
];

interface AdminProposalsClientProps {
  initialProposals?: Proposal[];
  defaultMode?: 'proposals' | 'entities';
}

export default function AdminProposalsClient({
  initialProposals = [],
  defaultMode = 'proposals',
}: AdminProposalsClientProps) {
  // ====== top-level mode: proposals vs entities ======
  const [mode, setMode] = useState<'proposals' | 'entities'>(defaultMode);

  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
  const [loading, setLoading] = useState(initialProposals.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Tabs + search (for proposals)
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  // Entities filters
  const [includeArchived, setIncludeArchived] = useState(false);

useEffect(() => {
  if (mode !== 'proposals') {
    // if we land on Entities, don’t show a proposals loading state
    setLoading(false);
    return;
  }
  if (initialProposals.length === 0) fetchProposals();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [initialProposals.length, mode]);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listProposals({ includeArchived: true });
      setProposals(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch proposals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (proposalId: number) => {
    if (!Number.isFinite(proposalId)) return setError('Invalid proposal ID');
    try {
      const updated = await approveProposal(proposalId);
      setProposals(prev => prev.map(p => (p.proposalId === proposalId ? { ...p, ...updated } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve proposal');
    }
  };

  const handleReject = async (proposalId: number) => {
    if (!Number.isFinite(proposalId)) return setError('Invalid proposal ID');
    try {
      const updated = await rejectProposal(proposalId);
      setProposals(prev => prev.map(p => (p.proposalId === proposalId ? { ...p, ...updated } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  };

  const handleArchive = async (proposalId: number) => {
    if (!Number.isFinite(proposalId)) return setError('Invalid proposal ID');
    if (!confirm('Archive this proposal?')) return;
    try {
      const updated = await archiveProposal(proposalId);
      setProposals(prev => prev.map(p => (p.proposalId === proposalId ? { ...p, ...updated } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive proposal');
    }
  };

  const handleDelete = async (proposalId: number) => {
    if (!Number.isFinite(proposalId)) return setError('Invalid proposal ID');
    if (!confirm('Permanently DELETE this proposal (and its bids/proofs)? This cannot be undone.')) return;
    try {
      await deleteProposal(proposalId);
      setProposals(prev => prev.filter(p => p.proposalId !== proposalId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete proposal');
    }
  };

  // ===== Entities state & loader =====
  const [entities, setEntities] = useState<ProposersResponse>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
  });
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const [entitiesPage, setEntitiesPage] = useState(1);

  useEffect(() => {
    if (mode !== 'entities') return;
    let alive = true;
    (async () => {
      try {
        setEntitiesLoading(true);
        setEntitiesError(null);
        const data = await loadProposers({ q: query, includeArchived, page: entitiesPage, limit: 50 });
        if (alive) setEntities(data);
      } catch (e: any) {
        if (alive) setEntitiesError(e?.message || 'Failed to load');
      } finally {
        if (alive) setEntitiesLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [mode, query, includeArchived, entitiesPage]);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      all: proposals.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      completed: 0,
      archived: 0,
    };
    for (const p of proposals) {
      const s = (p.status || 'pending') as TabKey;
      if (s in c) c[s] += 1;
    }
    return c;
  }, [proposals]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = proposals.filter(p => {
      if (!q) return true;
      const hay = `${p.title || ''} ${p.orgName || ''} ${p.summary || ''}`.toLowerCase();
      return hay.includes(q);
    });
    switch (tab) {
      case 'pending': return base.filter(p => p.status === 'pending');
      case 'approved': return base.filter(p => p.status === 'approved');
      case 'rejected': return base.filter(p => p.status === 'rejected');
      case 'completed': return base.filter(p => p.status === 'completed');
      case 'archived': return base.filter(p => p.status === 'archived');
      default: return base;
    }
  }, [proposals, tab, query]);

  if (loading) return <div className="p-6">Loading proposals...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Admin — Proposals & Entities</h1>

        {/* Top-level tabs: Proposals | Entities */}
        <div className="mb-4 flex gap-2">
          <button
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${mode === 'proposals' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
            onClick={() => setMode('proposals')}
          >
            Proposals
          </button>
          <button
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${mode === 'entities' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
            onClick={() => setMode('entities')}
          >
            Entities
          </button>
        </div>

        {/* ===========================
            PROPOSALS MODE (existing UI)
           =========================== */}
        {mode === 'proposals' && (
          <>
            {/* Tabs + search (status filter for proposals) */}
            <div className="mb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {TABS.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={[
                      'px-3 py-1.5 rounded-full text-sm font-medium border',
                      tab === t.key
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {t.label}
                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {t.key === 'all' ? counts.all : counts[t.key] || 0}
                    </span>
                  </button>
                ))}
              </div>
              <div className="w-full md:w-80">
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search proposals…"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
            </div>

            <div className="grid gap-5">
              {filtered.map((p) => (
                <div
                  key={p.proposalId}
                  className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6"
                >
                  {/* Header */}
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
                      <div className="mt-1 text-sm text-slate-600">
                        <span className="font-medium">{p.orgName}</span>
                        {(p.city || p.country) && (
                          <span> · {[p.city, p.country].filter(Boolean).join(', ')}</span>
                        )}
                      </div>
                      <p className="mt-3 text-sm text-slate-700">{p.summary}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500">#{p.proposalId}</div>
                      <div className="mt-2 text-sm">
                        <span className="text-slate-500">Requested: </span>
                        <span className="font-semibold">
                          ${Number(p.amountUSD).toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2">
                        <StatusPill status={p.status} />
                      </div>
                    </div>
                  </div>

                  {/* Contact & meta */}
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <p className="text-slate-700">
                      <span className="font-semibold text-slate-900">Contact:</span> {p.contact}
                    </p>
                    {(p.address || p.city || p.country) && (
                      <p className="mt-1 text-slate-700">
                        <span className="font-semibold text-slate-900">Address:</span>{' '}
                        {[p.address, p.city, p.country].filter(Boolean).join(', ')}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Submitted: {new Date(p.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* Attachments (from Proposal.docs) */}
{Array.isArray(p.docs) && p.docs.length > 0 && (
  <AttachmentGrid
    items={p.docs}
    onOpenLightbox={(src) => setLightbox(src)}
  />
)}


                  {/* ✅ Keep AI Chat Agent */}
                  <ProposalAgent proposal={p} />

                  {/* Actions */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleApprove(p.proposalId)}
                      disabled={p.status === 'approved'}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-emerald-700 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(p.proposalId)}
                      disabled={p.status === 'rejected'}
                      className="px-4 py-2 bg-rose-600 text-white rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-rose-700 transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => handleArchive(p.proposalId)}
                      disabled={p.status === 'archived'}
                      className="px-4 py-2 bg-slate-700 text-white rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-slate-800 transition-colors"
                    >
                      Archive
                    </button>
                    <button
                      onClick={() => handleDelete(p.proposalId)}
                      className="px-4 py-2 bg-red-700 text-white rounded-lg hover:bg-red-800 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="text-center py-10 text-slate-500 bg-white border border-slate-200 rounded-2xl">
                  No proposals match this view.
                </div>
              )}
            </div>
          </>
        )}

        {/* ===========================
            ENTITIES MODE (new table)
           =========================== */}
        {mode === 'entities' && (
          <div className="space-y-4">
            {/* Filters for entities */}
            <div className="flex items-center gap-3">
              <input
                value={query}
                onChange={(e) => { setEntitiesPage(1); setQuery(e.target.value); }}
                placeholder="Search org/contact/wallet"
                className="w-72 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => { setEntitiesPage(1); setIncludeArchived(e.target.checked); }}
                />
                Include archived
              </label>
            </div>

            <div className="overflow-auto border border-slate-200 rounded-2xl bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2">Entity / Org</th>
                    <th className="text-left px-3 py-2">Address</th>
                    <th className="text-left px-3 py-2">Primary contact</th>
                    <th className="text-left px-3 py-2">Wallet</th>
                    <th className="text-right px-3 py-2">Proposals (#)</th>
                    <th className="text-left px-3 py-2">Approved / Pending / Rejected</th>
                    <th className="text-right px-3 py-2">Total Budget (USD)</th>
                    <th className="text-left px-3 py-2">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {entitiesLoading && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-500">Loading…</td>
                    </tr>
                  )}
                  {entitiesError && !entitiesLoading && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-red-600">{entitiesError}</td>
                    </tr>
                  )}
                  {!entitiesLoading && !entitiesError && entities.items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-slate-500">No results</td>
                    </tr>
                  )}
                  {!entitiesLoading && !entitiesError && entities.items.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{r.orgName || '—'}</td>
                      <td className="px-3 py-2">{r.address || '—'}</td>
                      <td className="px-3 py-2">{r.contactEmail || r.ownerEmail || '—'}</td>
                      <td className="px-3 py-2">{r.walletAddress || '—'}</td>
                      <td className="px-3 py-2 text-right">{r.proposalsCount}</td>
                      <td className="px-3 py-2">
                        {r.statusCounts.approved} / {r.statusCounts.pending} / {r.statusCounts.rejected}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtUSD(r.totalBudgetUSD)}</td>
                      <td className="px-3 py-2">{fmtDateTime(r.lastProposalAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pager */}
            <div className="flex items-center gap-2">
              <button
                className="border rounded px-3 py-1"
                disabled={entitiesPage <= 1}
                onClick={() => setEntitiesPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <div className="text-sm">Page {entitiesPage}</div>
              <button
                className="border rounded px-3 py-1"
                onClick={() => setEntitiesPage((p) => p + 1)}
              >
                Next
              </button>
              <div className="text-sm text-slate-500">Total entities: {entities.total}</div>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox (kept) */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 p-4 md:p-8"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="preview" className="mx-auto max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function StatusPill({ status }: { status: string }) {
  const classes =
    status === 'approved'
      ? 'bg-green-100 text-green-800'
      : status === 'rejected'
      ? 'bg-red-100 text-red-800'
      : status === 'completed'
      ? 'bg-blue-100 text-blue-800'
      : status === 'archived'
      ? 'bg-slate-200 text-slate-700'
      : 'bg-yellow-100 text-yellow-800';

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${classes}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
