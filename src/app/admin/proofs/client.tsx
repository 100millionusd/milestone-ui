// src/app/admin/proofs/Client.tsx
'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import {
  getBids,
  getBid,
  payMilestone,
  completeMilestone,
  rejectMilestoneProof,
  getMilestoneArchive,
  archiveMilestone,
  unarchiveMilestone,
} from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useMilestonesUpdated from '@/hooks/useMilestonesUpdated';
import SafePayButton from '@/components/SafePayButton';
import { isPaidMs, isSafeInFlight, shouldShowPayButtons } from '@/lib/milestonePaymentState';

type TabKey = 'all' | 'needs-approval' | 'ready-to-pay' | 'paid' | 'no-proof' | 'archived';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs-approval', label: 'Needs Approval' },
  { key: 'ready-to-pay', label: 'Ready to Pay' },
  { key: 'paid', label: 'Paid' },
  { key: 'no-proof', label: 'No Proof' },
  { key: 'archived', label: 'Archived' },
];

const PENDING_LS_KEY = 'mx_pay_pending';
const PENDING_TS_PREFIX = 'mx_pay_pending_ts:';
const mkKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

type ArchiveInfo = { archived: boolean; archivedAt?: string | null; archiveReason?: string | null };

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
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');
  const [bids, setBids] = useState<any[]>(initialBids);
  const [loading, setLoading] = useState(initialBids.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [archMap, setArchMap] = useState<Record<string, ArchiveInfo>>({});
  const [pendingPay, setPendingPay] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? loadPendingFromLS() : new Set())
  );

  const bcRef = useRef<BroadcastChannel | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };

  // ----- helpers -----
  const addPending = (key: string) => {
    try { localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, String(Date.now())); } catch {}
    setPendingPay(prev => { const n = new Set(prev); n.add(key); savePendingToLS(n); return n; });
  };
  const removePending = (key: string) => {
    try { localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`); } catch {}
    setPendingPay(prev => { const n = new Set(prev); n.delete(key); savePendingToLS(n); return n; });
  };
  const isArchived = (bidId: number, idx: number) => !!archMap[mkKey(bidId, idx)]?.archived;

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
  function isCompleted(m: any): boolean {
    return m?.completed === true || m?.approved === true || m?.status === 'completed';
  }
  function isReadyToPay(m: any): boolean {
    return isCompleted(m) && !isPaidMs(m);
  }

  // ---- data load (also hydrates archive flags) ----
  const hydrateArchiveStatuses = useCallback(async (rows: any[]) => {
    const next: Record<string, ArchiveInfo> = {};
    const tasks: Promise<void>[] = [];
    for (const bid of rows || []) {
      const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
      for (let i = 0; i < ms.length; i++) {
        const key = mkKey(bid.bidId, i);
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
    await Promise.all(tasks);
    setArchMap(next);
  }, []);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getBids();
      const list = Array.isArray(rows) ? rows : [];
      setBids(list);

      // clear local-pending for any that are now paid
      for (const bid of list) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          if (isPaidMs(ms[i])) removePending(mkKey(bid.bidId, i));
        }
      }
      await hydrateArchiveStatuses(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [hydrateArchiveStatuses]);

  useEffect(() => { load(true); }, [load]);
  useMilestonesUpdated(() => load(true));

  // ---- broadcast channel ----
  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel('mx-payments'); bcRef.current = bc; } catch {}
    if (bc) {
      bc.onmessage = (e: MessageEvent) => {
        const { type, bidId, milestoneIndex } = (e?.data || {}) as any;
        if (type === 'mx:pay:queued') {
          addPending(mkKey(bidId, milestoneIndex));
          pollUntilPaid(bidId, milestoneIndex).catch(() => {});
          load(true);
        } else if (type === 'mx:pay:done') {
          removePending(mkKey(bidId, milestoneIndex));
          load(true);
        } else if (type === 'mx:ms:updated') {
          load(true);
        }
      };
    }
    return () => { try { bc?.close(); } catch {} };
  }, [load]);

  // ---- poll until paid (paid beats in-flight) ----
  async function pollUntilPaid(bidId: number, milestoneIndex: number, tries = 40, intervalMs = 3000) {
    const key = mkKey(bidId, milestoneIndex);

    for (let i = 0; i < tries; i++) {
      try {
        const bid = await getBid(bidId);
        const m = bid?.milestones?.[milestoneIndex];
        if (!m) {
          // keep polling
        } else if (isPaidMs(m)) {
          removePending(key);
          setBids(prev => prev.map(b => {
            if (b.bidId !== bidId) return b;
            const ms = Array.isArray(b.milestones) ? [...b.milestones] : [];
            ms[milestoneIndex] = { ...ms[milestoneIndex], ...m };
            return { ...b, milestones: ms };
          }));
          bcRef.current?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex });
          if (typeof router?.refresh === 'function') router.refresh();
          return;
        } else if (isSafeInFlight(m)) {
          // still in-flight; keep local pending
          setBids(prev => prev.map(b => {
            if (b.bidId !== bidId) return b;
            const ms = Array.isArray(b.milestones) ? [...b.milestones] : [];
            ms[milestoneIndex] = { ...ms[milestoneIndex], ...m };
            return { ...b, milestones: ms };
          }));
        }
      } catch {
        // ignore and keep polling
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    // Final reconciliation
    try {
      const bid = await getBid(bidId);
      const m = bid?.milestones?.[milestoneIndex];
      if (m && isPaidMs(m)) removePending(key);
    } catch {}
    if (typeof router?.refresh === 'function') router.refresh();
  }

  // ---- actions ----
  const emitMsUpdated = (detail: any) => {
    try { window.dispatchEvent(new CustomEvent('milestones:updated', { detail })); } catch {}
    try { bcRef.current?.postMessage({ type: 'mx:ms:updated', ...detail }); } catch {}
  };

  const handleApprove = async (bidId: number, idx: number, proof: string) => {
    if (!confirm('Approve this proof?')) return;
    try {
      setProcessing(`approve-${bidId}-${idx}`);
      await completeMilestone(bidId, idx, proof);
      await load(true);
      router.refresh();
    } finally {
      setProcessing(null);
    }
  };

  const handlePay = async (bidId: number, idx: number) => {
    if (!confirm('Release payment for this milestone?')) return;
    const key = mkKey(bidId, idx);
    try {
      setProcessing(`pay-${bidId}-${idx}`);
      await payMilestone(bidId, idx);
      addPending(key); // hide buttons immediately
      bcRef.current?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex: idx });
      pollUntilPaid(bidId, idx).catch(() => {});
    } catch (e: any) {
      alert(e?.message || 'Payment failed');
      removePending(key);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (bidId: number, idx: number) => {
    const reason = prompt('Reason for rejection (optional):') || '';
    if (!confirm('Reject this proof?')) return;
    try {
      setProcessing(`reject-${bidId}-${idx}`);
      await rejectMilestoneProof(bidId, idx, reason);
      await load(true);
    } finally {
      setProcessing(null);
    }
  };

  const handleArchive = async (bidId: number, idx: number) => {
    const reason = prompt('Archive reason (optional):') || '';
    try {
      setProcessing(`archive-${bidId}-${idx}`);
      await archiveMilestone(bidId, idx, reason || undefined);
      setArchMap(prev => ({ ...prev, [mkKey(bidId, idx)]: { archived: true, archiveReason: reason || null, archivedAt: new Date().toISOString() } }));
      emitMsUpdated({ bidId, milestoneIndex: idx, archived: true });
      await load(true); // ensure server & tabs are in sync
    } finally {
      setProcessing(null);
    }
  };

  const handleUnarchive = async (bidId: number, idx: number) => {
    try {
      setProcessing(`unarchive-${bidId}-${idx}`);
      await unarchiveMilestone(bidId, idx);
      setArchMap(prev => ({ ...prev, [mkKey(bidId, idx)]: { archived: false, archiveReason: null, archivedAt: null } }));
      emitMsUpdated({ bidId, milestoneIndex: idx, archived: false });
      await load(true);
    } finally {
      setProcessing(null);
    }
  };

  // ---- filters ----
  const archivedCount = useMemo(() => Object.values(archMap).filter(v => v.archived).length, [archMap]);

  const bidMatchesSearch = (bid: any) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${bid.vendorName || ''} ${bid.proposalId || ''} ${bid.bidId || ''} ${bid.walletAddress || ''}`.toLowerCase();
    const msMatch = (Array.isArray(bid.milestones) ? bid.milestones : [])
      .some((m: any) => (m?.name || '').toLowerCase().includes(q));
    return hay.includes(q) || msMatch;
  };

  function milestoneMatchesTab(m: any, bidId: number, idx: number): boolean {
    const archived = isArchived(bidId, idx);
    if (tab === 'archived') return archived;
    if (archived) return false;

    switch (tab) {
      case 'needs-approval': return hasProof(m) && !isCompleted(m);
      case 'ready-to-pay':   return isReadyToPay(m) && !isSafeInFlight(m) && !pendingPay.has(mkKey(bidId, idx));
      case 'paid':           return isPaidMs(m);
      case 'no-proof':       return !hasProof(m) && !isCompleted(m);
      case 'all':
      default:               return true;
    }
  }

  const filtered = useMemo(() => {
    return (bids || [])
      .filter(bidMatchesSearch)
      .map((bid) => {
        const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
        const withIdx = ms.map((m: any, idx: number) => ({ m, idx }));
        const visible =
          tab === 'all'
            ? withIdx.filter(({ idx }) => !isArchived(bid.bidId, idx))
            : withIdx.filter(({ m, idx }) => milestoneMatchesTab(m, bid.bidId, idx));
        return { ...bid, _withIdxVisible: visible };
      })
      .filter((b: any) => (b._withIdxVisible?.length ?? 0) > 0);
  }, [bids, tab, query, archMap, pendingPay]);

  // ---- ui ----
  if (loading) {
    return <div className="max-w-5xl mx-auto py-12"><h1 className="text-2xl font-bold mb-6">Submitted Proofs (Admin)</h1><div>Loading…</div></div>;
  }
  if (error) {
    return <div className="max-w-5xl mx-auto py-12"><h1 className="text-2xl font-bold mb-6">Submitted Proofs (Admin)</h1><div className="text-red-600">{error}</div></div>;
  }

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Submitted Proofs (Admin)</h1>
        <div className="flex items-center gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={[
                'px-3 py-1.5 rounded-full text-sm font-medium border',
                tab === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
              ].join(' ')}>
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

      <div className="mb-6">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by vendor, project, wallet, milestone…"
          className="w-full md:w-96 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <div className="text-5xl mb-3">{tab === 'archived' ? '📁' : '🗂️'}</div>
          <p className="text-slate-700">{tab === 'archived' ? 'No archived milestones.' : 'No items match this view.'}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filtered.map((bid: any) => (
            <div key={bid.bidId} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h2 className="text-lg font-semibold">{bid.vendorName} — Proposal #{bid.proposalId}</h2>
                  <p className="text-gray-600 text-sm">Bid ID: {bid.bidId}</p>
                </div>
                <Link href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`} className="text-sm text-blue-600 hover:underline">Manage →</Link>
              </div>

              <div className="space-y-4">
                {(bid._withIdxVisible as Array<{ m: any; idx: number }>).map(({ m, idx: origIdx }) => {
                  const key = mkKey(bid.bidId, origIdx);
                  const approved = isCompleted(m);
                  const localPending = pendingPay.has(key);
                  const showPay = shouldShowPayButtons({ approved, milestone: m, localPending });
                  const archived = isArchived(bid.bidId, origIdx);

                  return (
                    <div key={`${bid.bidId}:${origIdx}`} className="border-t pt-4 mt-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{m.name}</p>

                            {archived && <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 border">Archived</span>}
                            {approved && <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Approved</span>}
                            {(!isPaidMs(m) && (localPending || isSafeInFlight(m))) && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Payment Pending</span>
                            )}
                            {isPaidMs(m) && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Paid</span>
                            )}
                          </div>

                          <p className="text-sm text-gray-600">Amount: ${m.amount} | Due: {m.dueDate}</p>

                          {/* proof summary, elided for brevity */}
                          {m.paymentTxHash && (
                            <p className="text-sm text-green-600 mt-2 break-all">
                              Paid ✅ Tx: {m.paymentTxHash || m.txHash || m.safePaymentTxHash}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          {tab !== 'archived' && (
                            <>
                              {hasProof(m) && !approved && (
                                <button
                                  onClick={() => handleApprove(bid.bidId, origIdx, m.proof)}
                                  disabled={processing === `approve-${bid.bidId}-${origIdx}`}
                                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"
                                >
                                  {processing === `approve-${bid.bidId}-${origIdx}` ? 'Approving…' : 'Approve Proof'}
                                </button>
                              )}

                              {showPay && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handlePay(bid.bidId, origIdx)}
                                    disabled={processing === `pay-${bid.bidId}-${origIdx}` || localPending}
                                    className={['px-4 py-2 rounded text-white',
                                      (processing === `pay-${bid.bidId}-${origIdx}` || localPending)
                                        ? 'bg-green-600 opacity-60 cursor-not-allowed'
                                        : 'bg-green-600 hover:bg-green-700'].join(' ')}
                                    title="Release payment manually (EOA)"
                                  >
                                    {processing === `pay-${bid.bidId}-${origIdx}` ? 'Paying…'
                                      : localPending ? 'Payment Pending…'
                                      : 'Release Payment'}
                                  </button>

                                  <SafePayButton
                                    bidId={bid.bidId}
                                    milestoneIndex={origIdx}
                                    amountUSD={Number(m?.amount || 0)}
                                    disabled={processing === `pay-${bid.bidId}-${origIdx}` || localPending}
                                    onQueued={() => {
                                      addPending(key);
                                      bcRef.current?.postMessage({ type: 'mx:pay:queued', bidId: bid.bidId, milestoneIndex: origIdx });
                                      pollUntilPaid(bid.bidId, origIdx).catch(() => {});
                                      router.refresh();
                                    }}
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {!archived ? (
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
    </div>
  );
}
