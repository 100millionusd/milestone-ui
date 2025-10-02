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

export default function ChangeRequestsPanel({ proposalId }: { proposalId: number }) {
  const [rows, setRows] = useState<ChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!Number.isFinite(proposalId)) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch(
        `/api/proofs/change-requests?proposalId=${encodeURIComponent(proposalId)}&include=responses&status=all`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = await r.json();
      setRows(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setErr(e?.message || 'Failed to load change requests');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* on mount & when proposal changes */ }, [proposalId]);

  // Live refresh when proofs saved
  useEffect(() => {
    const onAny = (ev: any) => {
      const pid = Number(ev?.detail?.proposalId);
      if (!Number.isFinite(pid) || pid === proposalId) load();
    };
    window.addEventListener('proofs:updated', onAny);
    window.addEventListener('proofs:changed', onAny);
    return () => {
      window.removeEventListener('proofs:updated', onAny);
      window.removeEventListener('proofs:changed', onAny);
    };
  }, [proposalId]);

  if (loading) return <div className="mt-4 text-sm text-gray-500">Loading change requests…</div>;
  if (err) return <div className="mt-4 text-sm text-rose-600">{err}</div>;

  if (!rows.length) {
    return (
      <div className="mt-4 p-3 border rounded bg-white text-sm text-gray-500">
        No change requests yet.
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

      <ol className="space-y-4">
        {rows.map((cr) => {
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
