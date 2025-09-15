'use client';

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { getProposals, type Proposal } from "@/lib/api";

export default function ProjectsClient() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const rows = await getProposals();
        setProposals(rows);
      } catch (e: any) {
        setErr(e?.message || "Failed to load projects");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="max-w-5xl mx-auto p-6">Loading projects…</div>;
  if (err) return <div className="max-w-5xl mx-auto p-6 text-rose-600">Error: {err}</div>;

  // tweak if you want pending also shown under Active:
  const active = proposals.filter(p => p.status === "approved");
  const completed = proposals.filter(p => p.status === "completed");
  const archived = proposals.filter(p => p.status === "archived");

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Projects</h1>

        <Section title="Active Projects" emptyText="There are no active projects at the moment.">
          {active.map(p => (
            <ProjectCard key={p.proposalId} p={p} cta="View Project Details →" />
          ))}
        </Section>

        <Section title="Completed Projects" emptyText="No completed projects yet.">
          {completed.map(p => (
            <ProjectCard key={p.proposalId} p={p} badge="Completed" tone="blue" cta="View Project Details →" />
          ))}
        </Section>

        <Section title="Archived Projects" emptyText="No archived projects.">
          {archived.map(p => (
            <ProjectCard key={p.proposalId} p={p} badge="Archived" tone="slate" muted cta="View (read-only) →" />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const isEmpty = React.Children.count(children) === 0;
  return (
    <section className="mb-10">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      {isEmpty ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="grid gap-4">{children}</div>
      )}
    </section>
  );
}

function ProjectCard({
  p,
  badge,
  tone = "emerald",
  cta = "View Project Details →",
  muted = false,
}: {
  p: Proposal;
  badge?: string;
  tone?: "emerald" | "blue" | "slate";
  cta?: string;
  muted?: boolean;
}) {
  const toneBg =
    tone === "emerald" ? "bg-emerald-100 text-emerald-800" :
    tone === "blue" ? "bg-blue-100 text-blue-800" :
    "bg-slate-200 text-slate-700";

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-6 ${muted ? "opacity-80" : ""}`}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
          <div className="mt-1 text-sm text-slate-600">
            <span className="font-medium">{p.orgName}</span>
            {(p.city || p.country) && (
              <span> · {[p.city, p.country].filter(Boolean).join(", ")}</span>
            )}
          </div>
          <p className="mt-3 text-sm text-slate-700">{p.summary}</p>
        </div>
        <div className="text-right">
          {badge ? (
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${toneBg}`}>
              {badge}
            </span>
          ) : null}
          <div className="mt-2 text-sm">
            <span className="text-slate-500">Budget: </span>
            <span className="font-semibold">${Number(p.amountUSD).toLocaleString()}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Submitted: {new Date(p.createdAt).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Link
          href={`/projects/${p.proposalId}`}
          className={`inline-flex items-center gap-1 text-sm ${muted ? "text-slate-500 hover:text-slate-700" : "text-blue-700 hover:text-blue-900"}`}
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}
