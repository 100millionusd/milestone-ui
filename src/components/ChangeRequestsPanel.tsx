// src/components/ChangeRequestsPanel.tsx
'use client';

import { useEffect, useState } from 'react';

type FileItem = { url?: string; cid?: string; name?: string };
type ResponseItem = {
  id: number;
  requestId?: number;
  comment?: string | null;
  message?: string | null;
  files?: FileItem[];
  createdAt?: string;
  createdBy?: string | null;
  authorRole?: string | null;
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
  // Server may return `responses` or `replies`; we normalize below.
  responses?: ResponseItem[];
  replies?: ResponseItem[];
};

export default function ChangeRequestsPanel({ proposalId }: { proposalId: number }) {
  const [rows, setRows] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const url = `/api/proofs/change-requests?proposalId=${encodeURIComponent(
        String(proposalId)
      )}&include=responses&_t=${Date.now()}`;
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const list: ChangeRequest[] = r.ok ? await r.json() : [];
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

  function normResponses(cr: ChangeRequest): ResponseItem[] {
    const arr = Array.isArray(cr.responses)
      ? cr.responses
      : Array.isArray(cr.replies)
      ? cr.replies
      : [];
    return [...arr].sort(
      (a, b) =>
        new Date(a.createdAt || 0).getTime() -
        new Date(b.createdAt || 0).getTime()
    );
  }

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
          .sort(
            (a, b) =>
              a.milestoneIndex - b.milestoneIndex ||
              new Date(a.createdAt || 0).getTime() -
                new Date(b.createdAt || 0).getTime()
          )
          .map((cr) => {
            const responses = normResponses(cr);
            return (
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

                {/* Full thread */}
                {responses.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <div className="text-sm font-semibold mb-2">Responses</div>
                    <div className="space-y-3">
                      {responses.map((res) => {
                        const text = res.comment ?? res.message ?? '';
                        return (
                          <div key={res.id} className="rounded border bg-gray-50 p-3">
                            <div className="text-xs text-gray-600 mb-1">
                              {res.createdAt
                                ? new Date(res.createdAt).toLocaleString()
                                : '—'}
                              {res.authorRole ? ` • ${res.authorRole}` : ''}
                              {res.createdBy ? ` • ${res.createdBy}` : ''}
                            </div>
                            {text && (
                              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                {text}
                              </p>
                            )}
                            {!!res.files?.length && (
                              <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                                {res.files.map((f, i) => {
                                  const href =
                                    f.url ||
                                    (f.cid
                                      ? `https://gateway.pinata.cloud/ipfs/${f.cid}`
                                      : '#');
                                  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(
                                    href
                                  );
                                  if (isImage) {
                                    return (
                                      <a
                                        key={i}
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative overflow-hidden rounded border"
                                      >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={href}
                                          alt={f.name || 'image'}
                                          className="h-24 w-full object-cover group-hover:scale-105 transition"
                                        />
                                        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[11px] px-2 py-0.5 truncate">
                                          {f.name ||
                                            decodeURIComponent(
                                              (href.split('/').pop() || '').trim()
                                            ) ||
                                            'file'}
                                        </div>
                                      </a>
                                    );
                                  }
                                  return (
                                    <div
                                      key={i}
                                      className="p-2 rounded border bg-white text-xs"
                                    >
                                      <p
                                        className="truncate"
                                        title={f.name || href}
                                      >
                                        {f.name ||
                                          decodeURIComponent(
                                            (href.split('/').pop() || '').trim()
                                          ) ||
                                          href}
                                      </p>
                                      <a
                                        className="text-blue-600 hover:underline"
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Open
                                      </a>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
