// src/components/AdminProofs.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  getProofs,
  approveProof,           // POST /proofs/:proofId/approve
  rejectProof,            // POST /bids/:bidId/milestones/:idx/reject
  analyzeProof,           // POST /proofs/:proofId/analyze
  chatProof,              // POST /proofs/:proofId/chat  (SSE)
  adminCompleteMilestone, // POST /bids/:bidId/complete-milestone (fallback approve)
  type Proof,
} from '@/lib/api';

type Props = {
  /** Optional: restrict to these bid IDs (used on Project page Admin tab) */
  bidIds?: number[];
  /** Optional: when provided, enables the “Request Changes” UI (we need the project id to save the request) */
  proposalId?: number;
  /** Optional: show header block; keep true for /admin/proofs page, false if embedding */
  showHeader?: boolean;
};

export default function AdminProofs({ bidIds, proposalId, showHeader = true }: Props) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadProofs() {
    try {
      setLoading(true);
      setError(null);

      // Admin list from backend
      const data = await getProofs(); // returns ALL proofs (admin)
      // If embedding on a project, filter to that project's bidIds if provided
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
  useEffect(() => { loadProofs(); }, [JSON.stringify(bidIds)]); // refetch if the bid set changes

  if (loading) return <div className="p-6">Loading proofs...</div>;
  if (error)   return <div className="p-6 text-rose-600">{error}</div>;

  return (
    <div className={showHeader ? 'max-w-6xl mx-auto p-6' : ''}>
      {showHeader && <h1 className="text-2xl font-bold mb-6">Admin — Proofs</h1>}

      <div className="grid gap-6">
        {proofs.map((proof) => (
          <ProofCard
            key={proof.proofId ?? `${proof.bidId}-${proof.milestoneIndex}`}
            proof={proof}
            onRefresh={loadProofs}
            proposalId={proposalId}
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
  const [savingReq, setSavingReq] = useState(false);
  const [showRequestBox, setShowRequestBox] = useState(false);
  const [requestComment, setRequestComment] = useState('');
  const [requestChecklist, setRequestChecklist] = useState(''); // one item per line

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
        [{ role: 'user', content: (prompt || 'Explain this proof and the attached file(s). What evidence is strong? Any gaps?') }],
        (t) => setChat((prev) => prev + t),
      );
    } finally {
      setStreaming(false);
    }
  }

  // Robust approve: try /proofs/:id/approve; if that 404/400s, fall back to adminCompleteMilestone.
  async function handleApprove() {
    try {
      if (typeof proof.proofId === 'number' && !Number.isNaN(proof.proofId)) {
        await approveProof(proof.proofId);
      } else {
        // No proofId in record → go straight to fallback
        await adminCompleteMilestone(proof.bidId, proof.milestoneIndex);
      }
    } catch {
      // Fallback path if first call failed (e.g., 404)
      await adminCompleteMilestone(proof.bidId, proof.milestoneIndex);
    }
    await onRefresh();
  }

  async function handleReject() {
    await rejectProof(proof.bidId, proof.milestoneIndex);
    await onRefresh();
  }

  async function handleRequestChanges() {
    if (!Number.isFinite(proposalId as number)) {
      alert('Cannot request changes: proposalId missing on this page.');
      return;
    }
    setSavingReq(true);
    try {
      const checklist = requestChecklist
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/proofs/change-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proposalId: Number(proposalId),
          milestoneIndex: Number(proof.milestoneIndex),
          comment: requestComment || 'Please revise this proof.',
          checklist,
          status: 'open',
        }),
      });

      if (!res.ok) {
        const msg = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(msg);
      }

      setRequestComment('');
      setRequestChecklist('');
      setShowRequestBox(false);
      // Let the page know something changed (Files/threads panels may refresh)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('proofs:updated', { detail: { proposalId: Number(proposalId) } }));
      }
      alert('Change request sent.');
    } catch (e: any) {
      console.error('Change request failed:', e);
      alert(e?.message || 'Failed to create change request');
    } finally {
      setSavingReq(false);
    }
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
            {proof.title || `Proof for Milestone ${Number(proof.milestoneIndex) + 1}`}
          </h2>
          <p className="text-sm text-gray-600 mb-2">
            Vendor: <span className="font-medium">{proof.vendorName || '—'}</span>
            {' · '}Bid #{proof.bidId}
            {' · '}Milestone #{Number(proof.milestoneIndex) + 1}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs rounded ${statusChip}`}>{proof.status}</span>
      </div>

      <p className="text-gray-700 mb-3 whitespace-pre-wrap">{proof.description || 'No description'}</p>

      {/* Attachments */}
      {Array.isArray(proof.files) && proof.files.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {proof.files.map((file, i) => {
            const href = file.url || '#';
            const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test((file.name || href || '').toLowerCase());
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
                  <img src={href} alt={file.name || 'image'} className="h-32 w-full object-cover group-hover:scale-105 transition" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                    {file.name || 'image'}
                  </div>
                </a>
              );
            }
            return (
              <div key={i} className="p-3 rounded border bg-gray-50">
                <p className="truncate text-sm">{file.name || href}</p>
                <a
                  href={href}
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
              : JSON.stringify(proof.aiAnalysis, null, 2)}
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
            title="Approve this milestone/proof"
          >
            Approve
          </button>
          <button
            onClick={handleReject}
            disabled={proof.status === 'rejected'}
            className="px-3 py-1 text-sm bg-rose-600 text-white rounded disabled:bg-gray-300"
            title="Reject this milestone/proof"
          >
            Reject
          </button>
        </div>
      </div>

      {/* Request changes (only shown when we have proposalId, e.g., on Project page Admin tab) */}
      {Number.isFinite(proposalId as number) && (
        <div className="mt-3 border-t pt-3">
          {!showRequestBox ? (
            <button
              onClick={() => setShowRequestBox(true)}
              className="text-xs px-2 py-1 rounded bg-amber-600 text-white"
              title="Ask the vendor to revise or add files"
            >
              Request Changes
            </button>
          ) : (
            <div className="rounded border p-3 bg-amber-50">
              <label className="text-xs font-medium">Comment</label>
              <textarea
                className="w-full border rounded p-2 text-sm mb-2"
                rows={3}
                placeholder="Tell the vendor what to fix or add…"
                value={requestComment}
                onChange={(e) => setRequestComment(e.target.value)}
              />

              <label className="text-xs font-medium">Checklist (one per line)</label>
              <textarea
                className="w-full border rounded p-2 text-sm"
                rows={3}
                placeholder={'Add items like:\n- Add site photos\n- Include signed acceptance form\n- Attach updated invoice'}
                value={requestChecklist}
                onChange={(e) => setRequestChecklist(e.target.value)}
              />

              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleRequestChanges}
                  disabled={savingReq}
                  className="px-3 py-1 rounded bg-amber-700 text-white text-xs disabled:opacity-50"
                >
                  {savingReq ? 'Sending…' : 'Send Request'}
                </button>
                <button
                  onClick={() => setShowRequestBox(false)}
                  className="px-3 py-1 rounded bg-gray-200 text-gray-800 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat stream output */}
      {chat && (
        <div className="rounded border bg-white p-3">
          <div className="text-xs text-slate-700 whitespace-pre-wrap font-mono">{chat}</div>
        </div>
      )}
    </div>
  );
}

