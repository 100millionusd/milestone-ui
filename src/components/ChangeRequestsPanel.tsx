'use client';

import { useEffect, useState } from 'react';

type Reply = {
  id: number;
  milestoneIndex: number;
  note: string | null;
  createdAt: string;
  files: { url?: string; cid?: string; name?: string }[];
};

type ChangeRequest = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  comment: string | null;
  checklist: string[] | null;
  status: 'open' | 'closed' | string;
  createdAt: string;
  responses?: Reply[];
};

export default function ChangeRequestsPanel({ proposalId }: { proposalId: number }) {
  const [rows, setRows] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      setLoading(true);
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
  }, [proposalId]);

  // Live refresh when proofs change
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener('proofs:updated', onChange);
    window.addEventListener('proofs:changed', onChange);
    return () => {
      window.removeEventListener('proofs:updated', onChange);
      window.removeEventListener('proofs:changed', onChange);
    };
  }, []);

  if (loading) return <div className="mt-4 text-sm text-gray-600">Loading conversation…</div>;

  if (!rows.length) {
    return <div className="mt-4 text-sm text-gray-500">No change requests yet.</div>;
  }

  return (
    <div className="mt-6">
      <h4 className="font-semibold mb-2">Change Requests (full thread)</h4>
      <div className="space-y-4">
        {rows.map((cr) => (
          <div key={cr.id} className="border rounded p-3 bg-white">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <b>Milestone {cr.milestoneIndex + 1}</b>
                <span className="mx-2 text-gray-400">•</span>
                <span className="text-gray-600">Requested {new Date(cr.createdAt).toLocaleString()}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded ${cr.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                {cr.status}
              </span>
            </div>

            {cr.comment && (
              <div className="mt-2 text-sm">
                <div className="font-medium">Admin request:</div>
                <div className="whitespace-pre-wrap">{cr.comment}</div>
              </div>
            )}

            {!!cr.checklist?.length && (
              <ul className="mt-2 list-disc list-inside text-sm text-gray-700">
                {cr.checklist.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}

            {!!cr.responses?.length && (
              <div className="mt-3">
                <div className="text-sm font-medium mb-1">Vendor replies:</div>
                <div className="space-y-2">
                  {cr.responses.map((r) => (
                    <div key={r.id} className="rounded border p-2 bg-gray-50">
                      <div className="text-[11px] text-gray-500 mb-1">
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                      {r.note && <div className="text-sm whitespace-pre-wrap mb-2">{r.note}</div>}
                      {!!r.files?.length && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {r.files.map((f, i) => {
                            const href = f.url || (f.cid ? `https://gateway.pinata.cloud/ipfs/${f.cid}` : '#');
                            const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(href);
                            return isImage ? (
                              <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="block rounded overflow-hidden border">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={href} alt={f.name || 'image'} className="h-24 w-full object-cover" />
                              </a>
                            ) : (
                              <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline truncate">
                                {f.name || href}
                              </a>
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
