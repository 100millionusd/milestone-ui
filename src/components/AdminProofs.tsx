// src/components/AdminProofs.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import {
  rejectProof,
  analyzeProof,
  chatProof,
  adminCompleteMilestone,
  getMilestoneArchive,
  archiveMilestone,
  unarchiveMilestone,
  type Proof,
  API_BASE,
} from '@/lib/api';
import useMilestonesUpdated from '@/hooks/useMilestonesUpdated';

/* ============================
   Broadcast helpers (payments)
============================ */
function notifyMsChange(bidId: number, milestoneIndex: number) {
  try {
    window.dispatchEvent(new CustomEvent('milestones:updated', { detail: { bidId, milestoneIndex } }));
  } catch {}
  try {
    new BroadcastChannel('mx-payments').postMessage({ type: 'mx:ms:updated', bidId, milestoneIndex });
  } catch {}
}

/* ============================
   IPFS gateway + helpers
============================ */
const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')}/ipfs`
    : 'https://gateway.pinata.cloud/ipfs';

function isImg(s?: string) {
  if (!s) return false;
  return /\.(png|jpe?g|gif|webp|svg)(?=($|\?|#))/i.test(s);
}

// Build a safe https URL for any combination of {url, cid}
function toGatewayUrl(file: { url?: string; cid?: string } | undefined): string {
  const GW = PINATA_GATEWAY.replace(/\/+$/, '');
  if (!file) return '';

  const rawUrl = (file as any)?.url ? String((file as any).url).trim() : '';
  const rawCid = (file as any)?.cid ? String((file as any).cid).trim() : '';

  if ((!rawUrl || /^\s*$/.test(rawUrl)) && rawCid) return `${GW}/${rawCid}`;
  if (!rawUrl) return '';

  let u = rawUrl;

  // bare CID (optionally with query)
  const cidOnly = u.match(/^([A-Za-z0-9]{46,})(\?.*)?$/);
  if (cidOnly) return `${GW}/${cidOnly[1]}${cidOnly[2] || ''}`;

  // ipfs://, leading slashes, repeated ipfs/ segments
  u = u.replace(/^ipfs:\/\//i, '');
  u = u.replace(/^\/+/, '');
  u = u.replace(/^(?:ipfs\/)+/i, '');

  if (!/^https?:\/\//i.test(u)) u = `${GW}/${u}`;
  u = u.replace(/\/ipfs\/(?:ipfs\/)+/gi, '/ipfs/');

  return u;
}

function toMilestones(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {}
  }
  return [];
}

/* ============================
   Archive helpers (server)
============================ */
type AdminView = 'active' | 'archived';
type ArchiveInfo = { archived: boolean; archivedAt?: string | null; archiveReason?: string | null };

const msKey = (bidId: number, idx: number) => `${bidId}:${idx}`;

function proofKey(row: any): string {
  const pid = Number.isFinite(row?.proposalId) ? Number(row.proposalId) : -1;
  const bid = Number.isFinite(row?.bidId) ? Number(row.bidId) : -1;
  const ms = Number.isFinite(row?.milestoneIndex) ? Number(row.milestoneIndex) : -1;
  const rid = Number.isFinite(row?.proofId ?? row?.id) ? Number(row.proofId ?? row.id) : -1;
  return `${pid}:${bid}:${ms}:${rid}`;
}

// Robust milestone key (falls back to row key if bidId/milestoneIndex are missing)
function msKeyFromProof(p: any): string {
  const bidId = Number((p as any)?.bidId);
  const idx = Number((p as any)?.milestoneIndex);
  if (Number.isFinite(bidId) && Number.isFinite(idx)) return msKey(bidId, idx);
  return `row:${proofKey(p)}`;
}

// Dedupe a list to one row per milestone
function uniqByMilestone(list: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const p of list || []) {
    const k = msKeyFromProof(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/* =========================================
   EXPLORERS: chain-aware tx link builders
========================================= */
const CHAIN_EXPLORERS: Record<number, string> = {
  8453: 'https://basescan.org/tx/',              // Base mainnet
  84532: 'https://sepolia.basescan.org/tx/',     // Base Sepolia (if used)
  11155111: 'https://sepolia.etherscan.io/tx/',  // Ethereum Sepolia
  1: 'https://etherscan.io/tx/',                 // Ethereum mainnet (fallback)
};

function txUrlByChain(tx: string, chainId?: number) {
  const base =
    CHAIN_EXPLORERS[Number(chainId || 0)] ||
    (process.env.NEXT_PUBLIC_TX_EXPLORER_BASE || 'https://etherscan.io/tx/');
  const prefix = base.replace(/\/+$/, '/');
  return tx?.startsWith('http') ? tx : prefix + tx;
}

const shortTx = (tx: string) => (tx?.length > 12 ? `${tx.slice(0, 8)}…${tx.slice(-6)}` : tx);

// Prefer EOA, then Safe; read from proof OR milestone; include common aliases.
function pickTx(proof: any, m: any) {
  const cand =
    proof?.paymentTxHash ||
    proof?.safePaymentTxHash ||
    proof?.txHash ||
    proof?.lastTxHash ||
    proof?.payment_tx_hash ||
    proof?.chainTx ||
    m?.paymentTxHash ||
    m?.safePaymentTxHash ||
    m?.txHash ||
    m?.paidTxHash ||
    m?.payment_tx_hash ||
    m?.chainTx ||
    null;
  return typeof cand === 'string' && cand.trim() ? cand.trim() : null;
}

function pickChainId(proof: any, m: any) {
  return (
    Number(proof?.paymentChainId) ||
    Number(proof?.safePaymentChainId) ||
    Number(m?.paymentChainId) ||
    Number(m?.safePaymentChainId) ||
    Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || 11155111) // default: Sepolia
  );
}

/* ============================
   Component
============================ */
type Props = {
  bidIds?: number[];     // When rendered on project page, pass this project’s bid ids to filter by bidId
  proposalId?: number;   // Also pass proposalId to enable "Request Changes" API calls
  bids?: any[];          // Optional: pass bids so we can show milestone names
  onRefresh?: () => void;// Optional: parent refresher (e.g., to refresh Files tab)
};

export default function AdminProofs({ bidIds = [], proposalId, bids = [], onRefresh }: Props) {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // “Request Changes” UI state
  const [crOpenFor, setCrOpenFor] = useState<number | null>(null);
  const [crComment, setCrComment] = useState('');
  const [crChecklist, setCrChecklist] = useState('');

  // Archive view + server-backed status map
  const [view, setView] = useState<AdminView>('active');
  const [archMap, setArchMap] = useState<Record<string, ArchiveInfo>>({});

  async function loadProofs() {
    try {
      setLoading(true);
      setError(null);

      // 1) Determine the correct bidId (robust)
      const cleanBidIds = Array.isArray(bidIds)
        ? Array.from(new Set(bidIds.map(Number).filter(Number.isFinite)))
        : [];

      const inferredBidIds = Array.isArray(bids)
        ? Array.from(
            new Set(
              (bids as any[])
                .map((b: any) => Number(b?.bidId ?? b?.bid_id ?? b?.id))
                .filter(Number.isFinite)
            )
          )
        : [];

      const useBidId = cleanBidIds[0] ?? inferredBidIds[0];

      // 2) Build upstream URL (Railway Express). Server resolves proposalId→bidId if needed.
      const params = new URLSearchParams();
      if (Number.isFinite(useBidId)) {
        params.set('bidId', String(useBidId));
      } else if (Number.isFinite(proposalId as number)) {
        params.set('proposalId', String(Number(proposalId)));
      }

      const url = `${API_BASE}/proofs${params.toString() ? `?${params}` : ''}`;

      // 3) Fetch directly from JSON API
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
      const list = await res.json();
      const arr = Array.isArray(list) ? list : [];

      setProofs(arr);
      await hydrateArchiveStatuses(arr);
    } catch (err: any) {
      setError(err?.message || 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  async function hydrateArchiveStatuses(currentProofs: any[]) {
    const next: Record<string, ArchiveInfo> = { ...archMap };
    const tasks: Array<Promise<void>> = [];

    const pairs = (currentProofs || []).map(
      (p) => [Number(p?.bidId), Number(p?.milestoneIndex)] as const
    );

    for (const [bidId, idx] of pairs) {
      const key = msKey(bidId, idx);
      if (next[key] !== undefined) continue;
      tasks.push(
        (async () => {
          try {
            const j = await getMilestoneArchive(bidId, idx);
            const m = j?.milestone ?? j;
            next[key] = {
              archived: !!m?.archived,
              archivedAt: m?.archivedAt ?? null,
              archiveReason: m?.archiveReason ?? null,
            };
          } catch {
            next[key] = { archived: false };
          }
        })()
      );
    }

    if (tasks.length) {
      await Promise.all(tasks);
      setArchMap(next);
    }
  }

  useEffect(() => {
    loadProofs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(bidIds), proposalId, JSON.stringify(bids)]);

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

  // Re-hydrate when the list of proofs changes
  useEffect(() => {
    const arr = Array.isArray(proofs) ? proofs : [];
    hydrateArchiveStatuses(arr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofs]);

  // Re-hydrate when any page archives/unarchives a milestone
  useMilestonesUpdated(() => {
    const arr = Array.isArray(proofs) ? proofs : [];
    hydrateArchiveStatuses(arr);
  });

  // Snapshot rows with computed key + archive flag (single source of truth)
  const rows = uniqByMilestone(proofs).map((p) => {
    const k = msKeyFromProof(p);
    const isArchived = !!archMap[k]?.archived;
    return { p, k, isArchived };
  });

  // View derivation
  const visibleRows = rows.filter((r) => (view === 'archived' ? r.isArchived : !r.isArchived));

  // --- GROUPING LOGIC FOR BETTER VISIBILITY ---
  // Sort by: Needs Review (pending) -> then by ID
  const { pendingRows, processedRows } = useMemo(() => {
    const pending: typeof visibleRows = [];
    const processed: typeof visibleRows = [];
    visibleRows.forEach(row => {
        // Treat 'pending' as Needs Review. Everything else (approved, rejected, etc) is Processed.
        if (row.p.status === 'pending' || !row.p.status) {
            pending.push(row);
        } else {
            processed.push(row);
        }
    });
    return { pendingRows: pending, processedRows: processed };
  }, [visibleRows]);


  // Archive togglers
  async function archiveMs(bidId: number, idx: number, reason?: string) {
    const key = msKey(bidId, idx);
    await archiveMilestone(bidId, idx, reason);
    setArchMap(prev => ({
      ...prev,
      [key]: { archived: true, archivedAt: new Date().toISOString(), archiveReason: reason ?? null },
    }));
  }

  async function unarchiveMs(bidId: number, idx: number) {
    const key = msKey(bidId, idx);
    await unarchiveMilestone(bidId, idx);
    setArchMap(prev => ({
      ...prev,
      [key]: { archived: false, archivedAt: null, archiveReason: null },
    }));
  }

  const unarchiveAll = async () => {
    for (const p of uniqByMilestone(proofs)) {
      const bidId = Number(p.bidId);
      const idx = Number(p.milestoneIndex);
      if (Number.isFinite(bidId) && Number.isFinite(idx)) {
        try { await unarchiveMs(bidId, idx); } catch {}
      }
    }
  };

  const archivedCount = rows.reduce((n, r) => n + (r.isArchived ? 1 : 0), 0);

  if (loading) return <div className="p-8 text-gray-500 animate-pulse">Loading proofs…</div>;
  if (error) return <div className="p-6 text-rose-600 bg-rose-50 rounded border border-rose-200">{error}</div>;

  return (
    <div className="grid gap-6">
      {/* Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-lg border shadow-sm">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
          <button
            onClick={() => setView('active')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                view === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setView('archived')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                view === 'archived' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Archived ({archivedCount})
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          {view === 'archived' && archivedCount > 0 && (
            <button
              onClick={unarchiveAll}
              className="px-3 py-1.5 rounded text-slate-600 hover:bg-slate-100 text-sm border border-transparent hover:border-slate-200"
            >
              Unarchive all
            </button>
          )}
          <button
            onClick={refreshAll}
            className="flex items-center gap-2 px-4 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
          >
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* SECTION: Needs Review */}
      {pendingRows.length > 0 && (
        <div className="space-y-4">
           <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wider flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
             Needs Review ({pendingRows.length})
           </h3>
           {pendingRows.map(({ p, k, isArchived }) => (
             <ProofCardWrapper
                key={k}
                p={p}
                k={k}
                isArchived={isArchived}
                bids={bids}
                proposalId={proposalId}
                onRefresh={refreshAll}
                crOpenFor={crOpenFor}
                setCrOpenFor={setCrOpenFor}
                crComment={crComment}
                setCrComment={setCrComment}
                crChecklist={crChecklist}
                setCrChecklist={setCrChecklist}
                archMap={archMap}
                setArchMap={setArchMap}
                archiveMs={archiveMs}
                unarchiveMs={unarchiveMs}
                defaultExpanded={true} // Auto expand pending
             />
           ))}
        </div>
      )}

      {/* SECTION: Processed (Approved/Rejected) */}
      {processedRows.length > 0 && (
        <div className="space-y-4">
           {pendingRows.length > 0 && <hr className="border-slate-200 my-6" />}
           <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
             Processed / History
           </h3>
           {processedRows.map(({ p, k, isArchived }) => (
             <ProofCardWrapper
                key={k}
                p={p}
                k={k}
                isArchived={isArchived}
                bids={bids}
                proposalId={proposalId}
                onRefresh={refreshAll}
                crOpenFor={crOpenFor}
                setCrOpenFor={setCrOpenFor}
                crComment={crComment}
                setCrComment={setCrComment}
                crChecklist={crChecklist}
                setCrChecklist={setCrChecklist}
                archMap={archMap}
                setArchMap={setArchMap}
                archiveMs={archiveMs}
                unarchiveMs={unarchiveMs}
                defaultExpanded={false} // Auto collapse processed
             />
           ))}
        </div>
      )}

      {visibleRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
          <p className="text-slate-500 font-medium">
            {view === 'archived' ? 'No archived proofs found.' : 'No active proofs submitted yet.'}
          </p>
        </div>
      )}
    </div>
  );
}

/* ============================
   Proof Card Wrapper & Logic
============================ */
// This wrapper just extracts the logic for archiving so ProofCard is cleaner
function ProofCardWrapper(props: any) {
    const { p, k, isArchived, archiveMs, unarchiveMs, setArchMap, ...rest } = props;
    const bidId = Number(p.bidId);
    const idx = Number(p.milestoneIndex);

    const handleArchiveToggle = async (shouldArchive: boolean) => {
        if (!Number.isFinite(bidId) || !Number.isFinite(idx)) return;
        if (shouldArchive) {
            await archiveMs(bidId, idx);
        } else {
            await unarchiveMs(bidId, idx);
        }
    };

    return (
        <ProofCard
            proof={p}
            pkey={k}
            isArchived={isArchived}
            onArchive={handleArchiveToggle}
            {...rest}
        />
    );
}


/* ============================
   Proof Card (Redesigned)
============================ */
type ProofCardProps = {
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
  isArchived: boolean;
  pkey: string;
  onArchive: (archive: boolean) => void;
  defaultExpanded?: boolean;
};

function ProofCard(props: ProofCardProps) {
  const {
    proof,
    bids = [],
    proposalId,
    onRefresh,
    crOpenFor, setCrOpenFor,
    crComment, setCrComment,
    crChecklist, setCrChecklist,
    isArchived, onArchive,
    defaultExpanded = false,
  } = props;

  const router = useRouter();
  const [expanded, setExpanded] = useState(defaultExpanded);

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

  // ---------- derive tx + chainId (proof or milestone) ----------
  const tx = pickTx(proof, m);
  const chainId = pickChainId(proof, m);
  const isPaid = (m?.paid ?? (proof as any)?.paid) === true;

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

  // --- JSON-only Approve helper (prevents dumping HTML into the page) ---
  function isProbablyHtml(s: string | undefined | null) {
    return !!s && /<!doctype html|<html[\s>]/i.test(s);
  }

  // APPROVE — approve proof (if available) + complete milestone, then notify + refresh
  async function handleApprove() {
    setErr(null);
    setBusyApprove(true);
    try {
      const hasProofId = typeof proof.proofId === 'number' && !Number.isNaN(proof.proofId);
      const hasMs = Number.isFinite(proof.bidId) && Number.isFinite(proof.milestoneIndex);

      if (!hasProofId && !hasMs) {
        throw new Error('Cannot approve: missing proofId and bid/milestone fallback.');
      }

      // 1) Approve the proof via JSON API (tolerate legacy backend)
      if (hasProofId) {
        try {
          const r = await fetch(`${API_BASE}/proofs/${proof.proofId}/approve`, {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          });
          const ct = r.headers.get('content-type') || '';
          if (!r.ok) {
            if (ct.includes('application/json')) {
              const j = await r.json().catch(() => ({}));
              throw new Error(j?.error || j?.message || `HTTP ${r.status}`);
            } else {
              const txt = await r.text().catch(() => '');
              throw new Error(/<!doctype html|<html[\s>]/i.test(txt) ? 'Unexpected HTML from server.' : `HTTP ${r.status}`);
            }
          }
          if (ct.includes('application/json')) { await r.json().catch(() => ({})); }
        } catch (e: any) {
          const msg = String(e?.message || '');
          const mayFallback = /\b(404|400)\b/.test(msg) || /not\s*found/i.test(msg) || /Unexpected HTML/i.test(msg);
          if (!mayFallback || !hasMs) throw new Error(msg || 'Approve failed');
        }
      }

      // 2) ALWAYS complete the milestone (keeps /projects/[id] in sync)
      if (hasMs) {
        try {
          await adminCompleteMilestone(Number(proof.bidId), Number(proof.milestoneIndex), 'Approved by admin');
        } catch (e: any) {
          // ok if already completed/approved
          console.warn('[approve] milestone completion note:', e?.message || e);
        }
      }

      // 3) notify other views
      notifyMsChange(Number(proof.bidId), Number(proof.milestoneIndex));

      // 4) refresh
      onRefresh?.();
      router.refresh();
    } catch (e: any) {
      const msg = String(e?.message || '');
      setErr(/<!doctype html|<html[\s>]/i.test(msg) ? 'Approve failed (server returned HTML).' : msg || 'Approve failed');
    } finally {
      setBusyApprove(false);
    }
  }

  // REJECT — legacy route
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
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : proof.status === 'rejected'
      ? 'bg-rose-100 text-rose-800 border-rose-200'
      : 'bg-amber-100 text-amber-800 border-amber-200';

  const cardBorder = expanded 
    ? 'border-slate-300 shadow-md' 
    : 'border-slate-200 shadow-sm hover:border-slate-300';

  return (
    <div className={`bg-white rounded-xl border transition-all duration-200 ${cardBorder}`}>
      {/* Header / Summary Row (Click to toggle) */}
      <div 
        className="p-4 flex items-center justify-between cursor-pointer select-none group"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 overflow-hidden">
            {/* Icon / Status Indicator */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                proof.status === 'approved' ? 'bg-emerald-50 text-emerald-600' : 
                proof.status === 'rejected' ? 'bg-rose-50 text-rose-600' : 
                'bg-amber-50 text-amber-600'
            }`}>
                {proof.status === 'approved' ? '✓' : proof.status === 'rejected' ? '✕' : '?'}
            </div>

            <div className="min-w-0">
                <h2 className="font-bold text-slate-900 truncate text-base">
                    {milestoneLabel}
                </h2>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="truncate max-w-[150px]">Bid #{proof.bidId}</span>
                    <span>&middot;</span>
                    <span className="truncate font-medium text-slate-700">{proof.vendorName || 'Unknown Vendor'}</span>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
             {isPaid && (
                 <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-xs font-medium text-emerald-700">
                    <span>Paid</span>
                    {tx && <span className="opacity-50 text-[10px]">↗</span>}
                 </div>
             )}
            <span className={`px-3 py-1 text-xs font-semibold rounded-full border uppercase tracking-wide ${statusChip}`}>
                {proof.status || 'Pending'}
            </span>
            <div className={`transform transition-transform duration-200 text-slate-400 ${expanded ? 'rotate-180' : ''}`}>
                ▼
            </div>
        </div>
      </div>

      {/* Expandable Body */}
      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50/30 p-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: Evidence (Description + Files) */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Description */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Vendor Description</h4>
                        <div className="p-4 bg-white rounded-lg border border-slate-200 text-slate-700 text-sm whitespace-pre-wrap leading-relaxed shadow-sm">
                            {proof.description || <span className="text-slate-400 italic">No description provided.</span>}
                        </div>
                    </div>

                    {/* Attachments */}
                    <div>
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                            Attachments {Array.isArray(proof.files) && `(${proof.files.length})`}
                        </h4>
                        {Array.isArray(proof.files) && proof.files.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                                    className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-white hover:shadow-md transition-all"
                                    >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={href}
                                        alt={file.name}
                                        className="h-full w-full object-cover group-hover:scale-105 transition duration-500"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                        <p className="text-[10px] text-white truncate">{file.name}</p>
                                    </div>
                                    </a>
                                );
                                }
                                return (
                                <div key={i} className="p-3 rounded-lg border border-slate-200 bg-white hover:border-indigo-200 hover:shadow-sm transition-all flex flex-col justify-between h-full">
                                    <p className="truncate text-xs font-medium text-slate-700 mb-2" title={file.name}>{file.name || 'Unknown File'}</p>
                                    <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1"
                                    >
                                    View File ↗
                                    </a>
                                </div>
                                );
                            })}
                            </div>
                        ) : (
                            <div className="text-sm text-slate-400 italic border border-dashed border-slate-200 rounded p-4">No files attached.</div>
                        )}
                    </div>

                     {/* Payment Info Detail (if paid) */}
                     {isPaid && tx && (
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                            <span className="font-medium">Payment TX:</span>
                            <a
                                href={txUrlByChain(tx, chainId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline decoration-slate-300 hover:decoration-slate-500 hover:text-slate-700 truncate max-w-md"
                            >
                                {tx}
                            </a>
                        </div>
                    )}
                </div>

                {/* Right Column: Operations (AI, Actions, Admin) */}
                <div className="space-y-6">
                    
                    {/* AI Analysis Box */}
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
                        <div className="flex items-center justify-between mb-3">
                             <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wider flex items-center gap-1">
                                🤖 Agent 2 Analysis
                             </h4>
                        </div>
                        
                        {proof.aiAnalysis && (
                            <div className="mb-4 p-3 rounded bg-white/80 border border-indigo-100 shadow-sm">
                                <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                                    {typeof (proof as any).aiAnalysis?.summary === 'string'
                                    ? (proof as any).aiAnalysis.summary
                                    : JSON.stringify((proof as any).aiAnalysis, null, 2)}
                                </div>
                            </div>
                        )}

                        {/* Chat / Prompt */}
                        <div className="space-y-2">
                             <textarea
                                className="w-full border border-indigo-200 rounded-md p-2 text-xs focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                rows={2}
                                placeholder="Ask Agent 2 to verify specifics..."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={onRun}
                                    disabled={!canAnalyze || running}
                                    className="flex-1 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                                >
                                    {running ? 'Running...' : 'Re-Run Analysis'}
                                </button>
                                <button
                                    onClick={onChat}
                                    disabled={!canAnalyze || streaming}
                                    className="flex-1 px-3 py-1.5 rounded bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-medium disabled:opacity-50 transition-colors"
                                >
                                    {streaming ? 'Thinking...' : 'Quick Chat'}
                                </button>
                            </div>
                             {/* Chat Output Stream */}
                            {chat && (
                                <div className="mt-2 rounded border border-indigo-200 bg-white p-3 max-h-40 overflow-y-auto">
                                <div className="text-xs text-slate-700 whitespace-pre-wrap font-mono">{chat}</div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Primary Actions */}
                    <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Decision</h4>
                        
                        <div className="grid grid-cols-1 gap-2">
                             {/* Change Request Toggle */}
                            <button
                                onClick={() => setCrOpenFor(crOpenFor === (proof.proofId || -1) ? null : (proof.proofId || -1))}
                                className={`w-full py-2 text-xs font-medium rounded border transition-colors ${
                                    crOpenFor === (proof.proofId || -1) 
                                    ? 'bg-amber-50 border-amber-200 text-amber-700' 
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-amber-300 hover:text-amber-600'
                                }`}
                            >
                                {crOpenFor === (proof.proofId || -1) ? 'Cancel Request' : 'Request Changes'}
                            </button>
                            
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={handleReject}
                                    disabled={proof.status === 'rejected' || busyReject}
                                    className="flex-1 py-2 text-xs font-medium rounded bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50 disabled:bg-slate-100 disabled:text-slate-400 transition-colors"
                                >
                                    {busyReject ? '...' : 'Reject'}
                                </button>
                                <button
                                    onClick={handleApprove}
                                    disabled={proof.status === 'approved' || busyApprove}
                                    className="flex-1 py-2 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm disabled:opacity-50 disabled:bg-slate-300 transition-colors"
                                >
                                    {busyApprove ? 'Approving...' : 'Approve'}
                                </button>
                            </div>
                        </div>
                    </div>
                    
 {/* Server Actions (Archive) */}
                    <div className="mt-3">
                         {!isArchived ? (
                            <button
                            onClick={() => onArchive(true)}
                            className="w-full py-2 text-xs font-medium rounded border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                            >
                            Archive this milestone
                            </button>
                        ) : (
                            <button
                            onClick={() => onArchive(false)}
                            className="w-full py-2 text-xs font-medium rounded border border-indigo-200 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors shadow-sm"
                            >
                            Unarchive
                            </button>
                        )}
                    </div>

                </div> {/* End Right Column */}
            </div> {/* End Grid */}

            {/* Change Request Form (Full Width below grid if active) */}
            {crOpenFor === (proof.proofId || -1) && (
                <div className="mt-6 p-4 rounded-lg border border-amber-200 bg-amber-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2 mb-3 text-amber-800 font-medium text-sm">
                        <span>✍️ Request Changes</span>
                    </div>
                    <div className="grid gap-3">
                        <div>
                            <label className="block text-xs font-medium text-amber-800 mb-1">Comment (Instructions for vendor)</label>
                            <textarea
                            className="w-full border border-amber-200 rounded p-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            rows={3}
                            value={crComment}
                            onChange={(e) => setCrComment(e.target.value)}
                            placeholder="Explain what needs to be fixed..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-amber-800 mb-1">Checklist (Optional, comma separated)</label>
                            <input
                            className="w-full border border-amber-200 rounded p-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                            value={crChecklist}
                            onChange={(e) => setCrChecklist(e.target.value)}
                            placeholder="e.g. Upload clearer invoice, Add GPS coordinates"
                            />
                        </div>
                        <div className="flex justify-end pt-2">
                            <button
                                onClick={handleCreateChangeRequest}
                                disabled={busyCR}
                                className="px-4 py-2 text-sm bg-amber-700 hover:bg-amber-800 text-white rounded font-medium shadow-sm disabled:opacity-70 transition-colors"
                            >
                                {busyCR ? 'Sending Request...' : 'Send Change Request'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Global Error Display inside card */}
            {err && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-700 font-medium">
                    Error: {err}
                </div>
            )}

        </div>
      )}
    </div>
  );
}