// src/components/AdminProposalsClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Proposal } from '@/lib/api';
import {
  listProposals,
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
  const list = (Array.isArray(items) ? items : [])
    .map((d) => {
      const url = resolveUrl(d);
      const name =
        String(d?.name || d?.filename || d?.title || '').trim() ||
        (url ? url.split('/').pop() || 'file' : 'file');
      return { url, name };
    })
    .filter((x) => !!x.url) as { url: string; name: string }[];

  if (list.length === 0) return null;

  return (
    <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
        Attachments ({list.length})
      </h4>
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
                className="group relative w-20 h-20 overflow-hidden rounded-lg border border-slate-200 bg-white hover:shadow-md transition-all"
                title={f.name}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
              </button>
            );
          }
          return (
            <a
              key={i}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-medium transition-colors"
              title={f.name}
            >
              {pdf ? (
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-rose-500" />
              ) : (
                <span className="flex-shrink-0 w-2 h-2 rounded-full bg-slate-400" />
              )}
              <span className="truncate max-w-[140px]">{f.name}</span>
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
  id: string; // entity_key
  orgName: string;
  address: string | null;
  walletAddress: string | null;
  contactEmail: string | null;
  ownerEmail: string | null;
  proposalsCount: number;
  totalBudgetUSD: number;
  lastProposalAt: string | null;
  statusCounts?: { approved: number; pending: number; rejected: number; archived: number };
};

type ProposersResponse = {
  items: ProposerRow[];
  total: number;
  page: number;
  pageSize: number;
};

const fmtUSD = (n: number) =>
  Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

async function loadProposers(
  params: { q?: string; includeArchived?: boolean; page?: number; limit?: number } = {}
) {
  const { q = '', includeArchived = false, page = 1, limit = 50 } = params;
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) qs.set('q', q);
  if (includeArchived) qs.set('includeArchived', 'true');
  const res = await fetch(`${API_BASE}/admin/entities?${qs.toString()}`, {
    credentials: 'include',
  });
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
      setProposals((prev) =>
        prev.map((p) => (p.proposalId === proposalId ? { ...p, ...updated } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve proposal');
    }
  };

  const handleReject = async (proposalId: number) => {
    if (!Number.isFinite(proposalId)) return setError('Invalid proposal ID');
    try {
      const updated = await rejectProposal(proposalId);
      setProposals((prev) =>
        prev.map((p) => (p.proposalId === proposalId ? { ...p, ...updated } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  };

  const handleArchive = async (proposalId: number) => {
    if (!Number.isFinite(proposalId)) return setError('Invalid proposal ID');
    if (!confirm('Archive this proposal?')) return;
    try {
      const updated = await archiveProposal(proposalId);
      setProposals((prev) =>
        prev.map((p) => (p.proposalId === proposalId ? { ...p, ...updated } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive proposal');
    }
  };

  const handleDelete = async (proposalId: number) => {
    if (!Number.isFinite(proposalId)) return setError('Invalid proposal ID');
    if (!confirm('Permanently DELETE this proposal (and its bids/proofs)? This cannot be undone.'))
      return;
    try {
      await deleteProposal(proposalId);
      setProposals((prev) => prev.filter((p) => p.proposalId !== proposalId));
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
        const data = await loadProposers({
          q: query,
          includeArchived,
          page: entitiesPage,
          limit: 50,
        });
        if (alive) setEntities(data);
      } catch (e: any) {
        if (alive) setEntitiesError(e?.message || 'Failed to load');
      } finally {
        if (alive) setEntitiesLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
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
    const base = proposals.filter((p) => {
      if (!q) return true;
      const hay = `${p.title || ''} ${p.orgName || ''} ${p.summary || ''}`.toLowerCase();
      return hay.includes(q);
    });
    switch (tab) {
      case 'pending':
        return base.filter((p) => p.status === 'pending');
      case 'approved':
        return base.filter((p) => p.status === 'approved');
      case 'rejected':
        return base.filter((p) => p.status === 'rejected');
      case 'completed':
        return base.filter((p) => p.status === 'completed');
      case 'archived':
        return base.filter((p) => p.status === 'archived');
      default:
        return base;
    }
  }, [proposals, tab, query]);

  // Financial Metrics for Dashboard Header
  const metrics = useMemo(() => {
    const pendingValue = proposals
      .filter((p) => p.status === 'pending')
      .reduce((acc, cur) => acc + Number(cur.amountUSD || 0), 0);
    const approvedValue = proposals
      .filter((p) => p.status === 'approved')
      .reduce((acc, cur) => acc + Number(cur.amountUSD || 0), 0);
    return { pendingValue, approvedValue };
  }, [proposals]);

  if (loading && proposals.length === 0)
    return (
      <div className="p-10 max-w-5xl mx-auto space-y-4 animate-pulse">
        <div className="h-10 bg-slate-200 rounded w-1/3"></div>
        <div className="h-64 bg-slate-200 rounded-xl"></div>
      </div>
    );

  if (error)
    return (
      <div className="p-10 text-center">
        <div className="inline-block p-4 bg-red-50 text-red-600 rounded-xl border border-red-100">
          <strong className="block font-bold mb-1">Error Loading Proposals</strong>
          {error}
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">
              Overview of submitted proposals and registered entities
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="bg-white p-1 rounded-xl border border-slate-200 shadow-sm inline-flex">
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'proposals'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setMode('proposals')}
            >
              Proposals
            </button>
            <button
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'entities'
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              onClick={() => setMode('entities')}
            >
              Entities
            </button>
          </div>
        </div>

        {/* ===========================
            PROPOSALS MODE
           =========================== */}
        {mode === 'proposals' && (
          <>
            {/* Summary Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                  Pending Review
                </div>
                <div className="flex items-end justify-between mt-2">
                  <div className="text-3xl font-bold text-slate-900">{counts.pending}</div>
                  <div className="text-slate-400 mb-1">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                  Pending Value
                </div>
                <div className="flex items-end justify-between mt-2">
                  <div className="text-3xl font-bold text-slate-900">{fmtUSD(metrics.pendingValue)}</div>
                  <div className="text-yellow-500 mb-1">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                  Total Approved
                </div>
                <div className="flex items-end justify-between mt-2">
                  <div className="text-3xl font-bold text-emerald-700">
                    {fmtUSD(metrics.approvedValue)}
                  </div>
                  <div className="text-emerald-500 mb-1">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Controls Row */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 sticky top-2 z-20 bg-[#F8FAFC]/90 backdrop-blur py-2">
              <div className="flex flex-wrap gap-2">
                {TABS.map((t) => {
                  const isActive = tab === t.key;
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                        isActive
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      {t.label}
                      <span
                        className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-slate-600 text-white'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'
                        }`}
                      >
                        {t.key === 'all' ? counts.all : counts[t.key] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="relative w-full lg:w-80">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg
                    className="h-4 w-4 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search proposals..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent shadow-sm"
                />
              </div>
            </div>

            {/* List Grid */}
            <div className="space-y-6">
              {filtered.map((p) => (
                <div
                  key={p.proposalId}
                  className="group bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
                >
                  {/* Status Indicator Line */}
                  <div
                    className={`h-1 w-full ${
                      p.status === 'approved'
                        ? 'bg-emerald-500'
                        : p.status === 'rejected'
                        ? 'bg-rose-500'
                        : p.status === 'pending'
                        ? 'bg-amber-400'
                        : 'bg-slate-300'
                    }`}
                  />

                  <div className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      {/* Main Content Area */}
                      <div className="flex-1 min-w-0">
                        {/* Header Meta */}
                        <div className="flex items-center gap-3 mb-2 text-xs text-slate-400 font-medium uppercase tracking-wider">
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            ID: #{p.proposalId}
                          </span>
                          <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                        </div>

                        {/* Title & Org */}
                        <h3 className="text-xl font-bold text-slate-900 leading-tight mb-1">
                          {p.title}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
                          <span className="font-semibold text-emerald-700">{p.orgName}</span>
                          {(p.city || p.country) && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span>
                                {[p.city, p.country].filter(Boolean).join(', ')}
                              </span>
                            </>
                          )}
                        </div>

                        {/* Summary */}
                        <p className="text-slate-600 text-sm leading-relaxed mb-6 max-w-3xl">
                          {p.summary}
                        </p>

                        {/* Contact Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs border-t border-slate-100 pt-4 mb-4">
                          <div>
                            <span className="block font-semibold text-slate-800 mb-1">
                              Contact Person
                            </span>
                            <span className="text-slate-600 break-all">{p.contact}</span>
                          </div>
                          <div>
                            <span className="block font-semibold text-slate-800 mb-1">
                              Full Address
                            </span>
                            <span className="text-slate-600">
                              {[p.address, p.city, p.country].filter(Boolean).join(', ') || '—'}
                            </span>
                          </div>
                        </div>

                        {/* Attachments */}
                        {Array.isArray(p.docs) && p.docs.length > 0 && (
                          <AttachmentGrid
                            items={p.docs}
                            onOpenLightbox={(src) => setLightbox(src)}
                          />
                        )}

                        {/* Agent / Automation */}
                        <div className="mt-6 bg-indigo-50/50 border border-indigo-100 rounded-xl p-1">
                          <ProposalAgent proposal={p} />
                        </div>
                      </div>

                      {/* Sidebar: Stats & Actions */}
                      <div className="w-full md:w-64 flex-shrink-0 flex flex-col border-t md:border-t-0 md:border-l border-slate-100 md:pl-6 md:pt-0 pt-6">
                        
                        <div className="mb-6">
                            <div className="text-xs font-semibold text-slate-400 uppercase mb-1">
                                Requested Budget
                            </div>
                            <div className="text-3xl font-bold text-slate-900 tracking-tight">
                                {Number(p.amountUSD).toLocaleString('en-US', {
                                style: 'currency',
                                currency: 'USD',
                                maximumFractionDigits: 0,
                                })}
                            </div>
                            <div className="mt-3">
                                <StatusPill status={p.status} />
                            </div>
                        </div>

                        <div className="mt-auto space-y-3">
                          {p.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(p.proposalId)}
                                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                Approve
                              </button>
                              <button
                                onClick={() => handleReject(p.proposalId)}
                                className="w-full py-2.5 px-4 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                Reject
                              </button>
                            </>
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100">
                            <button
                              onClick={() => handleArchive(p.proposalId)}
                              disabled={p.status === 'archived'}
                              className="px-3 py-2 text-xs font-medium text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg disabled:opacity-50 transition-colors"
                            >
                              Archive
                            </button>
                            <button
                              onClick={() => handleDelete(p.proposalId)}
                              className="px-3 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="text-center py-20 bg-white border border-slate-200 rounded-2xl border-dashed">
                  <div className="mx-auto w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                     <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                     </svg>
                  </div>
                  <p className="text-slate-500 text-sm font-medium">No proposals match this view.</p>
                  <button onClick={() => {setQuery(''); setTab('all');}} className="text-emerald-600 text-sm mt-2 hover:underline">Clear filters</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ===========================
            ENTITIES MODE
           =========================== */}
        {mode === 'entities' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <div className="relative w-full sm:w-96">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                 </div>
                <input
                  value={query}
                  onChange={(e) => {
                    setEntitiesPage(1);
                    setQuery(e.target.value);
                  }}
                  placeholder="Search org, contact email, or wallet address..."
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer hover:text-slate-900 select-none">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  onChange={(e) => {
                    setEntitiesPage(1);
                    setIncludeArchived(e.target.checked);
                  }}
                />
                Show archived entities
              </label>
            </div>

            {/* Table Card */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-4 py-4 font-semibold text-slate-700 whitespace-nowrap">Organization / Wallet</th>
                      <th className="px-4 py-4 font-semibold text-slate-700 whitespace-nowrap">Address Details</th>
                      <th className="px-4 py-4 font-semibold text-slate-700 whitespace-nowrap">Contact</th>
                      <th className="px-4 py-4 font-semibold text-slate-700 text-center">Status (Appr/Pend/Rej)</th>
                      <th className="px-4 py-4 font-semibold text-slate-700 text-right whitespace-nowrap">Total Budget</th>
                      <th className="px-4 py-4 font-semibold text-slate-700 whitespace-nowrap">Last Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {entitiesLoading && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <div className="animate-pulse flex flex-col items-center">
                             <div className="h-4 w-48 bg-slate-200 rounded mb-2"></div>
                             <div className="h-3 w-32 bg-slate-100 rounded"></div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {entitiesError && !entitiesLoading && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-red-600">
                          {entitiesError}
                        </td>
                      </tr>
                    )}
                    {!entitiesLoading && !entitiesError && entities.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500 italic">
                          No entities found.
                        </td>
                      </tr>
                    )}
                    {!entitiesLoading &&
                      !entitiesError &&
                      entities.items.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition-colors group">
                          <td className="px-4 py-3 align-top">
                            <div className="font-bold text-slate-900">{r.orgName || '—'}</div>
                            <div className="text-xs font-mono text-slate-500 mt-1 truncate max-w-[140px]" title={r.walletAddress || ''}>
                                {r.walletAddress || 'No Wallet'}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">Proposals: {r.proposalsCount}</div>
                          </td>
                          
                          <td className="px-4 py-3 align-top max-w-[200px]">
                             <div className="text-slate-600 text-xs leading-snug line-clamp-3" title={formatEntityAddress(r.address)}>
                                {formatEntityAddress(r.address)}
                             </div>
                          </td>
                          
                          <td className="px-4 py-3 align-top">
                             <div className="text-slate-700 text-xs">{r.contactEmail}</div>
                             {r.ownerEmail && r.ownerEmail !== r.contactEmail && (
                                 <div className="text-slate-400 text-[10px] mt-0.5">{r.ownerEmail}</div>
                             )}
                          </td>
                          
                          <td className="px-4 py-3 align-middle text-center">
                             <div className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1">
                                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700" title="Approved">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    {r.statusCounts?.approved ?? 0}
                                </span>
                                <span className="text-slate-300">/</span>
                                <span className="flex items-center gap-1 text-xs font-medium text-amber-700" title="Pending">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    {r.statusCounts?.pending ?? 0}
                                </span>
                                <span className="text-slate-300">/</span>
                                <span className="flex items-center gap-1 text-xs font-medium text-rose-700" title="Rejected">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    {r.statusCounts?.rejected ?? 0}
                                </span>
                             </div>
                          </td>
                          
                          <td className="px-4 py-3 align-top text-right font-mono text-slate-700">
                             {fmtUSD(r.totalBudgetUSD)}
                          </td>
                          <td className="px-4 py-3 align-top text-xs text-slate-500 whitespace-nowrap">
                             {fmtDateTime(r.lastProposalAt)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 flex items-center justify-between">
                 <div className="text-xs text-slate-500">
                    Total: <span className="font-medium text-slate-700">{entities.total}</span> entities
                 </div>
                 <div className="flex items-center gap-2">
                    <button
                        className="px-3 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={entitiesPage <= 1}
                        onClick={() => setEntitiesPage((p) => Math.max(1, p - 1))}
                    >
                        Previous
                    </button>
                    <span className="text-xs font-medium text-slate-700">Page {entitiesPage}</span>
                    <button
                        className="px-3 py-1 rounded border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-100"
                        onClick={() => setEntitiesPage((p) => p + 1)}
                        disabled={entities.items.length < 50} // primitive check, ideally utilize total/pages
                    >
                        Next
                    </button>
                 </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center cursor-pointer"
          onClick={() => setLightbox(null)}
        >
            <div className="relative max-w-full max-h-full">
                <button 
                    onClick={() => setLightbox(null)}
                    className="absolute -top-12 right-0 text-white hover:text-slate-300 p-2"
                >
                    <span className="sr-only">Close</span>
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={lightbox} alt="preview" className="max-h-[90vh] w-auto rounded-lg shadow-2xl border border-slate-700" />
            </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function StatusPill({ status }: { status: string }) {
  const styles = {
    approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rejected: 'bg-rose-100 text-rose-800 border-rose-200',
    completed: 'bg-blue-100 text-blue-800 border-blue-200',
    archived: 'bg-slate-100 text-slate-600 border-slate-200',
    pending: 'bg-amber-100 text-amber-800 border-amber-200',
  };

  const s = (status || 'pending') as keyof typeof styles;
  const activeClass = styles[s] || styles.pending;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${activeClass} capitalize shadow-sm`}>
      {status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse"/>}
      {status === 'approved' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"/>}
      {status}
    </span>
  );
}

function formatEntityAddress(raw: string | null): string {
  if (!raw) return '—';
  let result = raw;

  // Detect and parse JSON blobs like {"line1":"..."}
  const jsonRegex = /\{.*?\}/g;

  result = result.replace(jsonRegex, (match) => {
    try {
      const parsed = JSON.parse(match);
      const parts = [
        parsed.line1,
        parsed.line2,
        parsed.city,
        parsed.state,
        parsed.postalCode,
        parsed.country,
      ].filter(Boolean);
      if (parts.length > 0) return parts.join(', ');
      return '';
    } catch {
      // If parsing failed, keep the original blob text or clear it
      return match;
    }
  });

  // Cleanup double commas or leading/trailing messy separators
  return result
    .replace(/,\s*,/g, ', ') // "part1, , part2" -> "part1, part2"
    .replace(/^[\s,]+|[\s,]+$/g, '') // remove leading/trailing commas/spaces
    .trim();
}