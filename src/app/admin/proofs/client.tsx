// src/app/admin/proofs/Client.tsx
'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import {
  getBidsOnce,
  getBid,
  payMilestone,
  completeMilestone,
  rejectMilestoneProof,
  getMilestoneArchive,
  archiveMilestone,
  unarchiveMilestone,
  getBulkArchiveStatus,
  updateBulkArchiveCache,
  clearBulkArchiveCache,
} from '@/lib/api';
import Link from 'next/link';
import useMilestonesUpdated from '@/hooks/useMilestonesUpdated';
import SafePayButton from '@/components/SafePayButton';
import { useRouter } from 'next/navigation';
import {
  isPaid as msIsPaid,
  hasSafeMarker as msHasSafeMarker,
  isApproved as msIsApproved,
  canShowPayButtons as msCanShowPayButtons,
  isPaymentPending as msIsPaymentPending,
} from '@/lib/milestonePaymentState';

// ---------- Tabs ----------
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'needs-approval', label: 'Needs Approval' },
  { key: 'ready-to-pay', label: 'Ready to Pay' },
  { key: 'paid', label: 'Paid' },
  { key: 'no-proof', label: 'No Proof' },
  { key: 'archived', label: 'Archived' },
] as const;
type TabKey = typeof TABS[number]['key'];

// ---------- Helpers ----------
const mkKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

function hasProof(m: any): boolean {
  if (!m?.proof) return false;
  try {
    const p = JSON.parse(m.proof);
    if (p && typeof p === 'object') {
      if (typeof p.description === 'string' && p.description.trim()) return true;
      if (Array.isArray(p.files) && p.files.length > 0) return true;
    }
  } catch {
    if (typeof m.proof === 'string' && m.proof.trim().length > 0) return true;
  }
  return false;
}

function isApproved(m: any): boolean {
  return msIsApproved(m);
}

// Archiving
type ArchiveInfo = {
  archived: boolean;
  archivedAt?: string | null;
  archiveReason?: string | null;
};

// ---------- Local “pending pay” persistence ----------
const PENDING_LS_KEY = 'mx_pay_pending';

function loadPendingFromLS(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(PENDING_LS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function savePendingToLS(s: Set<string>) {
  try { localStorage.setItem(PENDING_LS_KEY, JSON.stringify(Array.from(s))); } catch {}
}

export default function Client({ initialBids = [] as any[] }: { initialBids?: any[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(initialBids.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [bids, setBids] = useState<any[]>(initialBids);
  const [processing, setProcessing] = useState<string | null>(null);

  // Tabs + search
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  // Archive state
  const [archMap, setArchMap] = useState<Record<string, ArchiveInfo>>({});

  // Local “payment pending” (only cleared when PAID)
  const [pendingPay, setPendingPay] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? loadPendingFromLS() : new Set())
  );
  const addPending = (key: string) =>
    setPendingPay(prev => { const next = new Set(prev); next.add(key); savePendingToLS(next); return next; });
  const removePending = (key: string) =>
    setPendingPay(prev => { const next = new Set(prev); next.delete(key); savePendingToLS(next); return next; });

  // cross-page payment sync
  const bcRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel('mx-payments'); bcRef.current = bc; } catch {}
    if (bc) {
      bc.onmessage = (e: MessageEvent) => {
        const { type, bidId, milestoneIndex } = (e?.data || {}) as any;
        if (!type) return;
        const k = mkKey(Number(bidId), Number(milestoneIndex));
        if (type === 'mx:pay:queued') {
          addPending(k);
          pollUntilPaid(Number(bidId), Number(milestoneIndex)).catch(() => {});
          void loadProofs(true);
        } else if (type === 'mx:pay:done') {
          removePending(k);
          void loadProofs(true);
        } else if (type === 'mx:ms:updated') {
          void loadProofs(true);
        }
      };
    }
    return () => { try { bc?.close(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // listen for archive/unarchive from anywhere
  useMilestonesUpdated(loadProofs);

  // Initial load
  useEffect(() => {
    if (initialBids.length === 0) {
      loadProofs();
    } else {
      hydrateArchiveStatuses(initialBids).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProofs(force = false) {
    setLoading(true);
    setError(null);
    try {
      const allBids = await getBidsOnce();
      const rows = Array.isArray(allBids) ? allBids : [];
      setBids(rows);

      // Clear pending only for milestones that are NOW paid
      for (const bid of rows) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        ms.forEach((m, i) => {
          if (msIsPaid(m)) removePending(mkKey(bid.bidId, i));
        });
      }

      await hydrateArchiveStatuses(rows);
    } catch (e: any) {
      setError(e?.message || 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  async function hydrateArchiveStatuses(allBids: any[]) {
    const uniqueBidIds = [...new Set(allBids.map(bid => bid.bidId))];
    if (uniqueBidIds.length === 0) { setArchMap({}); return; }
    try {
      const bulk = await getBulkArchiveStatus(uniqueBidIds);
      updateBulkArchiveCache(bulk);
      const next: Record<string, ArchiveInfo> = { ...archMap };
      allBids.forEach(bid => {
        const byMs = bulk[bid.bidId] || {};
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        ms.forEach((_, i) => {
          const key = mkKey(bid.bidId, i);
          if (next[key] === undefined) next[key] = byMs[i] || { archived: false };
        });
      });
      setArchMap(next);
    } catch {
      // Fallback: query per milestone
      const tasks: Array<Promise<void>> = [];
      const next: Record<string, ArchiveInfo> = { ...archMap };
      for (const bid of allBids) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          const key = mkKey(bid.bidId, i);
          if (next[key] !== undefined) continue;
          tasks.push(
            (async () => {
              try {
                const j = await getMilestoneArchive(bid.bidId, i);
                const mi = j?.milestone ?? j;
                next[key] = {
                  archived: !!mi?.archived,
                  archivedAt: mi?.archivedAt ?? null,
                  archiveReason: mi?.archiveReason ?? null,
                };
              } catch {
                next[key] = { archived: false };
              }
            })()
          );
        }
      }
      if (tasks.length) { await Promise.all(tasks); setArchMap(next); }
    }
  }

  // =========================
  // SAFE reconcile ping (admin route)
  // =========================
  async function reconcileSafe(bidId: number, milestoneIndex: number) {
    try {
      await fetch('/admin/oversight/reconcile-safe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ bidId, milestoneIndex }),
      }).catch(() => {});
    } catch {}
  }

  // =========================
  // POLL UNTIL PAID (SAFE + Manual)
  // =========================
  async function pollUntilPaid(
    bidId: number,
    milestoneIndex: number,
    tries = 600,            // ~30min @ 3s
    intervalMs = 3000
  ) {
    const key = mkKey(bidId, milestoneIndex);
    for (let i = 0; i < tries; i++) {
      try {
        // Ask backend to reconcile SAFE executions into the bid JSON
        await reconcileSafe(bidId, milestoneIndex);

        const bid = await getBid(bidId);
        const m = bid?.milestones?.[milestoneIndex];

        if (m && msIsPaid(m)) {
          removePending(key);
          setBids(prev => prev.map(b => {
            if (Number(b.bidId) !== bidId) return b;
            const ms = Array.isArray(b.milestones) ? [...b.milestones] : [];
            ms[milestoneIndex] = { ...ms[milestoneIndex], ...m };
            return { ...b, milestones: ms };
          }));
          try { bcRef.current?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex }); } catch {}
          if (typeof router?.refresh === 'function') router.refresh();
          return;
        }

        // Keep pending ON while any SAFE marker exists (queued/submitted/awaiting/…)
        if (m && msIsPaymentPending(m, /*localPending*/ true)) {
          setBids(prev => prev.map(b => {
            if (Number(b.bidId) !== bidId) return b;
            const ms = Array.isArray(b.milestones) ? [...b.milestones] : [];
            ms[milestoneIndex] = { ...ms[milestoneIndex], ...m };
            return { ...b, milestones: ms };
          }));
          if (typeof router?.refresh === 'function') router.refresh();
        }
      } catch (err: any) {
        if (err?.status === 401 || err?.status === 403) {
          // auth expired — keep UI pending to avoid re-enabling buttons
          setError('Your session expired. Please sign in again.');
          return;
        }
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }

    // Final check — only clear if we definitively see NOT paid and NOT in-flight.
    try {
      const bid = await getBid(bidId);
      const m = bid?.milestones?.[milestoneIndex];
      if (m && msIsPaid(m)) {
        removePending(key);
      } else if (!m || (!msIsPaid(m) && !msHasSafeMarker(m))) {
        // do NOT remove pending here anymore — keep it sticky until a human resolves,
        // to prevent buttons from re-appearing mid-flight on slow indexers.
      }
      setBids(prev => prev.map(b => {
        if (Number(b.bidId) !== bidId) return b;
        const ms = Array.isArray(b.milestones) ? [...b.milestones] : [];
        if (bid?.milestones?.[milestoneIndex]) {
          ms[milestoneIndex] = { ...ms[milestoneIndex], ...bid.milestones[milestoneIndex] };
        }
        return { ...b, milestones: ms };
      }));
    } catch {}
    if (typeof router?.refresh === 'function') router.refresh();
  }

  // =========================
  // Actions
  // =========================
  const handleApprove = async (bidId: number, milestoneIndex: number, proof: string) => {
    if (!confirm('Approve this proof?')) return;
    try {
      setProcessing(`approve-${bidId}-${milestoneIndex}`);
      await completeMilestone(bidId, milestoneIndex, proof);
      await loadProofs(true);
      router.refresh();
    } catch (e: any) {
      alert(e?.message || 'Failed to approve proof');
    } finally {
      setProcessing(null);
    }
  };

  const handlePay = async (bidId: number, milestoneIndex: number) => {
    if (!confirm('Release payment for this milestone?')) return;
    try {
      setProcessing(`pay-${bidId}-${milestoneIndex}`);
      await payMilestone(bidId, milestoneIndex);
      const k = mkKey(bidId, milestoneIndex);
      addPending(k);
      try { bcRef.current?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex }); } catch {}
      pollUntilPaid(bidId, milestoneIndex).catch(() => {});
    } catch (e: any) {
      alert(e?.message || 'Payment failed');
      // keep pending OFF only if call itself failed
      removePending(mkKey(bidId, milestoneIndex));
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (bidId: number, milestoneIndex: number) => {
    const reason = prompt('Reason for rejection (optional):') || '';
    if (!confirm('Reject this proof?')) return;
    try {
      setProcessing(`reject-${bidId}-${milestoneIndex}`);
      await rejectMilestoneProof(bidId, milestoneIndex, reason);
      await loadProofs(true);
    } catch (e: any) {
      alert(e?.message || 'Failed to reject proof');
    } finally {
      setProcessing(null);
    }
  };

  const handleArchive = async (bidId: number, milestoneIndex: number) => {
    const reason = prompt('Archive reason (optional):') || '';
    try {
      setProcessing(`archive-${bidId}-${milestoneIndex}`);
      await archiveMilestone(bidId, milestoneIndex, reason || undefined);
      clearBulkArchiveCache(bidId);
      setArchMap(prev => ({
        ...prev,
        [mkKey(bidId, milestoneIndex)]: {
          archived: true,
          archiveReason: reason || null,
          archivedAt: new Date().toISOString(),
        },
      }));
      try { window.dispatchEvent(new CustomEvent('milestones:updated', { detail: { bidId, milestoneIndex, archived: true, reason } })); } catch {}
      try { bcRef.current?.postMessage({ type: 'mx:ms:updated', bidId, milestoneIndex }); } catch {}
    } catch (e: any) {
      alert(e?.message || 'Archive failed');
    } finally {
      setProcessing(null);
    }
  };

  const handleUnarchive = async (bidId: number, milestoneIndex: number) => {
    try {
      setProcessing(`unarchive-${bidId}-${milestoneIndex}`);
      await unarchiveMilestone(bidId, milestoneIndex);
      clearBulkArchiveCache(bidId);
      setArchMap(prev => ({
        ...prev,
        [mkKey(bidId, milestoneIndex)]: { archived: false, archiveReason: null, archivedAt: null },
      }));
      try { window.dispatchEvent(new CustomEvent('milestones:updated', { detail: { bidId, milestoneIndex, archived: false } })); } catch {}
      try { bcRef.current?.postMessage({ type: 'mx:ms:updated', bidId, milestoneIndex }); } catch {}
    } catch (e: any) {
      alert(e?.message || 'Unarchive failed');
    } finally {
      setProcessing(null);
    }
  };

  const handleUnarchiveAll = async () => {
    if (!confirm('Unarchive ALL archived milestones?')) return;
    try {
      setProcessing('unarchive-all');
      const keys = Object.entries(archMap).filter(([, v]) => v.archived).map(([k]) => k);
      for (const k of keys) {
        const [bidIdStr, idxStr] = k.split('-');
        const bidId = Number(bidIdStr), idx = Number(idxStr);
        if (Number.isFinite(bidId) && Number.isFinite(idx)) {
          try { await unarchiveMilestone(bidId, idx); clearBulkArchiveCache(bidId); } catch {}
        }
      }
      await hydrateArchiveStatuses(bids);
      try { window.dispatchEvent(new CustomEvent('milestones:updated', { detail: { bulk: true } })); } catch {}
      try { bcRef.current?.postMessage({ type: 'mx:ms:updated', bulk: true }); } catch {}
    } catch (e: any) {
      alert(e?.message || 'Unarchive all failed');
    } finally {
      setProcessing(null);
    }
  };

  // ---------- Filters ----------
  const isArchived = (bidId: number, idx: number) => !!archMap[mkKey(bidId, idx)]?.archived;

  function milestoneMatchesTab(m: any, bidId: number, idx: number): boolean {
    const archived = isArchived(bidId, idx);
    if (tab === 'archived') return archived;
    if (archived) return false;

    const approved = isApproved(m);
    const paid = msIsPaid(m);
    const inFlight = msHasSafeMarker(m) || pendingPay.has(mkKey(bidId, idx));

    switch (tab) {
      case 'needs-approval': return hasProof(m) && !approved;
      case 'ready-to-pay':   return approved && !paid && !inFlight;
      case 'paid':           return paid;
      case 'no-proof':       return !hasProof(m) && !approved;
      case 'all':
      default:               return true;
    }
  }

  function bidMatchesSearch(bid: any): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${bid.vendorName || ''} ${bid.proposalId || ''} ${bid.bidId || ''} ${bid.walletAddress || ''}`.toLowerCase();
    const msMatch = (Array.isArray(bid.milestones) ? bid.milestones : [])
      .some((m: any) => (m?.name || '').toLowerCase().includes(q));
    return hay.includes(q) || msMatch;
  }

  const archivedCount = useMemo(
    () => Object.values(archMap).filter(v => v.archived).length,
    [archMap]
  );

  const filtered = useMemo(() => {
    return (bids || [])
      .filter(bidMatchesSearch)
      .map((bid) => {
        const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
        const withIdx = ms.map((m: any, idx: number) => ({ m, idx }));
        const visibleWithIdx =
          tab === 'all'
            ? withIdx.filter(({ idx }) => !isArchived(bid.bidId, idx))
            : withIdx.filter(({ m, idx }) => milestoneMatchesTab(m, bid.bidId, idx));
        return { ...bid, _withIdxAll: withIdx, _withIdxVisible: visibleWithIdx };
      })
      .filter((b: any) => (b._withIdxVisible?.length ?? 0) > 0);
  }, [bids, tab, query, archMap, pendingPay]);

  // ---------- UI ----------
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12">
        <h1 className="text-2xl font-bold mb-6">Submitted Proofs (Admin)</h1>
        <div className="text-center text-gray-600">Loading submitted proofs…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-5xl mx-auto py-12">
        <h1 className="text-2xl font-bold mb-6">Submitted Proofs (Admin)</h1>
        <div className="text-center text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      {/* Header + Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Submitted Proofs (Admin)</h1>
        <div className="flex items-center gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium border',
                tab === t.key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
              ].join(' ')}
            >
              {t.label}
              {t.key === 'archived' && archivedCount > 0 && (
                <span className="ml-1 bg-slate-600 text-white rounded-full px-1.5 py-0.5 text-xs min-w-[20px]">
                  {archivedCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by vendor, project, wallet, milestone…"
          className="w-full md:w-96 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <div className="text-5xl mb-3">🗂️</div>
          <p className="text-slate-700">No items match this view.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((bid: any) => (
            <div key={bid.bidId} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h2 className="text-lg font-semibold">
                    {bid.vendorName} — Proposal #{bid.proposalId}
                  </h2>
                  <p className="text-gray-600 text-sm">Bid ID: {bid.bidId}</p>
                </div>
                <Link
                  href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Manage →
                </Link>
              </div>

              <div className="space-y-4">
                {(bid._withIdxVisible as Array<{ m: any; idx: number }>).map(({ m, idx: origIdx }) => {
                  const k = mkKey(bid.bidId, origIdx);

                  const approved = isApproved(m);
                  const paid     = msIsPaid(m);
                  const inflight = msHasSafeMarker(m) || pendingPay.has(k);

                  // Strict state machine for buttons/chips
                  const showButtons = msCanShowPayButtons(m, { approved, localPending: pendingPay.has(k) });

                  return (
                    <div key={`${bid.bidId}:${origIdx}`} className="border-t pt-4 mt-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{m.name}</p>

                            {approved && !paid && !inflight && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                                Approved
                              </span>
                            )}

                            {!paid && inflight && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                                Payment Pending
                              </span>
                            )}

                            {paid && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                Paid
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-600">
                            Amount: ${m.amount} | Due: {m.dueDate}
                          </p>

                          {/* Proof renderer (compact) */}
                          {(() => {
                            if (!m?.proof) return null;
                            try {
                              const parsed = JSON.parse(m.proof);
                              if (parsed?.description || (Array.isArray(parsed?.files) && parsed.files.length)) {
                                return (
                                  <div className="mt-2 space-y-1 text-sm text-gray-700">
                                    {parsed.description && <p>{parsed.description}</p>}
                                    {Array.isArray(parsed.files) && parsed.files.length > 0 && (
                                      <ul className="list-disc list-inside">
                                        {parsed.files.slice(0, 3).map((f: any, i: number) => (
                                          <li key={i} className="truncate">
                                            <a href={f?.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                              {f?.name || f?.url || 'file'}
                                            </a>
                                          </li>
                                        ))}
                                        {parsed.files.length > 3 && <li className="opacity-60">…</li>}
                                      </ul>
                                    )}
                                  </div>
                                );
                              }
                            } catch {}
                            return (
                              <div className="mt-2 text-sm text-gray-700 whitespace-pre-line">
                                {String(m.proof)}
                              </div>
                            );
                          })()}

                          {(m.paymentTxHash || m.safePaymentTxHash) && (
                            <p className="text-sm text-green-600 mt-2 break-all">
                              Paid ✅ Tx: {m.paymentTxHash || m.safePaymentTxHash}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-2">
                          {hasProof(m) && !approved && (
                            <button
                              onClick={() => handleApprove(bid.bidId, origIdx, m.proof)}
                              disabled={processing === `approve-${bid.bidId}-${origIdx}`}
                              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"
                            >
                              {processing === `approve-${bid.bidId}-${origIdx}` ? 'Approving...' : 'Approve Proof'}
                            </button>
                          )}

                          {approved && showButtons && (
                            <div className="flex items-center gap-2">
                              {/* Manual */}
                              <button
                                type="button"
                                onClick={() => handlePay(bid.bidId, origIdx)}
                                disabled={processing === `pay-${bid.bidId}-${origIdx}`}
                                className={[
                                  'px-4 py-2 rounded text-white',
                                  processing === `pay-${bid.bidId}-${origIdx}` ? 'bg-green-600 opacity-60 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                                ].join(' ')}
                                title="Release payment manually (EOA)"
                              >
                                {processing === `pay-${bid.bidId}-${origIdx}` ? 'Paying...' : 'Release Payment'}
                              </button>

                              {/* SAFE */}
                              <SafePayButton
                                bidId={bid.bidId}
                                milestoneIndex={origIdx}
                                amountUSD={Number(m?.amount || 0)}
                                disabled={processing === `pay-${bid.bidId}-${origIdx}`}
                                onQueued={() => {
                                  const key = mkKey(bid.bidId, origIdx);
                                  addPending(key);
                                  try { bcRef.current?.postMessage({ type: 'mx:pay:queued', bidId: bid.bidId, milestoneIndex: origIdx }); } catch {}
                                  pollUntilPaid(bid.bidId, origIdx).catch(() => {});
                                  router.refresh();
                                }}
                              />
                            </div>
                          )}

                          {/* Archive / Unarchive */}
                          {!isArchived(bid.bidId, origIdx) ? (
                            <button
                              onClick={() => handleArchive(bid.bidId, origIdx)}
                              disabled={processing === `archive-${bid.bidId}-${origIdx}`}
                              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded disabled:opacity-50"
                            >
                              {processing === `archive-${bid.bidId}-${origIdx}` ? 'Archiving…' : 'Archive'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnarchive(bid.bidId, origIdx)}
                              disabled={processing === `unarchive-${bid.bidId}-${origIdx}`}
                              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded disabled:opacity-50"
                            >
                              {processing === `unarchive-${bid.bidId}-${origIdx}` ? 'Unarchiving…' : 'Unarchive'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Archive Controls (server) */}
      {tab === 'archived' && archivedCount > 0 && (
        <div className="mt-6 p-3 bg-slate-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">
              {archivedCount} milestone{archivedCount === 1 ? '' : 's'} archived
            </span>
            <button
              onClick={handleUnarchiveAll}
              disabled={processing === 'unarchive-all'}
              className="px-3 py-1 text-sm border border-slate-300 rounded disabled:opacity-50"
            >
              {processing === 'unarchive-all' ? 'Working…' : 'Unarchive All'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
