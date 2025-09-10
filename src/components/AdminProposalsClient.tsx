// src/components/AdminProposalsClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { getProposals, approveProposal, rejectProposal } from '@/lib/api';

type Attachment = {
  cid?: string;
  url?: string;
  name: string;
  size?: number;
  mimetype?: string;
};

interface Proposal {
  proposalId: number;
  orgName: string;
  title: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  contact: string;
  amountUSD: number;
  address?: string;
  city?: string;
  country?: string;
  docs?: Attachment[]; // <— files saved with the proposal
  cid?: string;        // <— optional folder CID on IPFS
}

interface AdminProposalsClientProps {
  initialProposals?: Proposal[];
}

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

export default function AdminProposalsClient({ initialProposals = [] }: AdminProposalsClientProps) {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
  const [loading, setLoading] = useState(initialProposals.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null); // image preview

  useEffect(() => {
    if (initialProposals.length === 0) fetchProposals();
  }, [initialProposals.length]);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProposals();
      setProposals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch proposals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (proposalId: number) => {
    try {
      setError(null);
      await approveProposal(proposalId);
      setProposals(prev =>
        prev.map(p => (p.proposalId === proposalId ? { ...p, status: 'approved' } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve proposal');
    }
  };

  const handleReject = async (proposalId: number) => {
    try {
      setError(null);
      await rejectProposal(proposalId);
      setProposals(prev =>
        prev.map(p => (p.proposalId === proposalId ? { ...p, status: 'rejected' } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  };

  if (loading) return <div className="p-6">Loading proposals...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Admin — Proposals Management</h1>

        <div className="grid gap-5">
          {proposals.map((p) => (
            <div key={p.proposalId} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
                  <div className="mt-1 text-sm text-slate-600">
                    <span className="font-medium">{p.orgName}</span>
                    {(p.city || p.country) && (
                      <span> · {[p.city, p.country].filter(Boolean).join(', ')}</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{p.summary}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">#{p.proposalId}</div>
                  <div className="mt-2 text-sm">
                    <span className="text-slate-500">Requested: </span>
                    <span className="font-semibold">${p.amountUSD.toLocaleString()}</span>
                  </div>
                  <div className="mt-2">
                    <StatusPill status={p.status} />
                  </div>
                </div>
              </div>

              {/* Contact & meta */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="text-slate-700">
                  <span className="font-semibold text-slate-900">Contact:</span> {p.contact}
                </p>
                {(p.address || p.city || p.country) && (
                  <p className="mt-1 text-slate-700">
                    <span className="font-semibold text-slate-900">Address:</span>{' '}
                    {[p.address, p.city, p.country].filter(Boolean).join(', ')}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Submitted: {new Date(p.createdAt).toLocaleString()}
                </p>
              </div>

              {/* Attachments */}
              <div className="mt-5">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-900">Attachments</h4>
                  {!((p.docs || []).length) && p.cid && (
                    <a
                      href={`${GATEWAY}/${p.cid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
                    >
                      Open IPFS folder
                    </a>
                  )}
                </div>

                {(p.docs && p.docs.length > 0) ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {p.docs.map((d, i) => {
                      const href = d.url || (d.cid ? `${GATEWAY}/${d.cid}` : '#');
                      const type = classifyType(d);
                      const size = typeof d.size === 'number' ? formatBytes(d.size) : undefined;

                      if (type === 'image') {
                        return (
                          <button
                            key={i}
                            onClick={() => setLightbox(href)}
                            className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white"
                            title={d.name}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={href}
                              alt={d.name}
                              className="h-40 w-full object-cover transition group-hover:scale-[1.02]"
                              loading="lazy"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                              <p className="truncate text-xs font-medium text-white">{d.name}</p>
                              {size && <p className="text-[10px] text-white/80">{size}</p>}
                            </div>
                          </button>
                        );
                      }

                      if (type === 'pdf') {
                        return (
                          <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col" title={d.name}>
                            <div className="h-40 overflow-hidden rounded-lg border border-slate-100">
                              <object data={href} type="application/pdf" width="100%" height="100%">
                                <div className="h-full w-full grid place-items-center text-xs text-slate-500">
                                  PDF preview not available
                                </div>
                              </object>
                            </div>
                            <div className="mt-2">
                              <p className="truncate text-sm font-medium text-slate-900">{d.name}</p>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-slate-500">{size || 'PDF'}</p>
                                <div className="flex gap-2">
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
                                  >
                                    Open
                                  </a>
                                  <button onClick={() => copy(href)} className="text-xs text-slate-600 hover:text-slate-900">
                                    Copy
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // other file types
                      return (
                        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 flex items-start gap-3" title={d.name}>
                          <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                            {fileEmoji(type)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{d.name}</p>
                            <p className="text-xs text-slate-500">{size || type.toUpperCase()}</p>
                            <div className="mt-1 flex items-center gap-3">
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
                              >
                                Open
                              </a>
                              <button onClick={() => copy(href)} className="text-xs text-slate-600 hover:text-slate-900">
                                Copy
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    No files attached.
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => handleApprove(p.proposalId)}
                  disabled={p.status === 'approved'}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-emerald-700 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(p.proposalId)}
                  disabled={p.status === 'rejected'}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-rose-700 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}

          {proposals.length === 0 && (
            <div className="text-center py-10 text-slate-500 bg-white border border-slate-200 rounded-2xl">
              No proposals found.
            </div>
          )}
        </div>
      </div>

      {/* Lightbox for images */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 p-4 md:p-8" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="preview" className="mx-auto max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

/* ---------------- helpers (inline, no extra files) ---------------- */

function classifyType(d: Attachment):
  | 'image' | 'pdf' | 'doc' | 'sheet' | 'ppt' | 'zip' | 'audio' | 'video' | 'other' {
  const n = (d.name || '').toLowerCase();
  const mt = (d.mimetype || '').toLowerCase();
  const is = (ext: RegExp, mime: RegExp) => ext.test(n) || mime.test(mt);
  if (is(/\.(png|jpe?g|gif|webp|svg|bmp|tiff)$/, /^image\//)) return 'image';
  if (is(/\.pdf$/, /^application\/pdf$/)) return 'pdf';
  if (is(/\.(docx?|rtf|txt|md)$/, /msword|officedocument\.wordprocessingml|text\//)) return 'doc';
  if (is(/\.(xlsx?|csv)$/, /spreadsheet|csv/)) return 'sheet';
  if (is(/\.(pptx?)$/, /presentation/)) return 'ppt';
  if (is(/\.(zip|rar|7z|tar|gz)$/, /(zip|x-rar|7z|gzip|tar)/)) return 'zip';
  if (is(/\.(mp3|wav|aac|flac|ogg)$/, /^audio\//)) return 'audio';
  if (is(/\.(mp4|mov|webm|mkv|avi)$/, /^video\//)) return 'video';
  return 'other';
}

function fileEmoji(type: ReturnType<typeof classifyType>) {
  switch (type) {
    case 'doc': return '📄';
    case 'sheet': return '📊';
    case 'ppt': return '📈';
    case 'zip': return '🗜️';
    case 'audio': return '🎵';
    case 'video': return '🎬';
    default: return '📎';
  }
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B','KB','MB','GB','TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function copy(text: string) {
  try { navigator.clipboard?.writeText(text); } catch {}
}
