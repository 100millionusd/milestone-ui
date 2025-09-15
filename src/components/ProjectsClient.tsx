'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Proposal, Bid } from '@/lib/api';
import { listProposals, getBids } from '@/lib/api';

type TabKey = 'active' | 'completed' | 'archived';

export default function ProjectsClient() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('active');

  useEffect(() => {
    const run = async () => {
      try {
        setErr(null);
        setLoading(true);
        // includeArchived=true so we can populate the Archived tab
        const [ps, bs] = await Promise.all([
          listProposals({ includeArchived: true }),
          getBids(),
        ]);
        setProposals(ps);
        setBids(bs);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const bidsByProposal = useMemo(() => {
    const map = new Map<number, Bid[]>();
    for (const b of bids) {
      const key = b.proposalId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [bids]);

  function getBidsForProposal(id: number): Bid[] {
    return bidsByProposal.get(id) || [];
  }

  function isProposalCompleted(p: Proposal): boolean {
    if (p.status === 'completed') return true;
    // If there’s an approved bid, consider completed when all milestones are done
    const accepted = getBidsForProposal(p.proposalId).find(b => b.status === 'approved');
    if (!accepted) return false;
    if (Array.isArray(accepted.milestones) && accepted.milestones.length > 0) {
      return accepted.milestones.every(m => !!m.completed);
    }
    // or if bid itself is marked completed
    return accepted.status === 'completed';
  }

  function isProposalArchived(p: Proposal): boolean {
    return p.status === 'archived';
  }

  const activeItems = useMemo(
    () => proposals.filter(p => !isProposalArchived(p) && !isProposalCompleted(p)),
    [proposals]
  );
  const completedItems = useMemo(
    () => proposals.filter(p => isProposalCompleted(p)),
    [proposals]
  );
  const archivedItems = useMemo(
    () => proposals.filter(p => isProposalArchived(p)),
    [proposals]
  );

  const tabCounts = {
    active: activeItems.length,
    completed: completedItems.length,
    archived: archivedItems.length,
  };

  const items = tab === 'active' ? activeItems : tab === 'completed' ? completedItems : archivedItems;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-14 bg-white/70 rounded-2xl shadow-sm" />
          <div className="h-24 bg-white/70 rounded-2xl shadow-sm" />
          <div className="h-24 bg-white/70 rounded-2xl shadow-sm" />
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          Error: {err}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-10">
        {/* Top bar / Tabs */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4 mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
                Projects
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Browse active, completed, and archived projects.
              </p>
            </div>

            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/60 p-1">
              <TabButton
                label={`Active (${tabCounts.active})`}
                active={tab === 'active'}
                onClick={() => setTab('active')}
              />
              <TabButton
                label={`Completed (${tabCounts.completed})`}
                active={tab === 'completed'}
                onClick={() => setTab('completed')}
              />
              <TabButton
                label={`Archived (${tabCounts.archived})`}
                active={tab === 'archived'}
                onClick={() => setTab('archived')}
              />
            </div>
          </div>
        </div>

        {/* Grid of project cards */}
        <div className="grid gap-5">
          {items.map((p) => (
            <ProjectCard
              key={p.proposalId}
              proposal={p}
              bids={getBidsForProposal(p.proposalId)}
              isCompleted={isProposalCompleted(p)}
              isArchived={isProposalArchived(p)}
            />
          ))}

          {items.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-10 text-center">
              <div className="text-5xl mb-3">🗂️</div>
              <p className="text-slate-700 font-medium">
                {tab === 'active'
                  ? 'There are no active projects at the moment.'
                  : tab === 'completed'
                  ? 'No completed projects yet.'
                  : 'No archived projects.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Components ---------------- */

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3.5 py-2 text-sm font-medium rounded-lg transition',
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function ProjectCard({
  proposal,
  bids,
  isCompleted,
  isArchived,
}: {
  proposal: Proposal;
  bids: Bid[];
  isCompleted: boolean;
  isArchived: boolean;
}) {
  const accepted = bids.find((b) => b.status === 'approved');
  const statusPill =
    isArchived
      ? { text: 'Archived', cls: 'bg-slate-200 text-slate-800' }
      : isCompleted
      ? { text: 'Completed', cls: 'bg-green-100 text-green-800' }
      : { text: 'Active', cls: 'bg-amber-100 text-amber-800' };

  const showSubmitBid = !isArchived && !isCompleted && !accepted;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">{proposal.title}</h2>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusPill.cls}`}>
              {statusPill.text}
            </span>
          </div>
          <p className="text-slate-600 mt-0.5">{proposal.orgName}</p>
          <p className="text-green-600 font-medium mt-2">
            Budget: ${Number(proposal.amountUSD).toLocaleString()}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm text-slate-500 mb-3">
            {bids.length} {bids.length === 1 ? 'bid' : 'bids'} •{' '}
            {accepted ? 'Contract awarded' : 'Accepting bids'}
          </p>
          <div className="flex justify-end gap-2">
            <Link
              href={`/projects/${proposal.proposalId}`}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"
            >
              View Project
            </Link>
            {showSubmitBid && (
              <Link
                href={`/bids/new?proposalId=${proposal.proposalId}`}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700"
              >
                Submit a Bid
              </Link>
            )}
          </div>
        </div>
      </div>

      {proposal.summary && (
        <p className="mt-3 text-sm text-slate-700 line-clamp-3">{proposal.summary}</p>
      )}
    </div>
  );
}
