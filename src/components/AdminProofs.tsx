// src/components/AdminProofs.tsx
'use client';

import { useEffect, useState } from 'react';
import {
  getProofs,
  approveProof,
  rejectProof,
  analyzeProof,
  chatProof,
  adminCompleteMilestone,
  type Proof,
} from '@/lib/api';

// ---------- Gateway + helpers ----------
const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')}/ipfs`
    : 'https://gateway.pinata.cloud/ipfs';

function isImg(s?: string) {
  if (!s) return false;
  // treat “…jpg?filename=foo.jpg” and “…png#anchor” as images too
  return /\.(png|jpe?g|gif|webp|svg)(?=($|\?|#))/i.test(s);
}

// Build a safe https URL for any combination of {url, cid},
// and collapse any accidental /ipfs/ipfs/ duplication.
function toGatewayUrl(file: { url?: string; cid?: string } | undefined): string {
  const GW = PINATA_GATEWAY.replace(/\/+$/, ''); // e.g. https://<host>/ipfs
  if (!file) return '';

  const rawUrl = (file as any)?.url ? String((file as any).url).trim() : '';
  const rawCid = (file as any)?.cid ? String((file as any).cid).trim() : '';

  // If there is no usable url but we have a CID → use gateway + CID
  if ((!rawUrl || /^\s*$/.test(rawUrl)) && rawCid) {
    return `${GW}/${rawCid}`;
  }

  if (!rawUrl) return '';

  let u = rawUrl;

  // 1) Handle a bare CID (optionally with query, e.g. "?filename=...").
  const cidOnly = u.match(/^([A-Za-z0-9]{46,})(\?.*)?$/);
  if (cidOnly) {
    return `${GW}/${cidOnly[1]}${cidOnly[2] || ''}`;
  }

  // 2) Strip ipfs:// scheme and ALL leading "ipfs/" segments (1 or more), plus leading slashes.
  u = u.replace(/^ipfs:\/\//i, '');
  u = u.replace(/^\/+/, '');
  u = u.replace(/^(?:ipfs\/)+/i, ''); // <-- remove ipfs/ ipfs/ ... at the start

  // 3) If it’s not http(s) after stripping, prefix our gateway.
  if (!/^https?:\/\//i.test(u)) {
    u = `${GW}/${u}`;
  }

  // 4) Collapse ANY repeated "/ipfs/ipfs/" that may still exist anywhere in the URL.
  //    e.g. https://host/ipfs/ipfs/Qm... → https://host/ipfs/Qm...
  u = u.replace(/\/ipfs\/(?:ipfs\/)+/gi, '/ipfs/');

  return u;
}

function toMilestones(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch {}
  }
  return [];
}

// ---------- types ----------
type Props = {
  /** When rendered on project page, pass this project’s bid ids to filter by bidId */
  bidIds?: number[];
  /** Also pass proposalId to enable "Request Changes" API calls */
  proposalId?: number;
  /** Optional: pass bids so we can show milestone names */
  bids?: any[];
  /** Optional: parent refresher (e.g., to refresh Files tab) */
  onRefresh?: () => void;
};

export default function AdminProofs({ bidIds = [], proposalId, bids = [], onRefresh }: Props) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // “Request Changes” UI state (inline composer)
  const [crOpenFor, setCrOpenFor] = useState<number | null>(null);
  const [crComment, setCrComment] = useState('');
  const [crChecklist, setCrChecklist] = useState('');

  async function loadProofs() {
    try {
      setLoading(true);
      setError(null);
      const list = await getProofs(); // admin list from your Railway API

      let filtered = list;

      // Prefer filtering by bidIds (since /proofs rows often lack proposalId)
      if (Array.isArray(bidIds) && bidIds.length) {
        const set = new Set(bidIds.map((x) => Number(x)));
        filtered = list.filter((p) => set.has(Number((p as any)?.bidId)));
      } else if (Number.isFinite(proposalId as number)) {
        // Secondary filter: try proposalId if your backend supplies it
        const idNum = Number(proposalId);
        filtered = list.filter((p: any) => {
          const candidates = [p?.proposalId, p?.proposal_id, p?.proposalID];
          return candidates.some((v) => Number(v) === idNum);
        });
        if (!filtered.length) {
          console.warn('[AdminProofs] No rows matched proposalId; showing all to avoid empty list.');
          filtered = list;
        }
      }

      setProofs(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProofs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(bidIds), proposalId]);

  const refreshAll = async () => {
    await loadProofs();
    try {
      onRefresh?.();
      if (typeof window !== 'undefined' && (bidIds.length || Number.isFinite(proposalId as number))) {
        const detail = Number.isFinite(proposalId as number)
          ? { proposalId: Number(proposalId) }
          : undefined;
        window.dispatchEvent(new CustomEvent('proofs:updated', { detail }));
        window.dispatchEvent(new CustomEvent('proofs:changed', { detail }));
      }
    } catch {}
  };

  if (loading) return <div className="p-6">Loading proofs…</div>;
  if (error) return <div className="p-6 text-rose-600">{error}</div>;

  return (
    <div className="grid gap-6">
      {proofs.map((proof) => (
        <ProofCard
          key={proof.proofId ?? `${proof.bidId}-${proof.milestoneIndex}`}
          proof={proof}
          bids={bids}
          proposalId={proposalId}
          onRefresh={refreshAll}
          crOpenFor={crOpenFor}
          setCrOpenFor={setCrOpenFor}
          crComment={crComment}
          setCrComment={setCrComment}
          crChecklist={crChecklist}
          setCrChecklist={setCrChecklist}
        />
      ))}

      {proofs.length === 0 && (
        <div className="text-gray-500 text-center py-10 border rounded bg-white">
          No proofs submitted yet.
        </div>
      )}
    </div>
  );
}

function ProofCard({
  proof,
  bids = [],
  proposalId,
  onRefresh,
  crOpenFor, setCrOpenFor,
  crComment, setCrComment,
  crChecklist, setCrChecklist,
}: {
  proof: Proof;
  bids?: any[];
  proposalId?: number;
  onRefresh: () => void;
  crOpenFor: number | null;
  setCrOpenFor: (x: number | null) => void;
  crComment: string;
  setCrComment: (s: string) => void;
  crChecklist: string;
  setCrChecklist: (s: string) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [chat, setChat] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [running, setRunning] = useState(false);
  const [busyApprove, setBusyApprove] = useState(false);
  const [busyReject, setBusyReject] = useState(false);
  const [busyCR, setBusyCR] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canAnalyze = typeof proof.proofId === 'number' && !Number.isNaN(proof.proofId);

  // derive milestone name safely
  const bid = (bids || []).find((b) => Number(b.bidId) === Number(proof.bidId));
  const msArr = toMilestones(bid?.milestones);
  const m = msArr?.[Number(proof.milestoneIndex) || 0] || null;
  const milestoneLabel = (m?.name && String(m.name).trim()) || `Milestone ${Number(proof.milestoneIndex) + 1}`;

  async function onRun() {
    setErr(null);
    if (!canAnalyze) return;
    setRunning(true);
    try {
      await analyzeProof(proof.proofId!, prompt);
      await onRefresh();
    } catch (e: any) {
      setErr(e?.message || 'Agent 2 analysis failed');
    } finally {
      setRunning(false);
    }
  }

  async function onChat() {
    setErr(null);
    setChat('');
    if (!canAnalyze) return;
    setStreaming(true);
    try {
      await chatProof(
        proof.proofId!,
        [{ role: 'user', content: prompt || 'Explain this proof and the attached file(s). What evidence is strong? Any gaps?' }],
        (t) => setChat((prev) => prev + t),
      );
    } catch (e: any) {
      setErr(e?.message || 'Chat failed');
    } finally {
      setStreaming(false);
    }
  }

  // APPROVE — primary: /proofs/:proofId/approve; fallback: adminCompleteMilestone
async function handleApprove() {
  setErr(null);
  setBusyApprove(true);
  try {
    if (typeof proof.proofId === 'number' && !Number.isNaN(proof.proofId)) {
      try {
        console.debug('[approve] proofId=%s bidId=%s ms=%s', proof.proofId, proof.bidId, proof.milestoneIndex);
        await approveProof(proof.proofId);
      } catch (e: any) {
        const msg = String(e?.message || '');
        const shouldFallback =
          /\b(404|400)\b/.test(msg) || /not\s*found/i.test(msg);

        if (
          shouldFallback &&
          Number.isFinite(proof.bidId) &&
          Number.isFinite(proof.milestoneIndex)
        ) {
          console.debug('[approve→fallback] bidId=%s ms=%s', proof.bidId, proof.milestoneIndex);
          await adminCompleteMilestone(
            Number(proof.bidId),
            Number(proof.milestoneIndex),
            'Approved by admin'
          );
        } else {
          throw e; // real error → surface it
        }
      }
    } else if (Number.isFinite(proof.bidId) && Number.isFinite(proof.milestoneIndex)) {
      console.debug('[approve-fallback] bidId=%s ms=%s', proof.bidId, proof.milestoneIndex);
      await adminCompleteMilestone(
        Number(proof.bidId),
        Number(proof.milestoneIndex),
        'Approved by admin'
      );
    } else {
      throw new Error('Cannot approve: missing proofId and bid/milestone fallback.');
    }

    await onRefresh();
  } catch (e: any) {
    setErr(e?.message || 'Approve failed');
  } finally {
    setBusyApprove(false);
  }
}

  // REJECT — the legacy route that already worked for you
  async function handleReject() {
    setErr(null);
    setBusyReject(true);
    try {
      await rejectProof(proof.bidId, proof.milestoneIndex);
      await onRefresh();
    } catch (e: any) {
      setErr(e?.message || 'Reject failed');
    } finally {
      setBusyReject(false);
    }
  }

  // REQUEST CHANGES — posts to /api/proofs/change-requests
  async function handleCreateChangeRequest() {
    setErr(null);
    if (!Number.isFinite(proposalId as number)) {
      setErr('Missing proposalId on this page.');
      return;
    }
    setBusyCR(true);
    try {
      const body = {
        proposalId: Number(proposalId),
        milestoneIndex: Number(proof.milestoneIndex),
        comment: crComment.trim() || null,
        checklist: crChecklist.split(',').map(s => s.trim()).filter(Boolean),
        status: 'open',
      };
      const res = await fetch('/api/proofs/change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || j?.message || `HTTP ${res.status}`);
      setCrComment('');
      setCrChecklist('');
      setCrOpenFor(null);
      await onRefresh();
    } catch (e: any) {
      setErr(e?.message || 'Failed to create change request');
    } finally {
      setBusyCR(false);
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
            {proof.title || `Proof — ${milestoneLabel}`}
          </h2>
          <p className="text-sm text-gray-600 mb-2">
            Vendor: <span className="font-medium">{proof.vendorName || '—'}</span> &middot; Bid #{proof.bidId} &middot; {milestoneLabel}
          </p>
        </div>
        <span className={`px-2 py-1 text-xs rounded ${statusChip}`}>{proof.status}</span>
      </div>

      <p className="text-gray-700 mb-3 whitespace-pre-wrap">{proof.description || 'No description'}</p>

      {/* Attachments */}
      {Array.isArray(proof.files) && proof.files.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          {proof.files.map((file, i) => {
            const href = toGatewayUrl(file);
            const imgish = isImg(href) || isImg(file.name);
            if (imgish) {
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
                    alt={file.name}
                    className="h-32 w-full object-cover group-hover:scale-105 transition"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                    {file.name || href.split('/').pop()}
                  </div>
                </a>
              );
            }
            return (
              <div key={i} className="p-3 rounded border bg-gray-50">
                <p className="truncate text-sm">{file.name || href.split('/').pop()}</p>
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
            onClick={() => setCrOpenFor(crOpenFor === (proof.proofId || -1) ? null : (proof.proofId || -1))}
            className="px-3 py-1 text-sm bg-amber-600 text-white rounded"
            title="Create a change request for this milestone"
          >
            Request Changes
          </button>

          <button
            onClick={handleApprove}
            disabled={proof.status === 'approved' || busyApprove}
            className="px-3 py-1 text-sm bg-emerald-600 text-white rounded disabled:bg-gray-300"
          >
            {busyApprove ? 'Approving…' : 'Approve'}
          </button>

          <button
            onClick={handleReject}
            disabled={proof.status === 'rejected' || busyReject}
            className="px-3 py-1 text-sm bg-rose-600 text-white rounded disabled:bg-gray-300"
          >
            {busyReject ? 'Rejecting…' : 'Reject'}
          </button>
        </div>
      </div>

      {/* Change Request inline form */}
      {crOpenFor === (proof.proofId || -1) && (
        <div className="rounded border bg-white p-3 mt-2">
          <div className="text-sm font-medium mb-2">Request changes for {milestoneLabel}</div>
          <div className="grid gap-2">
            <label className="text-xs text-gray-600">Comment (what to change)</label>
            <textarea
              className="w-full border rounded p-2 text-sm"
              rows={3}
              value={crComment}
              onChange={(e) => setCrComment(e.target.value)}
            />
            <label className="text-xs text-gray-600">Checklist (comma separated)</label>
            <input
              className="w-full border rounded p-2 text-sm"
              value={crChecklist}
              onChange={(e) => setCrChecklist(e.target.value)}
              placeholder="e.g. add photo of invoice, include site coordinates"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateChangeRequest}
                disabled={busyCR}
                className="px-3 py-1 text-sm bg-amber-700 text-white rounded disabled:opacity-60"
              >
                {busyCR ? 'Sending…' : 'Send Request'}
              </button>
              <button
                onClick={() => setCrOpenFor(null)}
                type="button"
                className="px-3 py-1 text-sm bg-gray-200 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat stream output */}
      {chat && (
        <div className="rounded border bg-white p-3">
          <div className="text-xs text-slate-700 whitespace-pre-wrap font-mono">{chat}</div>
        </div>
      )}

      {err && <div className="text-xs text-rose-600 mt-2">{err}</div>}
    </div>
  );
}
