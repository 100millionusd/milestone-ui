// src/components/ChangeRequestsPanel.tsx
'use client';

import { useEffect, useState } from 'react';

type FileItem = { url?: string; cid?: string; name?: string };
type ResponseItem = {
  id: number;
  requestId: number;
  comment?: string | null;
  files?: FileItem[];
  createdAt?: string;
  createdBy?: string | null;
};

type ChangeRequest = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  comment?: string | null;
  checklist?: any;
  status?: string;
  createdAt?: string;
  createdBy?: string | null;
  responses?: ResponseItem[];
};

export default function ChangeRequestsPanel({ proposalId }: { proposalId: number }) {
  const [rows, setRows] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const url = `/api/proofs/change-requests?proposalId=${encodeURIComponent(String(proposalId))}&include=responses&_t=${Date.now()}`;
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const list = r.ok ? await r.json() : [];
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(proposalId)) return;
    load();
    const onAny = () => load();
    window.addEventListener('proofs:updated', onAny);
    window.addEventListener('proofs:changed', onAny);
    window.addEventListener('change-requests:updated', onAny);
    return () => {
      window.removeEventListener('proofs:updated', onAny);
      window.removeEventListener('proofs:changed', onAny);
      window.removeEventListener('change-requests:updated', onAny);
    };
  }, [proposalId]);

  if (!Number.isFinite(proposalId)) return null;

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Change Requests (full thread)</h3>
        <button
          onClick={load}
          disabled={loading}
          className="text-sm px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-60"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-gray-500">No change requests yet.</p>
      )}

      <div className="space-y-4">
        {rows
          .sort((a,b) => (a.milestoneIndex - b.milestoneIndex || new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime()))
          .map((cr) => (
          <div key={cr.id} className="border rounded p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">
                Milestone {Number(cr.milestoneIndex) + 1} — Request #{cr.id}
              </div>
              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                {cr.status || 'open'}
              </span>
            </div>

            {cr.comment && (
              <p className="text-sm text-gray-800 whitespace-pre-wrap mb-2">
                {cr.comment}
              </p>
            )}

            {/* Checklist */}
            {(() => {
              let raw = cr.checklist as any;
              if (raw && typeof raw === 'string') {
                try { raw = JSON.parse(raw); } catch {}
              }
              const items = Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : []);
              if (!items?.length) return null;
              return (
                <ul className="list-disc list-inside text-sm text-gray-700 mb-3">
                  {items.map((x:any, i:number) => {
                    const text = typeof x === 'string' ? x : (x?.text ?? x?.title ?? '');
                    const done = !!(x?.done ?? x?.checked);
                    return <li key={i} className={done ? 'line-through opacity-70' : ''}>{String(text)}</li>;
                  })}
                </ul>
              );
            })()}

            {/* Responses thread */}
            {Array.isArray(cr.responses) && cr.responses.length > 0 && (
              <div className="mt-3 border-t pt-3">
                <div className="text-sm font-semibold mb-2">Responses</div>
                <div className="space-y-3">
                  {cr.responses
                    .sort((a,b) => new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
                    .map((res) => (
                    <div key={res.id} className="rounded border bg-gray-50 p-3">
                      <div className="text-xs text-gray-600 mb-1">
                        {res.createdAt ? new Date(res.createdAt).toLocaleString() : '—'}
                        {res.createdBy ? ` • ${res.createdBy}` : ''}
                      </div>
                      {res.comment && (
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{res.comment}</p>
                      )}
                      {Array.isArray(res.files) && res.files.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                          {res.files.map((f, i) => {
                            const href = f.url || (f.cid ? `https://gateway.pinata.cloud/ipfs/${f.cid}` : '#');
                            const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(href);
                            if (isImage) {
                              return (
                                <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded border">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={href} alt={f.name || 'image'} className="h-24 w-full object-cover group-hover:scale-105 transition" />
                                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[11px] px-2 py-0.5 truncate">
                                    {f.name || 'image'}
                                  </div>
                                </a>
                              );
                            }
                            return (
                              <div key={i} className="p-2 rounded border bg-white text-xs">
                                <p className="truncate" title={f.name || href}>{f.name || href}</p>
                                <a className="text-blue-600 hover:underline" href={href} target="_blank" rel="noopener noreferrer">Open</a>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
