// src/components/AdminProofs.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  getProofs,
  approveProof,   // expects proofId
  rejectProof,    // expects (bidId, milestoneIndex)
  analyzeProof,
  chatProof,
  type Proof,
} from '@/lib/api';

export default function AdminProofs({ bidIds }: { bidIds?: number[] }) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProofs() {
    try {
      setLoading(true);
      setError(null);
      // ✅ Load the SAME backend proofs used by /admin/proofs
      const data = await getProofs(); // admin list from backend
      // If we got bidIds from the project page, filter to those bids only
      const filtered = Array.isArray(bidIds) && bidIds.length
        ? data.filter(p => bidIds.includes(Number(p.bidId)))
        : data;
      setProofs(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProofs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="p-6">Loading proofs...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto p-0">
      <div className="grid gap-6">
        {proofs.map((proof) => (
          <ProofCard
            key={proof.proofId ?? `${proof.bidId}-${proof.milestoneIndex}`}
            proof={proof}
            onRefresh={loadProofs}
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

function ProofCard({ proof, onRefresh }: { proof: Proof; onRefresh: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [running, setRunning] = useState(false);

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

  // ✅ Approve must use proofId (backend route: /proofs/:id/approve)
  async function handleApprove() {
    if (!proof.proofId) {
      alert('Missing proofId on this item.');
      return;
    }
    await approveProof(proof.proofId);
    await onRefresh();
  }

  // ✅ Reject uses bid+milestone (backend route: /bids/:bidId/milestones/:idx/reject)
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
          <h2 className="text-lg font-semibold mb-1">
            {proof.title || `Proof for Milestone ${proof.milestoneIndex + 1}`}
          </h2>
          <p className="text-sm text-gray-600 mb-2">
            Vendor: <span className="font-medium">{proof.vendorName || '—'}</span> &middot; Bid #{proof.bidId} &middot; Milestone #{proof.milestoneIndex + 1}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs rounded ${statusChip}`}>{proof.status}</span>
      </div>

      <p className="text-gray-700 mb-3 whitespace-pre-wrap">{proof.description || 'No description'}</p>

      {!!proof.files?.length && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {proof.files.map((file, i) => {
            const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || file.url);
            if (isImage) {
              return (
                <a key={i} href={file.url} target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={file.url} alt={file.name} className="h-32 w-full object-cover group-hover:scale-105 transition" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                    {file.name}
                  </div>
                </a>
              );
            }
            return (
              <div key={i} className="p-3 rounded border bg-gray-50">
                <p className="truncate text-sm">{file.name}</p>
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                  Open
                </a>
              </div>
            );
          })}
        </div>
      )}

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
        >
          {running ? 'Running…' : 'Run Agent 2'}
        </button>
        <button
          onClick={onChat}
          disabled={!canAnalyze || streaming}
          className="px-3 py-1 rounded bg-indigo-600 text-white text-xs disabled:opacity-50"
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

      {chat && (
        <div className="rounded border bg-white p-3">
          <div className="text-xs text-slate-700 whitespace-pre-wrap break-words font-mono">{chat}</div>
        </div>
      )}
    </div>
  );
}
