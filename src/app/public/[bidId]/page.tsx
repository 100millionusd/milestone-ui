'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getPublicProject } from '@/lib/api';
import AuditPanel from '@/components/AuditPanel';

function usd(n: number) {
  try {
    return (n ?? 0).toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  } catch {
    return `$${Math.round(n ?? 0)}`;
  }
}

// --- helpers that call your Next API (client-side)
async function fetchProofsClient(proposalId: number) {
  try {
    const r = await fetch(`/api/proofs?proposalId=${encodeURIComponent(String(proposalId))}&ts=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    if (!r.ok) return [];
    const list = await r.json().catch(() => []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function fetchAuditClient(proposalId: number) {
  try {
    const r = await fetch(`/api/public/audit/${encodeURIComponent(String(proposalId))}?ts=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    if (!r.ok) return [];
    const data = await r.json().catch(() => []);
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as any).events)
      ? (data as any).events
      : Array.isArray((data as any).rows)
      ? (data as any).rows
      : [];
    return list;
  } catch {
    return [];
  }
}

function normalizeAudit(items: any[]) {
  return (Array.isArray(items) ? items : [])
    .map((a: any, i: number) => {
      const change = String(a.change_key ?? a.changed ?? a.change ?? 'update').toLowerCase();
      const at = a.createdAt ?? a.timestamp ?? a.at ?? a.time ?? a.date;
      const actor = a.actor ?? a.user ?? a.wallet ?? a.address ?? a.by;
      const milestoneIndex =
        Number.isFinite(a.milestoneIndex) ? Number(a.milestoneIndex)
        : Number.isFinite(a.milestone_index) ? Number(a.milestone_index)
        : Number.isFinite(a.msIndex) ? Number(a.msIndex)
        : undefined;
      const txHash = a.txHash ?? a.payment_tx_hash ?? a.hash;
      const ipfs = a.ipfs_url ?? a.ipfsUrl ?? a.ipfs;

      return {
        id: a.id ?? `${change}-${i}`,
        at: at ? String(at) : undefined,
        actor: actor ? String(actor) : undefined,
        change,
        details: a.details ?? a.description ?? (a.changed ? `Changed: ${a.changed}` : undefined),
        ipfs,
        milestoneIndex,
        txHash,
      };
    })
    .filter((e) => !!e.at);
}

export default function PublicProjectDetailClient() {
  const { bidId: bidIdParam } = useParams<{ bidId: string }>();
  const bidId = Number(bidIdParam);
  const sp = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [project, setProject] = useState<any | null>(null);
  const [proofs, setProofs] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  async function load() {
    if (!Number.isFinite(bidId)) {
      setErr('Invalid project id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const p = await getPublicProject(bidId);
      setProject(p || null);

      if (p) {
        const proposalIdNum = Number(p.proposalId ?? 0);
        const [proofRows, auditRows] = await Promise.all([
          proposalIdNum ? fetchProofsClient(proposalIdNum) : Promise.resolve([]),
          proposalIdNum ? fetchAuditClient(proposalIdNum) : Promise.resolve([]),
        ]);
        setProofs(proofRows);
        const rawAudit = Array.isArray(auditRows) && auditRows.length ? auditRows : (p as any).audit || [];
        setEvents(normalizeAudit(rawAudit));
      } else {
        setProofs([]);
        setEvents([]);
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bidId]);

  const tab = (sp.get('tab') || 'overview').toString();

  const tabs = useMemo(() => {
    const bidsLen = project?.bids?.length || 0;
    return [
      { key: 'overview', label: 'Overview' },
      { key: 'bids', label: `Bids (${bidsLen})` },
      { key: 'milestones', label: 'Milestones' },
      { key: 'files', label: `Files (${proofs.length})` },
      { key: 'audit', label: `Audit (${events.length})` },
    ] as const;
  }, [project, proofs.length, events.length]);

  const allMilestones = useMemo(() => {
    if (!project?.bids) return [] as Array<{ fromBidId: number; vendor: string; m: any }>;
    return project.bids
      .slice()
      .reverse()
      .flatMap((b: any) =>
        (b.milestones || []).map((m: any) => ({
          fromBidId: Number(b.bidId),
          vendor: b.vendorName || '',
          m,
        })),
      );
  }, [project]);

  const milestoneNames = useMemo(() => {
    const awarded =
      project?.bids?.find((b: any) =>
        ['awarded', 'accepted', 'winner'].includes(String(b?.status || '').toLowerCase()),
      ) || project?.bids?.[0];

    const entries =
      ((awarded?.milestones as any[]) || []).map((m: any, i: number) => [i, m?.name || `Milestone ${i + 1}`]) ||
      [];
    return Object.fromEntries(entries as Array<[number, string]>);
  }, [project]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/public" className="text-sm text-blue-600 hover:underline">
        ← Back to Projects
      </Link>

      {loading && <div className="mt-6 text-gray-600">Loading…</div>}

      {!loading && err && (
        <div className="mt-6">
          <h1 className="text-2xl font-semibold">Public Project</h1>
          <p className="mt-2 text-red-600">{err}</p>
          <button onClick={load} className="mt-4 px-3 py-1.5 rounded bg-slate-900 text-white text-sm">
            Retry
          </button>
        </div>
      )}

      {!loading && !err && !project && (
        <div className="mt-6">
          <h1 className="text-2xl font-semibold">Public Project</h1>
          <p className="mt-2 text-gray-500">This project was not found.</p>
        </div>
      )}

      {!loading && !err && project && (
        <>
          {/* header */}
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">{project.orgName}</div>
            <h1 className="text-3xl font-bold">{project.proposalTitle || 'Public Project'}</h1>
          </div>

          {/* cover */}
          <div className="mt-4 rounded-2xl overflow-hidden bg-gray-50">
            {project.coverImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.coverImage}
                alt={project.proposalTitle || 'cover'}
                className="w-full h-auto object-cover"
              />
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400">No image</div>
            )}
          </div>

          {/* tabs */}
          <div className="mt-6 border-b border-gray-200">
            <nav className="-mb-px flex gap-6">
              {tabs.map((t) => {
                const active = tab === t.key;
                const href = `?tab=${t.key}`;
                return (
                  <Link
                    key={t.key}
                    href={href}
                    className={
                      'pb-3 text-sm ' +
                      (active ? 'border-b-2 border-black font-medium' : 'text-gray-500 hover:text-gray-800')
                    }
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* tab content */}
          <div className="mt-6">
            {tab === 'overview' && (
              <section className="space-y-4">
                {project.summary && (
                  <div>
                    <h2 className="text-lg font-semibold mb-2">Project Description</h2>
                    <p className="whitespace-pre-wrap text-gray-700">{project.summary}</p>
                  </div>
                )}

                {Array.isArray(project.images) && project.images.length > 1 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">More images</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {project.images.slice(1, 10).map((u: string, i: number) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={u}
                          alt={`image ${i + 1}`}
                          className="w-full aspect-video object-cover rounded-lg border"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {tab === 'bids' && (
              <section className="space-y-4">
                {(project.bids || []).length === 0 && <p className="text-gray-500">No public bids visible.</p>}
                {Array.isArray(project.bids) &&
                  project.bids.map((b: any) => (
                    <div key={b.bidId} className="rounded-xl border p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="font-medium">{b.vendorName || 'Vendor'}</div>
                        <div className="text-sm text-gray-700">{usd(b.priceUSD)}</div>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {b.days ? `${b.days} days` : null} {b.status ? `• ${b.status}` : null}
                      </div>

                      {Array.isArray(b.milestones) && b.milestones.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-medium text-gray-700 mb-1">Milestones</div>
                          <ol className="space-y-1">
                            {b.milestones.map((m: any, idx: number) => (
                              <li key={idx} className="text-xs text-gray-700">
                                <span className="font-medium">{m.name || `Milestone ${idx + 1}`}</span>
                                {typeof m.amount === 'number' && <> — {usd(m.amount)}</>}
                                {m.dueDate && <> • due {new Date(m.dueDate).toLocaleDateString()}</>}
                                {m.completed && <> • completed</>}
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  ))}
              </section>
            )}

            {tab === 'milestones' && (
              <section className="space-y-3">
                {allMilestones.length === 0 && <p className="text-gray-500">No public milestones yet.</p>}
                {allMilestones.map(({ fromBidId, vendor, m }, i) => (
                  <div key={i} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">
                        {m.name || `Milestone`} <span className="text-gray-400">• bid #{fromBidId}</span>
                      </div>
                      <div className="text-gray-700">
                        {typeof m.amount === 'number' ? usd(m.amount) : ''}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {vendor ? `${vendor} • ` : ''}
                      {m.dueDate ? `due ${new Date(m.dueDate).toLocaleDateString()}` : ''}
                      {m.completed ? ' • completed' : ''}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {tab === 'files' && (
              <section className="space-y-4">
                {(!proofs || proofs.length === 0) && (
                  <p className="text-gray-500">No public milestones/proofs yet.</p>
                )}
                {Array.isArray(proofs) &&
                  proofs.map((p: any) => (
                    <div key={p.proofId || `${p.milestoneIndex}-p`} className="rounded-lg border p-4">
                      <div className="text-sm font-medium">
                        Milestone {Number(p.milestoneIndex) + 1}: {p.title || 'Submission'}
                      </div>
                      {p.publicText && (
                        <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{p.publicText}</p>
                      )}
                      {Array.isArray(p.files) && p.files.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {p.files.map((f: any, idx: number) => (
                            <a
                              key={idx}
                              href={f.url}
                              target="_blank"
                              className="block rounded-lg border overflow-hidden"
                              rel="noreferrer"
                            >
                              {/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(String(f.url || '')) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={f.url}
                                  alt={f.name || `file ${idx + 1}`}
                                  className="w-full aspect-video object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="h-24 flex items-center justify-center text-xs text-gray-500">
                                  {f.name || 'file'}
                                </div>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-500">
                        {p.submittedAt ? `Submitted ${new Date(p.submittedAt).toLocaleString()}` : ''}
                      </div>
                    </div>
                  ))}
              </section>
            )}

            {tab === 'audit' && (
              <section>
                <AuditPanel events={events} milestoneNames={milestoneNames} initialDays={3} />
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}