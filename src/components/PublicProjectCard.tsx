'use client';

import { useEffect, useMemo, useState } from 'react';
import AuditPanel from '@/components/AuditPanel';
import PublicGeoBadge from '@/components/PublicGeoBadge';

function usd(n: number) {
  try {
    return (n ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  } catch {
    return `$${Math.round(n ?? 0)}`;
  }
}

type Bid = {
  bidId: number;
  vendorName: string;
  priceUSD: number;
  days: number;
  status: string;
  milestones: Array<{ name: string; amount: number; dueDate?: string; completed?: boolean }>;
};

type Project = {
  proposalId: number;
  orgName: string;
  proposalTitle: string;
  summary?: string;
  coverImage?: string | null;
  images?: string[];
  bids?: Bid[];
  cid?: string | null;
};

type AuditSummary = {
  anchored: boolean;
  cid?: string | null;
  ipfsHref?: string | null;
  txHash?: string | null;
  periodId?: string | null;
  contract?: string | null;
  chainId?: number | null;
  anchoredAt?: string | null;
};

type AuditRow = {
  createdAt?: string | null;
  action?: string;
  actorRole?: string;
  actorAddress?: string;
  changedFields?: string[];
  ipfsCid?: string | null;
  milestoneIndex?: number;
  txHash?: string | null;
};

// ----- ENV (client-safe) -----
const EXPLORER_BASE = process.env.NEXT_PUBLIC_EXPLORER_BASE || ''; // e.g. https://basescan.org
const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  'https://sapphire-given-snake-741.mypinata.cloud/ipfs';

// ----- Helpers -----
function normalizeAudit(items: AuditRow[]) {
  return (Array.isArray(items) ? items : []).map((a: AuditRow, i: number) => {
    const change = String(a.action ?? 'update').toLowerCase().replace(/\s+/g, '_');
    const at = a.createdAt ?? undefined;
    const actor = a.actorRole || a.actorAddress || undefined;
    const ipfs = a.ipfsCid ? String(a.ipfsCid).replace(/^ipfs:\/\//, '') : undefined;
    return {
      id: i,
      at: at ? String(at) : new Date().toISOString(),
      actor,
      change,
      details:
        Array.isArray(a.changedFields) && a.changedFields.length
          ? `Changed: ${a.changedFields.join(', ')}`
          : undefined,
      ipfs: ipfs ? `${IPFS_GATEWAY}/${ipfs}` : undefined,
      milestoneIndex: Number.isFinite(a.milestoneIndex as number) ? Number(a.milestoneIndex) : undefined,
      txHash: a.txHash || undefined,
    };
  });
}

function milestoneNamesFromProject(project: Project): Record<number, string> {
  const awarded =
    (project?.bids || []).find((b: any) =>
      ['awarded', 'accepted', 'winner', 'approved'].includes(String(b?.status || '').toLowerCase())
    ) || (project?.bids || [])[0];
  const arr = Array.isArray(awarded?.milestones) ? awarded!.milestones : [];
  return Object.fromEntries(arr.map((m: any, i: number) => [i, m?.name || `Milestone ${i + 1}`]));
}

export default function PublicProjectCard({ project }: { project: Project }) {
  const [tab, setTab] = useState<'overview' | 'bids' | 'milestones' | 'files' | 'audit'>('overview');
  const [files, setFiles] = useState<any[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // audit state
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[] | null>(null);

  // featured bid
  const featuredBidId = useMemo(() => {
    const bids = project.bids || [];
    const approved = bids.find((b) => String(b.status).toLowerCase() === 'approved');
    return approved?.bidId ?? bids[0]?.bidId ?? null;
  }, [project.bids]);

  // progress
  const progress = useMemo(() => {
    const fb = (project.bids || []).find((b) => b.bidId === featuredBidId);
    const total = fb?.milestones?.length || 0;
    the:
    const done = (fb?.milestones || []).filter((m) => !!m.completed).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [project.bids, featuredBidId]);

  // all milestones list
  const allMilestones = useMemo(() => {
    const list: Array<{ fromBidId: number; vendor: string; m: any }> = [];
    for (const b of project.bids || []) {
      for (const m of b.milestones || []) {
        list.push({ fromBidId: b.bidId, vendor: b.vendorName, m });
      }
    }
    return list;
  }, [project.bids]);

  // load proofs/files for Files tab
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/proofs?proposalId=${encodeURIComponent(String(project.proposalId))}`,
          { cache: 'no-store' }
        );
        if (!r.ok) return;
        const j = await r.json().catch(() => []);
        if (!cancelled && Array.isArray(j)) setFiles(j);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [project.proposalId]);

  // Attach safe public geo to proofs (robust join: proofId OR (bidId,milestoneIndex))
  useEffect(() => {
    if (!files || files.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        // all bidIds present on this card (often just one)
        const bidIds = Array.from(new Set((project.bids || []).map(b => b.bidId).filter(Boolean)));
        if (bidIds.length === 0) return;

        const geoArrays = await Promise.all(
          bidIds.map(id =>
            fetch(`/api/public/geo/${encodeURIComponent(String(id))}`, { cache: 'no-store' })
              .then(r => (r.ok ? r.json() : []))
              .catch(() => [])
          )
        );

        // Index geos both by proofId and by (bidId,milestoneIndex)
        const byProofId = new Map<number, any>();
        const byBidMs   = new Map<string, any>(); // key = `${bidId}:${milestoneIndex}`

        geoArrays.flat().forEach((g: any) => {
          const pid = Number(g?.proofId ?? g?.proof_id);
          if (Number.isFinite(pid)) byProofId.set(pid, g);

          const b  = Number(g?.bidId ?? g?.bid_id);
          const mi = Number(g?.milestoneIndex ?? g?.milestone_index);
          if (Number.isFinite(b) && Number.isFinite(mi)) {
            byBidMs.set(`${b}:${mi}`, g);
          }
        });

        if (cancelled) return;

        // If we only have one bid on the page, use it for the (bidId,milestoneIndex) fallback
        const singleBidId = bidIds.length === 1 ? bidIds[0] : null;

        setFiles(prev =>
          prev.map((p: any) => {
            // try proofId first
            const pid = Number(p?.proofId ?? p?.proof_id ?? p?.id);
            let hit = Number.isFinite(pid) ? byProofId.get(pid) : null;

            // fallback: (bidId,milestoneIndex)
            if (!hit) {
              const b  = Number(p?.bidId ?? p?.bid_id ?? singleBidId);
              const mi = Number(p?.milestoneIndex ?? p?.milestone_index);
              if (Number.isFinite(b) && Number.isFinite(mi)) {
                hit = byBidMs.get(`${b}:${mi}`) || null;
              }
            }

            if (!hit) return p;
            return {
              ...p,
              location: hit.geoApprox ?? hit.geo_approx ?? null,
              takenAt:  hit.captureTime ?? hit.capture_time ?? p.takenAt ?? null,
            };
          })
        );
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [project.bids, files.length]);

  // debug join
  useEffect(() => {
    if (files.length) {
      try {
        console.table(
          files.map((f: any) => ({
            proofId: f.proofId ?? f.proof_id ?? f.id,
            hasLocation: !!f.location,
            label: f.location?.label ?? null,
          }))
        );
      } catch {}
    }
  }, [files]);

  // audit badge (summary)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/public/audit/${encodeURIComponent(String(project.proposalId))}`,
          { cache: 'no-store' }
        );
        if (!r.ok) return;
        const j = await r.json().catch(() => null);
        if (cancelled || !j) return;
        setAuditSummary(j.summary || { anchored: false });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [project.proposalId]);

  // audit tab rows (lazy)
  useEffect(() => {
    if (tab !== 'audit' || auditRows) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/public/audit/${encodeURIComponent(String(project.proposalId))}`,
          { cache: 'no-store' }
        );
        if (!r.ok) return;
        const j = await r.json().catch(() => null);
        if (cancelled || !j) return;
        setAuditRows(Array.isArray(j.events) ? j.events : []);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, project.proposalId, auditRows]);

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'bids' as const, label: `Bids (${project.bids?.length || 0})` },
    { key: 'milestones' as const, label: 'Milestones' },
    { key: 'files' as const, label: `Files (${files.length})` },
    { key: 'audit' as const, label: 'Audit' },
  ];

  // anchored badge
  const cid = (auditSummary?.cid ?? project.cid ?? null) as string | null;
  const anchored = Boolean(cid || auditSummary?.anchored || auditSummary?.txHash || auditSummary?.anchoredAt);
  const ipfsHref = cid ? `${IPFS_GATEWAY}/${String(cid).replace(/^ipfs:\/\//, '')}` : undefined;
  const explorerHref =
    auditSummary?.txHash && EXPLORER_BASE ? `${EXPLORER_BASE}/tx/${auditSummary.txHash}` : undefined;
  const anchorHref = ipfsHref || explorerHref;

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
      {/* cover with lightbox */}
      <button
        type="button"
        className="relative aspect-[16/9] bg-gray-50 w-full"
        onClick={() => project.coverImage && setLightboxUrl(project.coverImage!)}
      >
        {project.coverImage ? (
          <img
            src={project.coverImage}
            alt={project.proposalTitle || 'cover'}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400 text-sm">No image</div>
        )}
      </button>

      <div className="p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{project.orgName}</div>

        {/* title + audit badge */}
        <h2 className="text-lg font-semibold flex items-center gap-2">
          {project.proposalTitle || 'Untitled Project'}
          {auditSummary ? (
            anchored ? (
              anchorHref ? (
                <a
                  href={anchorHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:underline"
                  title={ipfsHref ? 'View IPFS snapshot' : 'View anchor transaction'}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 mr-1">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Anchored
                </a>
              ) : (
                <span
                  className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                  title="Anchored"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 mr-1">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Anchored
                </span>
              )
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                Not anchored yet
              </span>
            )
          ) : null}
        </h2>

        {project.summary && <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{project.summary}</p>}

        {/* Milestone progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Milestone progress</span>
            <span>
              {progress.done}/{progress.total} completed
            </span>
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-black transition-[width] duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress.pct))}%` }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 border-b border-gray-200">
          <nav className="-mb-px flex gap-5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  'pb-2 text-sm outline-none ' +
                  (tab === t.key ? 'border-b-2 border-black font-medium' : 'text-gray-500 hover:text-gray-800')
                }
                type="button"
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab contents */}
        <div className="mt-4 space-y-4">
          {tab === 'overview' && (
            <>
              {Array.isArray(project.images) && project.images.length > 1 && (
                <>
                  <div className="text-sm font-medium text-gray-700">More images</div>
                  <div className="grid grid-cols-2 gap-3">
                    {project.images.slice(1, 7).map((u, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightboxUrl(u)}
                        className="block"
                        title="Click to zoom"
                      >
                        <img
                          src={u}
                          alt={`image ${i + 1}`}
                          className="w-full aspect-video object-cover rounded-lg border"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'bids' && (
            <>
              {(!project.bids || project.bids.length === 0) && (
                <div className="text-sm text-gray-500">No public bids yet.</div>
              )}
              {project.bids?.map((b) => {
                const isFeatured = b.bidId === featuredBidId;
                const isApproved = String(b.status).toLowerCase() === 'approved';
                return (
                  <div key={b.bidId} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{b.vendorName || 'Vendor'}</div>
                        {isFeatured && isApproved && (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            approved
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-700">{usd(b.priceUSD)}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {b.days ? `${b.days} days` : null} {b.status ? `• ${b.status}` : null}
                    </div>
                    {b.milestones?.length ? (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-gray-700 mb-1">Milestones</div>
                        <ol className="space-y-1">
                          {b.milestones.map((m, i) => (
                            <li key={i} className="text-xs text-gray-700">
                              <span className="font-medium">{m.name || `Milestone ${i + 1}`}</span>
                              {typeof m.amount === 'number' && <> — {usd(m.amount)}</>}
                              {m.dueDate && <> • due {new Date(m.dueDate).toLocaleDateString()}</>}
                              {m.completed && <> • completed</>}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </>
          )}

          {tab === 'milestones' && (
            <>
              {allMilestones.length === 0 && <div className="text-sm text-gray-500">No public milestones yet.</div>}
              {allMilestones.map(({ fromBidId, vendor, m }, i) => (
                <div key={i} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {m.name || `Milestone`} <span className="text-gray-400">• bid #{fromBidId}</span>
                    </div>
                    <div className="text-gray-700">{typeof m.amount === 'number' ? usd(m.amount) : ''}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {vendor ? `${vendor} • ` : ''}
                    {m.dueDate ? `due ${new Date(m.dueDate).toLocaleDateString()}` : ''}
                    {m.completed ? ' • completed' : ''}
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'files' && (
            <>
              {files.length === 0 && <div className="text-sm text-gray-500">No public milestones/proofs yet.</div>}

              {files.length > 0 && (
                <div className="space-y-3">
                  {files.map((p, idx) => {
                    // build a Google Maps link if we have coordinates
                    const lat = p?.location?.approx?.lat;
                    const lon = p?.location?.approx?.lon;
                    const mapHref =
                      lat != null && lon != null ? `https://maps.google.com/?q=${lat},${lon}` : null;

                    return (
                      <div key={p.proofId || idx} className="rounded-lg border p-3">
                        <div className="text-sm font-medium">
                          Milestone {Number(p.milestoneIndex) + 1}: {p.title || 'Submission'}
                        </div>

                        {/* plain text label above grid, clickable if we have coords */}
                        {p.location?.label && (
                          <div className="mt-1 text-xs text-gray-600">
                            📍 {mapHref ? (
                              <a
                                href={mapHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-2 hover:no-underline"
                              >
                                {p.location.label}
                              </a>
                            ) : (
                              p.location.label
                            )}
                          </div>
                        )}

                        {(p?.location || p?.takenAt) && (
                          <div className="mt-1">
                            <PublicGeoBadge geo={p.location} takenAt={p.takenAt} />
                          </div>
                        )}

                        {p.publicText && (
                          <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{p.publicText}</p>
                        )}

                        {Array.isArray(p.files) && p.files.length > 0 && (
                          <div className="mt-2 grid grid-cols-2 gap-3">
                            {p.files.map((f: any, i: number) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setLightboxUrl(String(f.url || ''))}
                                className="relative block rounded-lg border overflow-hidden"
                                title="Click to zoom"
                              >
                                {/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(String(f.url || '')) ? (
                                  <img
                                    src={f.url}
                                    alt={f.name || `file ${i + 1}`}
                                    className="w-full aspect-video object-cover"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="h-24 flex items-center justify-center text-xs text-gray-500">
                                    {f.name || 'file'}
                                  </div>
                                )}

                                {/* tiny overlay label on the thumbnail; clickable if we have coords */}
                                {p.location?.label && (
                                  mapHref ? (
                                    <a
                                      href={mapHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="absolute left-1.5 bottom-1.5 rounded bg-black/60 text-[10px] leading-tight text-white px-1.5 py-0.5 hover:bg-black/70"
                                    >
                                      {p.location.label}
                                    </a>
                                  ) : (
                                    <span className="absolute left-1.5 bottom-1.5 rounded bg-black/60 text-[10px] leading-tight text-white px-1.5 py-0.5">
                                      {p.location.label}
                                    </span>
                                  )
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'audit' && (
            <section className="space-y-3 text-sm">
              {!auditRows && <div className="text-gray-500">Loading audit…</div>}
              {auditRows && auditRows.length === 0 && <div className="text-gray-500">No public audit events yet.</div>}
              {auditRows && auditRows.length > 0 && (
                <AuditPanel
                  events={normalizeAudit(auditRows)}
                  milestoneNames={milestoneNamesFromProject(project)}
                  initialDays={3}
                />
              )}
            </section>
          )}
        </div>
      </div>

      {/* Lightbox modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={lightboxUrl}
            alt="Zoomed image"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium shadow"
            onClick={() => setLightboxUrl(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
