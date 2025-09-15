'use client';

import React, { useEffect, useState } from 'react';
import type { Proposal } from '@/lib/api';
import { getProposals } from '@/lib/api';

export default function ProjectsClient() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const rows = await getProposals();
        setProposals(rows);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const active = proposals.filter((p) => p.status === 'approved');
  const completed = proposals.filter((p) => p.status === 'completed');
  const archived = proposals.filter((p) => p.status === 'archived');

  if (loading) return <div className="max-w-5xl mx-auto p-6">Loading projects…</div>;
  if (err) return <div className="max-w-5xl mx-auto p-6 text-rose-600">Error: {err}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
        {/* Active */}
        <Section title="Active Projects" emptyText="There are no active projects at the moment.">
          <Grid>
            {active.map((p) => (
              <Card key={p.proposalId} p={p} />
            ))}
          </Grid>
        </Section>

        {/* Completed */}
        <Section title="Completed Projects" emptyText="No completed projects yet.">
          <Grid>
            {completed.map((p) => (
              <Card key={p.proposalId} p={p} completed />
            ))}
          </Grid>
        </Section>

        {/* Archived — ALWAYS SHOWN */}
        <Section title="Archived Projects" emptyText="No archived projects.">
          <Grid>
            {archived.map((p) => (
              <Card key={p.proposalId} p={p} archived />
            ))}
          </Grid>
        </Section>
      </div>
    </div>
  );
}

/* ---------- UI bits ---------- */

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasChildren = React.Children.count(children) > 0;
  return (
    <section>
      <h2 className="text-xl font-bold mb-4">{title}</h2>
      {hasChildren ? (
        children
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500">
          {emptyText}
        </div>
      )}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5">{children}</div>;
}

function Card({
  p,
  completed,
  archived,
}: {
  p: Proposal;
  completed?: boolean;
  archived?: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
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
            <span className="text-slate-500">Budget: </span>
            <span className="font-semibold">${Number(p.amountUSD).toLocaleString()}</span>
          </div>
          <div className="mt-2">
            <StatusPill status={p.status} />
          </div>
        </div>
      </div>

      {completed && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          ✅ This project has been fully completed.
        </div>
      )}

      {archived && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-amber-50 p-4 text-sm text-amber-800">
          🗄️ This project is archived.
        </div>
      )}

      <div className="mt-5">
        <a
          href={`/projects/${p.proposalId}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800"
        >
          View Project Details →
        </a>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Proposal['status'] }) {
  const cls =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'completed'
      ? 'bg-blue-100 text-blue-800'
      : status === 'archived'
      ? 'bg-amber-100 text-amber-800'
      : status === 'rejected'
      ? 'bg-rose-100 text-rose-800'
      : 'bg-yellow-100 text-yellow-800';
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${cls}`}>
      {status[0].toUpperCase() + status.slice(1)}
    </span>
  );
}
