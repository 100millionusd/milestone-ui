'use client';

import { useEffect, useState } from 'react';

type ResponseItem = {
  id: number;
  createdAt: string;
  note: string;
  files: { url?: string; cid?: string; name?: string }[];
};

type ChangeRequest = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  comment: string | null;
  checklist: string[] | null;
  status: 'open' | 'resolved';
  createdAt: string;
  responses?: ResponseItem[];
};

export default function ChangeRequestsPanel({ proposalId }: { proposalId: number }) {
  const [rows, setRows] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!Number.isFinite(proposalId)) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/proofs/change-requests?proposalId=${proposalId}&include=responses`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const j = await r.json();
      setRows(Array.isArray(j) ? j : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const onUpdate = (ev: any) => {
      const pid = Number(ev?.detail?.proposalId);
      if (!Number.isFinite(pid) || pid === proposalId) load();
    };
    window.addEventListener('proofs:updated', onUpdate);
    window.addEventListener('proofs:changed', onUpdate);
    return () => {
      window.removeEventListener('proofs:updated', onUpdate);
      window.removeEventListener('proofs:changed', onUpdate);
    };
  }, [proposalId]);

  if (loading) return <div className="mt-4 text-sm text-gray-500">Loading discussion…</div>;
  if (!rows.length) return <div className="mt-4 text-sm text-gray-500">No change requests yet.</div>;

  return (
    <div className="mt-6">
      <h4 className="font-semibold mb-2">Change Requests — Discussion</h4>
      <div className="space-y-4">
        {rows.map((cr) => (
          <div key={cr.id} className="border rounded p-3 bg-white">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                Milestone {cr.milestoneIndex + 1}{' '}
                <span className="text-gray-500 text-sm">• {new Date(cr.createdAt).toLocaleString()}</span>
              </div>
              <span className={`px-2 py-0.5 text-xs rounded ${
                cr.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>{cr.status}</span>
            </div>

            {cr.comment && <p className="mt-2 text-sm">{cr.comment}</p>}
            {!!(cr.checklist?.length) && (
              <ul className="mt-2 list-disc list-inside text-sm text-gray-700">
                {cr.checklist.map((it, i) => <li key={i}>{it}</li>)}
              </ul>
            )}

            {/* Replies */}
            {!!(cr.responses?.length) && (
              <div className="mt-3 space-y-3">
                {cr.responses!.map((resp) => (
                  <div key={resp.id} className="rounded border p-2">
                    <div className="text-xs text-gray-600 mb-1">
                      Vendor reply • {new Date(resp.createdAt).toLocaleString()}
                    </div>
                    {resp.note && <div className="text-sm whitespace-pre-wrap">{resp.note}</div>}
                    {!!resp.files?.length && (
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
                        {resp.files.map((f, i) => {
                          const href = f.url || (f.cid ? f.cid : '');
                          const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(href);
                          if (isImg) {
                            return (
                              <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="block rounded overflow-hidden border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={href} alt={f.name || 'file'} className="h-24 w-full object-cover" />
                              </a>
                            );
                          }
                          return (
                            <div key={i} className="text-xs p-2 rounded border bg-gray-50">
                              <div className="truncate">{f.name || 'file'}</div>
                              <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Open</a>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
