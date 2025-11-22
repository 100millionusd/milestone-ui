'use client';

import { useEffect, useMemo, useState } from 'react';
import AuditPanel from '@/components/AuditPanel';
import Image from 'next/image';

function usd(n: number) {
  try {
    return (n ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  } catch {
    return `$${Math.round(n ?? 0)}`;
  }
}

// 👇 UPDATED: Just return the URL as-is. 
// Since we use unoptimized={true} below, the standard link will work fine!
function toFastLink(url?: string | null) {
  return url || '';
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
const EXPLORER_BASE = process.env.NEXT_PUBLIC_EXPLORER_BASE || '';
const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  'https://sapphire-given-snake-741.mypinata.cloud/ipfs';

// --- maps + taken-at helpers ---
function mapsLink(
  lat?: number | null,
  lon?: number | null,
  label?: string | null
): string | null {
  if (!Number.isFinite(lat as number) || !Number.isFinite(lon as number)) return null;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isIOS = /iPad|iPhone|iPod/i.test(ua);
  const qLabel = label ? encodeURIComponent(label) : `${lat},${lon}`;
  return isIOS
    ? `https://maps.apple.com/?ll=${lat},${lon}&q=${qLabel}&z=16`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function fmtTakenAt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// ---- Proof status helper ----
function getProofStatus(p: any): 'approved' | 'rejected' | 'changes_requested' | 'submitted' | string {
  const s = String(p?.status ?? p?.proof_status ?? '').toLowerCase();
  if (s.includes('approve')) return 'approved';
  if (s.includes('reject')) return 'rejected';
  if (s.includes('change')) return 'changes_requested';
  return s || 'submitted';
}

// Per-file GPS detector
function fileCoords(f: any): { lat: number; lon: number; label?: string | null } | null {
  const loc = f?.location ?? f?.geoApprox ?? f?.geo_approx ?? null;

  const lat =
    loc?.approx?.lat ??
    loc?.lat ??
    f?.exif?.gpsLatitude ??
    f?.gps?.lat ??
    f?.latitude ??
    f?.lat ??
    null;

  const lon =
    loc?.approx?.lon ??
    loc?.lon ??
    f?.exif?.gpsLongitude ??
    f?.gps?.lon ??
    f?.longitude ??
    f?.lng ??
    f?.lon ??
    null;

  if (lat == null || lon == null) return null;
  return { lat: Number(lat), lon: Number(lon), label: loc?.label || null };
}

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
  const [approvedOnly, setApprovedOnly] = useState(false); // default to "All" so content shows

  // client-side GPS cache (EXIF fallback)
  const [gpsByUrl, setGpsByUrl] = useState<Record<string, { lat: number; lon: number }>>({});

  useEffect(() => {
    // collect ALL image URLs from all proofs/files
    const urls: string[] = [];
    for (const pr of files || []) {
      const fileList = Array.isArray(pr?.files) ? pr.files : [];
      for (const f of fileList) {
        const u = String(f?.url || '');
        if (!u) continue;
        if (!/\.(jpe?g|tiff?|png|webp|gif|heic|heif)(\?|#|$)/i.test(u)) continue;
        urls.push(u);
      }
    }

    // only targets we haven't resolved yet (use current snapshot of gpsByUrl)
    const unique = Array.from(new Set(urls)).filter((u) => !gpsByUrl[u]);
    if (unique.length === 0) return;

    let cancelled = false;

    (async () => {
      const exifr = (await import('exifr')).default as any;

      const MAX_RANGE_BYTES = 524_287; // ~512 KB
      const CONCURRENCY = 4;

      async function fetchGpsViaRange(url: string) {
        try {
          const r = await fetch(url, { headers: { Range: `bytes=0-${MAX_RANGE_BYTES}` } });
          if (!r.ok) return null;
          const cl = Number(r.headers.get('content-length') || '0');
          if (r.status === 200 && cl > MAX_RANGE_BYTES) return null;
          const buf = await r.arrayBuffer();
          const g = await exifr.gps(buf).catch(() => null);
          if (g?.latitude != null && g?.longitude != null) {
            return { lat: Number(g.latitude), lon: Number(g.longitude) };
          }
          return null;
        } catch {
          return null;
        }
      }

      const queue = [...unique];
      const found: Record<string, { lat: number; lon: number }> = {};

      async function worker() {
        while (!cancelled && queue.length) {
          const url = queue.shift()!;
          const gps = await fetchGpsViaRange(url);
          if (cancelled) break;
          if (gps) found[url] = gps; // don't set state here — batch at the end
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
      if (cancelled) return;

      const hasNew = Object.keys(found).length > 0;
      if (hasNew) {
        setGpsByUrl((m) => {
          // respect any entries that may have been added concurrently
          const next = { ...m };
          for (const [u, gps] of Object.entries(found)) {
            if (!next[u]) next[u] = gps;
          }
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // 🔑 only re-run when the FILE LIST changes; do NOT depend on gpsByUrl
  }, [files]);

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

  // Attach safe public geo to proofs
  useEffect(() => {
    if (!files || files.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const bidIds = Array.from(new Set((project.bids || []).map((b) => b.bidId).filter(Boolean)));
        if (bidIds.length === 0) return;

        const geoArrays = await Promise.all(
          bidIds.map((id) =>
            fetch(`/api/public/geo/${encodeURIComponent(String(id))}`, { cache: 'no-store' })
              .then((r) => (r.ok ? r.json() : []))
              .catch(() => [])
          )
        );

        const byProofId = new Map<number, any>();
        const byBidMs = new Map<string, any>();
        geoArrays.flat().forEach((g: any) => {
          const pid = Number(g?.proofId ?? g?.proof_id);
          if (Number.isFinite(pid)) byProofId.set(pid, g);
          const b = Number(g?.bidId ?? g?.bid_id);
          const mi = Number(g?.milestoneIndex ?? g?.milestone_index);
          if (Number.isFinite(b) && Number.isFinite(mi)) byBidMs.set(`${b}:${mi}`, g);
        });

        if (cancelled) return;

        const singleBidId = bidIds.length === 1 ? bidIds[0] : null;

        setFiles((prev) => {
          const next = prev.map((p: any) => {
            const pid = Number(p?.proofId ?? p?.proof_id ?? p?.id);
            let hit = Number.isFinite(pid) ? byProofId.get(pid) : null;
            if (!hit) {
              const b = Number(p?.bidId ?? p?.bid_id ?? singleBidId);
              const mi = Number(p?.milestoneIndex ?? p?.milestone_index);
              if (Number.isFinite(b) && Number.isFinite(mi)) hit = byBidMs.get(`${b}:${mi}`) || null;
            }
            if (!hit) return p;
            const loc = hit.geoApprox ?? hit.geo_approx ?? null;
            const taken = hit.captureTime ?? hit.capture_time ?? p.takenAt ?? null;
            if (p.location === loc && p.takenAt === taken) return p; // idempotent
            return {
              ...p,
              location: loc,
              takenAt: taken,
            };
          });
          const changed = next.some((p, i) => p !== prev[i]);
          return changed ? next : prev;
        });
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [project.bids, files.length]);

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

  const cid = (auditSummary?.cid ?? project.cid ?? null) as string | null;
  const anchored = Boolean(cid || auditSummary?.anchored || auditSummary?.txHash || auditSummary?.anchoredAt);
  const ipfsHref = cid ? `${IPFS_GATEWAY}/${String(cid).replace(/^ipfs:\/\//, '')}` : undefined;
  const explorerHref =
    auditSummary?.txHash && EXPLORER_BASE ? `${EXPLORER_BASE}/tx/${auditSummary.txHash}` : undefined;
  const anchorHref = ipfsHref || explorerHref;

  // ---------- FILES TAB RENDERER ----------
  function renderFilesTab() {
    const uiStatus = (p: any) => {
      const s = getProofStatus(p);
      if (
        s === 'submitted' &&
        !(p?.status || p?.proof_status || p?.proofStatus) &&
        (p?.approved === true || p?.approvedAt || p?.approved_at || true) // ← restore this guard
      ) {
        return 'approved';
      }
      if (p?.approved === true || p?.approvedAt || p?.approved_at) return 'approved';
      return s;
    };

    const proofsToShow = approvedOnly ? files.filter((p) => uiStatus(p) === 'approved') : files;

    const approvedCount = files.filter((p) => uiStatus(p) === 'approved').length;
    const totalCount = files.length;

    return (
      <>
        {/* Always show the toggle */}
        <div className="mb-3 flex items-center gap-2 text-xs text-gray-600">
          <span className="mr-1">Show:</span>
          <button
            type="button"
            aria-pressed={approvedOnly}
            onClick={() => setApprovedOnly(true)}
            className={
              'rounded-full px-2 py-0.5 border ' +
              (approvedOnly ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300')
            }
          >
            Approved only{typeof approvedCount === 'number' ? ` (${approvedCount})` : ''}
          </button>
          <button
            type="button"
            aria-pressed={!approvedOnly}
            onClick={() => setApprovedOnly(false)}
            className={
              'rounded-full px-2 py-0.5 border ' +
              (!approvedOnly ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300')
            }
          >
            All{typeof totalCount === 'number' ? ` (${totalCount})` : ''}
          </button>
        </div>

        {/* Empty state OR grid */}
        {proofsToShow.length === 0 ? (
          <div className="text-sm text-gray-500">
            {approvedOnly ? (
              <>
                No approved proofs yet.{` `}
                <button
                  type="button"
                  onClick={() => setApprovedOnly(false)}
                  className="underline underline-offset-2 ml-1"
                >
                  Show all
                </button>
              </>
            ) : (
              'No public milestones/proofs yet.'
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {proofsToShow.map((p, idx) => {
              const rawPts = Array.isArray(p?.files)
                ? (p.files.map((f: any) => fileCoords(f)).filter(Boolean) as Array<{
                    lat: number;
                    lon: number;
                    label?: string | null;
                  }>)
                : [];

              if (rawPts.length === 0 && p?.location?.approx?.lat != null && p?.location?.approx?.lon != null) {
                rawPts.push({
                  lat: Number(p.location.approx.lat),
                  lon: Number(p.location.approx.lon),
                  label: p.location.label || null,
                });
              }

              const seen = new Set<string>();
              const points = rawPts.filter((pt) => {
                const key = `${pt.lat.toFixed(4)},${pt.lon.toFixed(4)}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });

              const st = uiStatus(p);
              const badgeCls =
                st === 'approved'
                  ? 'bg-emerald-100 text-emerald-700'
                  : st === 'rejected'
                  ? 'bg-rose-100 text-rose-700'
                  : st === 'changes_requested'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600';

              return (
                <div key={p.proofId || idx} className="rounded-lg border p-3">
                  <div className="text-sm font-medium flex items-center justify-between">
                    <div>
                      Milestone {Number(p.milestoneIndex) + 1}: {p.title || 'Submission'}
                    </div>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeCls}`}>
                      {st.replace('_', ' ')}
                    </span>
                  </div>

                  {points.length > 0 && (
                    <div className="mt-1 text-xs text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {points.map((pt, i) => {
                        const lbl = pt.label || `${pt.lat.toFixed(5)}, ${pt.lon.toFixed(5)}`;
                        const href = mapsLink(pt.lat, pt.lon, lbl);
                        return (
                          <a
                            key={i}
                            href={href || '#'}
                            target={href ? '_blank' : undefined}
                            rel={href ? 'noreferrer' : undefined}
                            className={
                              'underline decoration-dotted underline-offset-2 hover:decoration-solid ' +
                              (href ? '' : 'pointer-events-none')
                            }
                            title="Open in map"
                          >
                            📍 {lbl}
                          </a>
                        );
                      })}
                      {p.takenAt && <span className="text-gray-400">• Taken {fmtTakenAt(p.takenAt)}</span>}
                    </div>
                  )}

                  {p.publicText && <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{p.publicText}</p>}

                  {Array.isArray(p.files) && p.files.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {p.files.map((f: any, i: number) => {
                        let gps = fileCoords(f);

                        if (!gps) {
                          const hit = gpsByUrl[String(f?.url || '')];
                          if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) {
                            gps = { lat: hit.lat, lon: hit.lon, label: `${hit.lat.toFixed(4)}, ${hit.lon.toFixed(4)}` };
                          }
                        }

                        const hasGPS = !!gps;
                        const label = hasGPS ? (gps!.label || `${gps!.lat.toFixed(4)}, ${gps!.lon.toFixed(4)}`) : null;
                        const hoverTitle = hasGPS ? `GPS: ${label}` : 'Click to zoom';
                        const isImg = /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(String(f.url || ''));

                        return (
                          <div
                            key={i}
                            role="button"
                            tabIndex={0}
                            onClick={() => setLightboxUrl(String(f.url || ''))}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLightboxUrl(String(f.url || ''))}
                            className={
                              'relative rounded-lg border overflow-hidden cursor-zoom-in ' +
                              (hasGPS ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-white' : '')
                            }
                            title={hoverTitle}
                          >
                            {isImg ? (
                              <div className="relative w-full aspect-video">
                                <Image
                                  src={toFastLink(String(f.url))} // 🚀 UPDATED: Uses URL as-is
                                  alt={f.name || `file ${i + 1}`}
                                  fill
                                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 33vw"
                                  style={{ objectFit: 'cover' }}
                                  unoptimized={true}
                                />
                              </div>
                            ) : (
                              <div className="h-24 flex items-center justify-center text-xs text-gray-500">
                                {f.name || 'file'}
                              </div>
                            )}

                            {hasGPS && label ? (
                              <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-md bg-black/70 text-[11px] font-medium text-white px-2 py-1 backdrop-blur max-w-[90%] truncate">
                                📍 {label}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  // ---------- RENDER ----------
  return (
    <>
      <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
        {/* cover with lightbox */}
        <button
          type="button"
          className="relative aspect-[16/9] bg-gray-50 w-full"
          onClick={() => project.coverImage && setLightboxUrl(project.coverImage!)}
        >
          {project.coverImage ? (
            <Image
              src={toFastLink(project.coverImage)} // 🚀 UPDATED: Uses URL as-is
              alt={project.proposalTitle || 'cover'}
              fill
              sizes="(max-width: 768px) 100vw, 33vw"
              style={{ objectFit: 'cover' }}
              priority
              unoptimized={true}
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

          {/* TOP scrollable description */}
          {project.summary && (
            <div
              className="mt-2 max-h-96 md:max-h-[28rem] overflow-y-auto pr-2 rounded-lg border border-gray-200/70 bg-white"
              tabIndex={0}
              aria-label="Project description (scrollable)"
            >
              <div className="p-3">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{project.summary}</p>
              </div>
            </div>
          )}

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

          {/* tab content */}
          <div className="mt-6">
            {tab === 'overview' && (
              <>
                {Array.isArray(project.images) && project.images.length > 1 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">More images</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {project.images.slice(1, 10).map((u: string, i: number) => (
                        <div
                          key={i}
                          className="relative w-full aspect-video rounded-lg border overflow-hidden cursor-zoom-in"
                          onClick={() => setLightboxUrl(u)}
                          title="Click to zoom"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setLightboxUrl(u)}
                        >
                          <Image
                            src={toFastLink(u)} // 🚀 UPDATED: Uses URL as-is
                            alt={`image ${i + 1}`}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 33vw"
                            style={{ objectFit: 'cover' }}
                            unoptimized={true}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
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
                        <div className="mt-2 text-xs text-gray-600">
                          {b.milestones.length} milestones • {b.milestones.filter((m) => m.completed).length}/{b.milestones.length} completed
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </>
            )}

            {tab === 'milestones' && (
              <>
                {allMilestones.length === 0 && (
                  <div className="text-sm text-gray-500">No public milestones yet.</div>
                )}
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
              </>
            )}

            {/* FILES TAB */}
            {tab === 'files' && renderFilesTab()}

            {tab === 'audit' && (
              <section className="space-y-3 text-sm">
                {!auditRows && <div className="text-gray-500">Loading audit…</div>}
                {auditRows && auditRows.length === 0 && (
                  <div className="text-gray-500">No public audit events yet.</div>
                )}
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
      </div>

      {/* Lightbox modal (sibling of the card root) */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative rounded-lg shadow-2xl bg-black/20"
            style={{ width: 'min(90vw, 1200px)', height: 'min(90vh, 800px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={toFastLink(lightboxUrl)} // 🚀 UPDATED: Uses URL as-is
              alt="Zoomed image"
              fill
              sizes="100vw"
              style={{ objectFit: 'contain' }}
              priority
              unoptimized={true}
            />
          </div>
          <button
            type="button"
            className="absolute top-4 right-4 rounded-full bg-white/90 px-3 py-1 text-sm font-medium shadow"
            onClick={() => setLightboxUrl(null)}
          >
            Close
          </button>
        </div>
      )}
    </>
  );
}