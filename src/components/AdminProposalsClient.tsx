// src/components/AdminProposalsClient.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { Proposal } from '@/lib/api';
import {
  listProposals,           // 👈 fetch with includeArchived so "Archived" tab works
  getProposals,            // (kept to not break other imports/usages)
  approveProposal,
  rejectProposal,
  archiveProposal,
  deleteProposal,
} from '@/lib/api';
import ProposalAgent from './ProposalAgent';

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
}

export default function AdminProposalsClient({ initialProposals = [] }: AdminProposalsClientProps) {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
  const [loading, setLoading] = useState(initialProposals.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Tabs + search
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (initialProposals.length === 0) fetchProposals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProposals.length]);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      setError(null);
      // 👇 include archived so the "Archived" tab has data
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
        <h1 className="text-2xl font-bold mb-6">Admin — Proposals Management</h1>

        {/* Tabs + search */}
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
