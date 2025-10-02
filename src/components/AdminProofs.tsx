'use client';

import { useEffect, useState } from 'react';
import {
  getProofs,
  approveProof,              // prefers proofId
  rejectProof,
  analyzeProof,
  chatProof,
  adminCompleteMilestone,    // fallback when no proofId
  type Proof,
} from '@/lib/api';

/** Optional thread types (returned by /api/proofs/change-requests?include=responses) */
type CRFile = { url?: string; cid?: string; name?: string };
type CRResp = { id: number; createdAt: string; note?: string | null; files: CRFile[] };
type CR = {
  id: number;
  proposalId: number;
  milestoneIndex: number;
  status: 'open' | 'resolved' | string;
  comment: string | null;
  checklist: string[];
  createdAt: string;
  resolvedAt: string | null;
  responses?: CRResp[];
};

const PINATA_GATEWAY =
  (typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY)
    ? `https://${String((process as any).env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//,'').replace(/\/+$/,'')}/ipfs`
    : ((typeof process !== 'undefined' && (process as any).env?.NEXT_PUBLIC_IPFS_GATEWAY)
        ? String((process as any).env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/,'')
        : 'https://gateway.pinata.cloud/ipfs');

function toUrl(f: CRFile) {
  if (f?.url && /^https?:\/\//i.test(f.url)) return f.url;
  if (f?.url) return `https://${f.url.replace(/^https?:\/\//,'')}`;
  if (f?.cid) return `${PINATA_GATEWAY}/${f.cid}`;
  return '#';
}
function isImageHref(href: string) { return /\.(png|jpe?g|gif|webp|svg)$/i.test(href); }

export default function AdminProofs({ proposalId }: { proposalId?: number }) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProofs() {
    try {
      setLoading(true);
      setError(null);
      const data = await getProofs(); // admin list
      setProofs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProofs();
  }, []);

  if (loading) return <div className="p-6">Loading proofs...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">Admin — Proofs</h2>

      <div className="grid gap-6">
        {proofs.map((proof) => (
          <ProofCard
            key={proof.proofId ?? `${proof.bidId}-${proof.milestoneIndex}`}
            proof={proof}
            onRefresh={loadProofs}
            proposalId={proposalId}   // ← enables the per-milestone thread below
          />
        ))}

        {proofs.length === 0 && (
          <div className="text-gray-500 text-center py-10 border rounded bg-white">
            No proofs submitted yet.
          </div>
        )}
      </div>
    </div>
  );
}

function ProofCard({
  proof,
  onRefresh,
  proposalId,
}: {
  proof: Proof;
  onRefresh: () => void;
  proposalId?: number;
}) {
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [running, setRunning] = useState(false);

  // ▼ NEW: change-request thread for this milestone (only if proposalId provided)
  const [thread, setThread] = useState<CR[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  async function loadThread() {
    if (!Number.isFinite(proposalId as number)) return;
    setLoadingThread(true);
    try {
      const r = await fetch(
        `/api/proofs/change-requests?proposalId=${proposalId}&include=responses&status=all`,
        { credentials: 'include', cache: 'no-store' }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list: CR[] = await r.json();
      // keep only this milestone’s requests (often there may be multiple requests)
      const mine = list.filter(cr => Number(cr.milestoneIndex) === Number(proof.milestoneIndex));
      setThread(mine);
    } catch {
      setThread([]);
    } finally {
      setLoadingThread(false);
    }
  }

  useEffect(() => { loadThread(); /* when card mounts or changes */ }, [proposalId, proof.milestoneIndex]);

  // auto-refresh when proofs are saved anywhere
  useEffect(() => {
    const onAny = (ev: any) => {
      const pid = Number(ev?.detail?.proposalId);
      if (!Number.isFinite(pid) || pid === proposalId) loadThread();
    };
    window.addEventListener('proofs:updated', onAny);
    window.addEventListener('proofs:changed', onAny);
    return () => {
      window.removeEventListener('proofs:updated', onAny);
      window.removeEventListener('proofs:changed', onAny);
    };
  }, [proposalId]);

  const canAnalyze = typeof proof.proofId === 'number' && !Number.isNaN(proof.proofId);

  async function onRun() {
    if (!canAnalyze) return;
    setRunning(true);
    try {
      await analyzeProof(proof.proofId!, prompt);
      await onRefresh();
    } finally {
      setRunning(false);
    }
  }

  async function onChat() {
    if (!canAnalyze) return;
    setChat('');
    setStreaming(true);
    try {
      await chatProof(
        proof.proofId!,
        [{ role: 'user', content: prompt || 'Explain this proof and the attached file(s). What evidence is strong? Any gaps?' }],
        (t) => setChat((prev) => prev + t),
      );
    } finally {
      setStreaming(false);
    }
  }

  async function handleApprove() {
  try {
    if (typeof proof.proofId === 'number' && !Number.isNaN(proof.proofId)) {
      // Correct: approve by proofId
      await approveProof(proof.proofId);
    } else {
      // Fallback: mark milestone complete (legacy flow)
      await adminCompleteMilestone(proof.bidId, proof.milestoneIndex);
    }
    await onRefresh();
  } catch (e: any) {
    console.error('Approve failed:', e);
    alert(e?.message || 'Failed to approve proof');
  }
}

  async function handleReject() {
    await rejectProof(proof.bidId, proof.milestoneIndex);
    await onRefresh();
  }

  const statusChip =
    proof.status === 'approved'
      ? 'bg-green-100 text-green-700'
      : proof.status === 'rejected'
      ? 'bg-red-100 text-red-700'
      : 'bg-yellow-100 text-yellow-700';

  return (
    <div className="bg-white rounded-lg shadow border p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">
            {proof.title || `Proof for Milestone ${proof.milestoneIndex + 1}`}
          </h3>
          <p className="text-sm text-gray-600 mb-2">
            Vendor: <span className="font-medium">{proof.vendorName || '—'}</span> &middot; Bid #{proof.bidId} &middot; Milestone #{proof.milestoneIndex + 1}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs rounded ${statusChip}`}>{proof.status}</span>
      </div>

      <p className="text-gray-700 mb-3 whitespace-pre-wrap">{proof.description || 'No description'}</p>

      {/* Attachments */}
      {proof.files?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {proof.files.map((file, i) => {
            const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || file.url);
            if (isImage) {
              return (
                <a
                  key={i}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative overflow-hidden rounded border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={file.url}
                    alt={file.name}
                    className="h-32 w-full object-cover group-hover:scale-105 transition"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                    {file.name}
                  </div>
                </a>
              );
            }
            return (
              <div key={i} className="p-3 rounded border bg-gray-50">
                <p className="truncate text-sm">{file.name}</p>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Open
                </a>
              </div>
            );
          })}
        </div>
      )}

      {/* Existing AI analysis (if any) */}
      {proof.aiAnalysis && (
        <div className="mb-4 p-3 rounded border bg-slate-50">
          <div className="text-xs text-slate-700 whitespace-pre-wrap">
            <strong>AI Summary:</strong>{' '}
            {typeof (proof as any).aiAnalysis?.summary === 'string'
              ? (proof as any).aiAnalysis.summary
              : JSON.stringify((proof as any).aiAnalysis, null, 2)}
          </div>
        </div>
      )}

      {/* Prompt + actions */}
      <div className="mb-3">
        <textarea
          className="w-full border rounded p-2 text-sm"
          rows={3}
          placeholder="Ask Agent 2 about this proof (it will consider the PDF/text and images)."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={onRun}
          disabled={!canAnalyze || running}
          className="px-3 py-1 rounded bg-slate-900 text-white text-xs disabled:opacity-50"
          title={canAnalyze ? 'Re-run analysis and save to aiAnalysis' : 'Proof ID missing'}
        >
          {running ? 'Running…' : 'Run Agent 2'}
        </button>
        <button
          onClick={onChat}
          disabled={!canAnalyze || streaming}
          className="px-3 py-1 rounded bg-indigo-600 text-white text-xs disabled:opacity-50"
          title={canAnalyze ? 'Stream a one-off chat answer' : 'Proof ID missing'}
        >
          {streaming ? 'Asking…' : 'Ask Agent 2 (Chat)'}
        </button>

        <div className="ml-auto flex gap-2">
          <button
            onClick={handleApprove}
            disabled={proof.status === 'approved'}
            className="px-3 py-1 text-sm bg-emerald-600 text-white rounded disabled:bg-gray-300"
          >
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={proof.status === 'rejected'}
            className="px-3 py-1 text-sm bg-rose-600 text-white rounded disabled:bg-gray-300"
          >
            Reject
          </button>
        </div>
      </div>

      {/* ▼ NEW: per-milestone change-request thread */}
      {Number.isFinite(proposalId as number) && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Change Request Thread (M{proof.milestoneIndex + 1})</h4>
            <button onClick={loadThread} className="text-xs px-2 py-1 rounded bg-slate-900 text-white">
              {loadingThread ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {!thread.length && (
            <div className="mt-2 text-xs text-gray-500">No requests for this milestone yet.</div>
          )}

          <ol className="mt-2 space-y-3">
            {thread.map((cr) => (
              <li key={cr.id} className="border rounded p-2 bg-white">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>{new Date(cr.createdAt).toLocaleString()}</span>
                  <span>•</span>
                  <span className={`px-1.5 py-0.5 rounded ${
                    cr.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                  }`}>{cr.status}</span>
                </div>

                {(cr.comment || cr.checklist?.length) && (
                  <div className="mt-2 p-2 bg-slate-50 border rounded text-sm">
                    {cr.comment && <p className="mb-1">{cr.comment}</p>}
                    {!!cr.checklist?.length && (
                      <ul className="list-disc list-inside text-sm">
                        {cr.checklist.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    )}
                  </div>
                )}

                {Array.isArray(cr.responses) && cr.responses.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {cr.responses.map((resp, idx) => (
                      <div key={idx} className="p-2 rounded border">
                        <div className="text-[11px] text-gray-500">
                          Vendor reply at {new Date(resp.createdAt).toLocaleString()}
                        </div>
                        {resp.note && (
                          <div className="mt-1 text-sm whitespace-pre-wrap">{resp.note}</div>
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
                          <div className="mt-1 text-[11px] text-gray-500">No files in this reply.</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Chat stream output */}
      {chat && (
        <div className="rounded border bg-white p-3 mt-3">
          <div className="text-xs text-slate-700 whitespace-pre-wrap font-mono">{chat}</div>
        </div>
      )}
    </div>
  );
}
