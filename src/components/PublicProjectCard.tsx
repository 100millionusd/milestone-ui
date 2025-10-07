'use client';

import { useEffect, useMemo, useState } from 'react';

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
};

export default function PublicProjectCard({ project }: { project: Project }) {
  const [tab, setTab] = useState<'overview'|'bids'|'milestones'|'files'>('overview');
  const [files, setFiles] = useState<any[]>([]);

  // flatten milestones across bids (newest bid last for natural order)
  const allMilestones = useMemo(() => {
    const list: Array<{ fromBidId: number; vendor: string; m: any }> = [];
    for (const b of project.bids || []) {
      for (const m of b.milestones || []) {
        list.push({ fromBidId: b.bidId, vendor: b.vendorName, m });
      }
    }
    return list;
  }, [project.bids]);

  // lazy load proofs/files count for this proposal (Files tab)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/proofs?proposalId=${encodeURIComponent(String(project.proposalId))}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json().catch(() => []);
        if (!cancelled && Array.isArray(j)) setFiles(j);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [project.proposalId]);

  const tabs = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'bids' as const, label: `Bids (${project.bids?.length || 0})` },
    { key: 'milestones' as const, label: 'Milestones' },
    { key: 'files' as const, label: `Files (${files.length})` },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
      <div className="relative aspect-[16/9] bg-gray-50">
        {project.coverImage ? (
          <img src={project.coverImage} alt={project.proposalTitle || 'cover'} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-400 text-sm">No image</div>
        )}
      </div>

      <div className="p-4">
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{project.orgName}</div>
        <h2 className="text-lg font-semibold">{project.proposalTitle || 'Untitled Project'}</h2>
        {project.summary && (
          <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{project.summary}</p>
        )}

        {/* inline tabs */}
        <div className="mt-4 border-b border-gray-200">
          <nav className="-mb-px flex gap-5">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={
                  "pb-2 text-sm outline-none " +
                  (tab === t.key ? "border-b-2 border-black font-medium" : "text-gray-500 hover:text-gray-800")
                }
                type="button"
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* tab contents */}
        <div className="mt-4 space-y-4">
          {tab === 'overview' && (
            <>
              {Array.isArray(project.images) && project.images.length > 1 && (
                <>
                  <div className="text-sm font-medium text-gray-700">More images</div>
                  <div className="grid grid-cols-2 gap-3">
                    {project.images.slice(1, 7).map((u, i) => (
                      <img key={i} src={u} alt={`image ${i + 1}`} className="w-full aspect-video object-cover rounded-lg border" loading="lazy" />
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
              {project.bids?.map(b => (
                <div key={b.bidId} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">{b.vendorName || 'Vendor'}</div>
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
              ))}
            </>
          )}

          {tab === 'milestones' && (
            <>
              {allMilestones.length === 0 && <div className="text-sm text-gray-500">No public milestones yet.</div>}
              {allMilestones.map(({ fromBidId, vendor, m }, i) => (
                <div key={i} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{m.name || `Milestone`} <span className="text-gray-400">• bid #{fromBidId}</span></div>
                    <div className="text-gray-700">{typeof m.amount === 'number' ? usd(m.amount) : ''}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {vendor ? `${vendor} • ` : ''}{m.dueDate ? `due ${new Date(m.dueDate).toLocaleDateString()}` : ''}{m.completed ? ' • completed' : ''}
                  </div>
                </div>
              ))}
            </>
          )}

          {tab === 'files' && (
            <>
              {files.length === 0 && <div className="text-sm text-gray-500">No public milestones/proofs yet.</div>}
              {files.map((p, idx) => (
                <div key={p.proofId || idx} className="rounded-lg border p-3">
                  <div className="text-sm font-medium">
                    Milestone {Number(p.milestoneIndex) + 1}: {p.title || 'Submission'}
                  </div>
                  {p.publicText && <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{p.publicText}</p>}
                  {Array.isArray(p.files) && p.files.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {p.files.map((f: any, i: number) => (
                        <a key={i} href={f.url} className="block rounded-lg border overflow-hidden" target="_blank">
                          {/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(String(f.url || "")) ? (
                            <img src={f.url} alt={f.name || `file ${i + 1}`} className="w-full aspect-video object-cover" loading="lazy" />
                          ) : (
                            <div className="h-24 flex items-center justify-center text-xs text-gray-500">
                              {f.name || 'file'}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
