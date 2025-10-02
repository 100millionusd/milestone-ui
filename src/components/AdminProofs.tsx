// src/components/AdminProofs.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  getProofs,
  approveProof,    // expects proofId
  rejectProof,     // expects (bidId, milestoneIndex)
  analyzeProof,    // expects proofId
  chatProof,       // expects proofId
  type Proof,
} from '@/lib/api';

type Props = {
  /** Optional: filter to these bid IDs (for project page). If omitted, shows global admin list. */
  bidIds?: number[];
  /** Optional: when present, enables the "Request Changes" button for this project. */
  proposalId?: number;
};

export default function AdminProofs({ bidIds, proposalId }: Props) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProofs() {
    try {
      setLoading(true);
      setError(null);

      let data: Proof[] = [];
      if (Array.isArray(bidIds) && bidIds.length) {
        const lists = await Promise.all(
          bidIds.map((id) => getProofs(id).catch(() => [] as Proof[]))
        );
        data = lists.flat();
      } else {
        data = await getProofs(); // global admin list
      }
      setProofs(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadProofs(); /*eslint-disable-next-line*/ }, [JSON.stringify(bidIds||[])]);

  if (loading) return <div className="p-6">Loading proofs...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto p-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Admin — Proofs</h2>
        <button onClick={loadProofs} className="px-3 py-1 rounded bg-slate-900 text-white text-sm">Refresh</button>
      </div>

      <div className="grid gap-6">
        {proofs.map((p) => (
          <ProofCard
            key={p.proofId ?? `${p.bidId}-${p.milestoneIndex}`}
            proof={p}
            onRefresh={loadProofs}
            proposalId={proposalId}
          />
        ))}

        {proofs.length === 0 && (
          <div className="text-gray-500 text-center py-10 border rounded bg-white">
            No proofs yet.
          </div>
        )}
      </div>
    </div>
  );
}

function ProofCard({ proof, onRefresh, proposalId }: { proof: Proof; onRefresh: () => void; proposalId?: number }) {
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [running, setRunning] = useState(false);

  const hasProofId = typeof proof.proofId === 'number' && Number.isFinite(proof.proofId);

  async function handleApprove() {
    if (!hasProofId) { alert('Proof ID missing.'); return; }
    await approveProof(proof.proofId!);
    await onRefresh();
  }

  async function handleReject() {
    await rejectProof(proof.bidId, proof.milestoneIndex);
    await onRefresh();
  }

  async function runAnalysis() {
    if (!hasProofId) return;
    setRunning(true);
    try {
      await analyzeProof(proof.proofId!, prompt);
      await onRefresh();
    } finally {
      setRunning(false);
    }
  }

  async function runChat() {
    if (!hasProofId) return;
    setChat('');
    setStreaming(true);
    try {
      await chatProof(
        proof.proofId!,
        [{ role: 'user', content: prompt || 'Explain this proof and its attachments.' }],
        (t) => setChat((s) => s + t)
      );
    } finally {
      setStreaming(false);
    }
  }

  // 🔶 Request Changes (only visible if project proposalId is known)
  async function handleRequestChanges() {
    if (!Number.isFinite(proposalId)) {
      alert('Cannot determine project id for change request.');
      return;
    }
    const comment = window.prompt('Tell the vendor what to change (optional):') || '';
    const checklistCsv = window.prompt('Checklist items (comma-separated, optional):') || '';
    const checklist = checklistCsv.split(',').map(s => s.trim()).filter(Boolean);

    const res = await fetch('/api/proofs/change-requests', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({
        proposalId: Number(proposalId),
        milestoneIndex: proof.milestoneIndex,
        comment,
        checklist,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(()=>'');
      alert(`Failed to create change request: ${txt || res.status}`);
      return;
    }

    // optional: notify Files tab to refresh banners
    window.dispatchEvent(new CustomEvent('proofs:updated', { detail: { proposalId: Number(proposalId) } }));
    alert('Change request recorded.');
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
          <p className="text-sm text-gray-600">
            Vendor: <span className="font-medium">{proof.vendorName || '—'}</span> · Bid #{proof.bidId} · Milestone #{proof.milestoneIndex + 1}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs rounded ${statusChip}`}>{proof.status}</span>
      </div>

      <p className="text-gray-700 my-3 whitespace-pre-wrap">{proof.description || 'No description'}</p>

      {!!proof.files?.length && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {proof.files.map((f, i) => {
            const href = f.url;
            const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(String(href || f.name || ''));
            return isImage ? (
              <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="group relative overflow-hidden rounded border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={href} alt={f.name} className="h-32 w-full object-cover group-hover:scale-105 transition" />
                <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">{f.name}</div>
              </a>
            ) : (
              <div key={i} className="p-3 rounded border bg-gray-50">
                <p className="truncate text-sm">{f.name}</p>
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Open</a>
              </div>
            );
          })}
        </div>
      )}

      <div className="mb-3">
        <textarea
          className="w-full border rounded p-2 text-sm"
          rows={3}
          placeholder="Ask Agent 2 about this proof."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button
          onClick={runAnalysis}
          disabled={!hasProofId || running}
          className="px-3 py-1 rounded bg-slate-900 text-white text-xs disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run Agent 2'}
        </button>

        <button
          onClick={runChat}
          disabled={!hasProofId || streaming}
          className="px-3 py-1 rounded bg-indigo-600 text-white text-xs disabled:opacity-50"
        >
          {streaming ? 'Asking…' : 'Ask Agent 2 (Chat)'}
        </button>

        <div className="ml-auto flex gap-2">
          {/* Only show Request Changes if we have proposalId (project page) */}
          {Number.isFinite(proposalId as number) && (
            <button
              onClick={handleRequestChanges}
              className="px-3 py-1 text-sm bg-amber-600 text-white rounded"
              title="Record a non-blocking change request"
            >
              Request Changes
            </button>
          )}
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
          <div className="text-xs text-slate-700 whitespace-pre-wrap font-mono">{chat}</div>
        </div>
      )}
    </div>
  );
}
