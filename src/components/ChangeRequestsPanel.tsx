'use client';

import { useEffect, useState } from 'react';

type CRResponseFile = { url?: string; cid?: string; name?: string };
type CRResponse = {
  id: number;            // proof id (or -1 if none)
  createdAt: string;     // first file time in the window
  note?: string | null;  // latest proof note if any
  files: CRResponseFile[];
};
type ChangeRequestRow = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  status: 'open' | 'resolved' | string;
  comment: string | null;
  checklist: string[];         // stored as string[] in Prisma
  createdAt: string;
  resolvedAt: string | null;
  responses?: CRResponse[];    // ← from API when include=responses
};

const PINATA_GATEWAY =
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY)
    ? `https://${String((process as any).env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//,'').replace(/\/+$/,'')}/ipfs`
    : ((typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_IPFS_GATEWAY)
        ? String((process as any).env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/,'')
        : 'https://gateway.pinata.cloud/ipfs');

function toUrl(f: CRResponseFile) {
  if (f?.url && /^https?:\/\//i.test(f.url)) return f.url;
  if (f?.url) return `https://${f.url.replace(/^https?:\/\//,'')}`;
  if (f?.cid) return `${PINATA_GATEWAY}/${f.cid}`;
  return '#';
}

function isImageHref(href: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(href);
}

type Props = {
  proposalId: number;
  initialMilestoneIndex?: number;
  // hard scoping from parent:
  forceMilestoneIndex?: number;
  hideMilestoneTabs?: boolean;
};

export default function ChangeRequestsPanel(props: Props) {
  const {
    proposalId,
    initialMilestoneIndex = 0,
    forceMilestoneIndex,
    hideMilestoneTabs,
  } = props;

  // keep local state for tabs when not forced
  const [activeMilestoneIndex, setActiveMilestoneIndex] = useState(initialMilestoneIndex);
  // Allow URL to set default milestone: ?ms=4 or ?milestone=4
useEffect(() => {
  if (typeof forceMilestoneIndex === 'number') return;
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('ms') ?? url.searchParams.get('milestone');
    const n = q ? Number(q) : NaN;
    if (Number.isFinite(n) && n >= 0) {
      setActiveMilestoneIndex(n);
    }
  } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // FINAL index used everywhere
  const idx =
    typeof forceMilestoneIndex === 'number'
      ? forceMilestoneIndex
      : activeMilestoneIndex;
  const [rows, setRows] = useState<ChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
  if (!Number.isFinite(proposalId)) return;
  setLoading(true);
  setErr(null);
  try {
    // Build URL and pass milestoneIndex ONLY when the parent forces it
    const url = new URL('/api/proofs/change-requests', window.location.origin);
    url.searchParams.set('proposalId', String(proposalId));
    url.searchParams.set('include', 'responses');
    url.searchParams.set('status', 'all');
    if (typeof forceMilestoneIndex === 'number') {
      url.searchParams.set('milestoneIndex', String(forceMilestoneIndex));
    }

    const r = await fetch(url.toString(), {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const list: ChangeRequestRow[] = await r.json();
    const safeList = Array.isArray(list) ? list : [];

    setRows(safeList);

    // --- Auto-focus a milestone that actually has CRs (only if not forced) ---
    if (typeof forceMilestoneIndex !== 'number') {
      const present = new Set<number>(
        safeList.map((row) => Number(row.milestoneIndex)).filter((x) => Number.isFinite(x))
      );

      // if current idx has no rows, pivot to the highest existing milestone with rows
      if (!present.has(idx) && present.size > 0) {
        const latest = Math.max(...Array.from(present.values()));
        setActiveMilestoneIndex(latest);
      }
    }
  } catch (e: any) {
    setErr(e?.message || 'Failed to load change requests');
    setRows([]);
  } finally {
    setLoading(false);
  }
}

  // on mount & when proposal OR effective milestone index changes
useEffect(() => { load(); }, [proposalId, idx]);


 useEffect(() => {
  const onAny = (ev: any) => {
    const pid = Number(ev?.detail?.proposalId);
    // reload when it's our proposal or when no proposalId is provided
    if (!Number.isFinite(pid) || pid === proposalId) load();
  };
  window.addEventListener('proofs:updated', onAny);
  window.addEventListener('proofs:changed', onAny);
  window.addEventListener('milestones:updated', onAny); // NEW
  return () => {
    window.removeEventListener('proofs:updated', onAny);
    window.removeEventListener('proofs:changed', onAny);
    window.removeEventListener('milestones:updated', onAny);
  };
}, [proposalId, idx]);

  // Narrow to the currently scoped milestone
  const filteredRows = (rows || []).filter((cr) =>
    (cr.milestoneIndex ?? (cr as any).milestone_index ?? 0) === idx
  );

  // Optional tabs only when NOT forced and not hidden
  const allMilestones = Array.from(
    new Set((rows || []).map(r => r.milestoneIndex))
  ).sort((a, b) => a - b);

  const showTabs =
    !hideMilestoneTabs &&
    typeof forceMilestoneIndex !== 'number' &&
    allMilestones.length > 1;

  if (loading) return <div className="mt-4 text-sm text-gray-500">Loading change requests…</div>;
  if (err) return <div className="mt-4 text-sm text-rose-600">{err}</div>;

  if (!filteredRows.length) {
    return (
      <div className="mt-4 p-3 border rounded bg-white text-sm text-gray-500">
        No change requests yet for Milestone {idx + 1}.
      </div>
    );
  }

      return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-semibold">Change Request Thread</h4>
        <button
          onClick={load}
          className="px-3 py-1 rounded text-sm bg-slate-900 text-white"
        >
          Refresh
        </button>
      </div>

      {showTabs && (
        <div className="mb-3 flex flex-wrap gap-2">
          {allMilestones.map(mi => (
            <button
              key={mi}
              onClick={() => setActiveMilestoneIndex(mi)}
              className={[
                'px-3 py-1.5 rounded-full text-xs border',
                mi === idx
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              ].join(' ')}
            >
              Milestone {mi + 1}
            </button>
          ))}
        </div>
      )}

      <ol className="space-y-4">
        {filteredRows.map((cr) => {
          const responses = Array.isArray(cr.responses) ? cr.responses : [];
          return (
            <li key={cr.id} className="border rounded p-3 bg-white">
              {/* Admin request header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-gray-600">
                    <span className="font-medium">Milestone {Number(cr.milestoneIndex) + 1}</span>
                    <span className="mx-2">•</span>
                    <span>{new Date(cr.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      cr.status === 'open'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {cr.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Admin request body */}
              {(cr.comment || (cr.checklist && cr.checklist.length)) && (
                <div className="mt-2 p-2 rounded bg-slate-50 border text-sm">
                  {cr.comment && <p className="mb-1">{cr.comment}</p>}
                  {cr.checklist?.length ? (
                    <ul className="list-disc list-inside text-sm text-gray-700">
                      {cr.checklist.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  ) : null}
                </div>
              )}

              {/* Vendor replies (ALL files in the window) */}
              {responses.length > 0 ? (
                <div className="mt-3">
                  {responses.map((resp, idx) => (
                    <div key={idx} className="mt-3">
                      <div className="text-xs text-gray-500">
                        Vendor reply at {new Date(resp.createdAt).toLocaleString()}
                      </div>

                      {resp.note && (
                        <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                          {resp.note}
                        </div>
                      )}

                      {resp.files?.length ? (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                          {resp.files.map((f, i) => {
                            const href = toUrl(f);
                            const img = isImageHref(href);
                            return img ? (
                              <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                                 className="group relative overflow-hidden rounded border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={href} alt={f.name || 'image'}
                                     className="h-24 w-full object-cover group-hover:scale-105 transition" />
                                <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-1 py-0.5 truncate">
                                  {f.name || href.split('/').pop()}
                                </div>
                              </a>
                            ) : (
                              <div key={i} className="p-2 rounded border bg-gray-50 text-xs">
                                <div className="truncate mb-1">{f.name || href.split('/').pop()}</div>
                                <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                  Open
                                </a>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-gray-500">No files in this reply.</div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-xs text-gray-500">No vendor reply yet.</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}