// src/app/admin/proofs/Client.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  getBids,
  getBid,
  getBidsOnce,
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
import { useRouter } from "next/navigation";

// Tabs
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'needs-approval', label: 'Needs Approval' },
  { key: 'ready-to-pay', label: 'Ready to Pay' },
  { key: 'paid', label: 'Paid' },
  { key: 'no-proof', label: 'No Proof' },
  { key: 'archived', label: 'Archived' },
] as const;
type TabKey = typeof TABS[number]['key'];

type LightboxState = { urls: string[]; index: number } | null;
const mkKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

type ArchiveInfo = {
  archived: boolean;
  archivedAt?: string | null;
  archiveReason?: string | null;
};

// ===== Persist "payment pending" across refreshes =====
const PENDING_LS_KEY = 'mx_pay_pending';

function loadPendingFromLS(): Set<string> {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = localStorage.getItem(PENDING_LS_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function savePendingToLS(set: Set<string>) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(PENDING_LS_KEY, JSON.stringify([...set]));
  } catch {}
}

export default function Client({ initialBids = [] as any[] }: { initialBids?: any[] }) {
  const [loading, setLoading] = useState(initialBids.length === 0);
  const [bids, setBids] = useState<any[]>(initialBids);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const router = useRouter();

  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const [rejectedLocal, setRejectedLocal] = useState<Set<string>>(new Set());
  const mkRejectKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

  // Tabs + search
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  // server archive state map
  const [archMap, setArchMap] = useState<Record<string, ArchiveInfo>>({});

  // local "payment pending" while we poll the server after clicking Pay (persisted)
  const [pendingPay, setPendingPay] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? loadPendingFromLS() : new Set())
  );

  // Client-side caching for bids data
  const [dataCache, setDataCache] = useState<{
    bids: any[];
    lastUpdated: number;
  }>({ bids: [], lastUpdated: 0 });

  function addPending(key: string) {
    setPendingPay(prev => {
      const next = new Set(prev);
      next.add(key);
      savePendingToLS(next);
      return next;
    });
  }
  function removePending(key: string) {
    setPendingPay(prev => {
      const next = new Set(prev);
      next.delete(key);
      savePendingToLS(next);
      return next;
    });
  }

  useEffect(() => {
    // Only refetch on mount if server gave us nothing
    if (initialBids.length === 0) {
      loadProofs();
    } else {
      // we still want to hydrate archive state for the given bids
      hydrateArchiveStatuses(initialBids).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // listen for archive/unarchive from anywhere
  useMilestonesUpdated(loadProofs);

  async function loadProofs(forceRefresh = false) {
    const CACHE_TTL = 0; // 30 seconds
    
    // Use cache if available and not forcing refresh
    if (!forceRefresh && dataCache.bids.length > 0 && 
        Date.now() - dataCache.lastUpdated < CACHE_TTL) {
      setBids(dataCache.bids);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      const allBids = await getBidsOnce();
      const rows = Array.isArray(allBids) ? allBids : [];
      
      // Update cache
      setDataCache({
        bids: rows,
        lastUpdated: Date.now()
      });
      
      setBids(rows);

      // Clear local "pending" for any milestones that are now paid
      for (const bid of rows || []) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          if (isPaid(ms[i])) {
            removePending(mkKey(bid.bidId, i));
          }
        }
      }

      await hydrateArchiveStatuses(rows);
    } catch (e: any) {
      console.error('Error fetching proofs:', e);
      setError(e?.message || 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  async function hydrateArchiveStatuses(allBids: any[]) {
    const uniqueBidIds = [...new Set(allBids.map(bid => bid.bidId))];
    
    if (uniqueBidIds.length === 0) {
      setArchMap({});
      return;
    }

    try {
      const bulkArchiveStatus = await getBulkArchiveStatus(uniqueBidIds);
      updateBulkArchiveCache(bulkArchiveStatus);
      
      const nextMap: Record<string, ArchiveInfo> = { ...archMap };
      
      allBids.forEach(bid => {
        const bidArchiveStatus = bulkArchiveStatus[bid.bidId] || {};
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        
        ms.forEach((_, index) => {
          const key = mkKey(bid.bidId, index);
          if (nextMap[key] === undefined) {
            nextMap[key] = bidArchiveStatus[index] || { archived: false };
          }
        });
      });
      
      setArchMap(nextMap);
    } catch (error) {
      console.error('Failed to fetch bulk archive status:', error);
      // Fallback to individual requests if bulk fails
      await hydrateArchiveStatusesFallback(allBids);
    }
  }

  // Fallback function for individual requests
  async function hydrateArchiveStatusesFallback(allBids: any[]) {
    const tasks: Array<Promise<void>> = [];
    const nextMap: Record<string, ArchiveInfo> = { ...archMap };

    for (const bid of allBids || []) {
      const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
      for (let i = 0; i < ms.length; i++) {
        const key = mkKey(bid.bidId, i);
        if (nextMap[key] !== undefined) continue;
        tasks.push(
          (async () => {
            try {
              const j = await getMilestoneArchive(bid.bidId, i);
              const mi = j?.milestone ?? j;
              nextMap[key] = {
                archived: !!mi?.archived,
                archivedAt: mi?.archivedAt ?? null,
                archiveReason: mi?.archiveReason ?? null,
              };
            } catch {
              nextMap[key] = { archived: false };
            }
          })()
        );
      }
    }
    if (tasks.length) {
      await Promise.all(tasks);
      setArchMap(nextMap);
    }
  }

  // ---- Helpers for milestone state ----
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

  function isPaid(m: any): boolean {
    return !!(
      m?.paymentTxHash ||
      m?.paymentDate ||
      m?.txHash ||
      m?.paidAt ||
      m?.paid === true ||
      m?.isPaid === true ||
      m?.status === 'paid'
    );
  }

  function isReadyToPay(m: any): boolean {
    return isCompleted(m) && !isPaid(m);
  }

  function isArchived(bidId: number, milestoneIndex: number): boolean {
    return !!archMap[mkKey(bidId, milestoneIndex)]?.archived;
  }

  function milestoneMatchesTab(m: any, bidId: number, idx: number): boolean {
    const archived = isArchived(bidId, idx);

    if (tab === 'archived') return archived;
    if (archived) return false;

    switch (tab) {
      case 'needs-approval':
        return hasProof(m) && !isCompleted(m);
      case 'ready-to-pay':
        return isReadyToPay(m) && !pendingPay.has(mkKey(bidId, idx));
      case 'paid':
        return isPaid(m);
      case 'no-proof':
        return !hasProof(m) && !isCompleted(m);
      case 'all':
      default:
        return true;
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

  // Build a filtered view (preserve original milestone indexes)
  const filtered = useMemo(() => {
    return (bids || [])
      .filter(bidMatchesSearch)
      .map((bid) => {
        const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
        const withIdx = ms.map((m: any, idx: number) => ({ m, idx })); // keep original idx

        const visibleWithIdx =
          tab === 'all'
            ? withIdx.filter(({ idx }) => !isArchived(bid.bidId, idx))
            : withIdx.filter(({ m, idx }) => milestoneMatchesTab(m, bid.bidId, idx));

        return { ...bid, _withIdxAll: withIdx, _withIdxVisible: visibleWithIdx };
      })
      .filter((b: any) => (b._withIdxVisible?.length ?? 0) > 0);
  }, [bids, tab, query, archMap, pendingPay]);

  async function pollUntilPaid(bidId: number, milestoneIndex: number, tries = 20, intervalMs = 3000) {
  const key = mkKey(bidId, milestoneIndex);

  for (let i = 0; i < tries; i++) {
    try {
      // Bypass any caching
      const res = await fetch(`/api/bids/${bidId}?t=${Date.now()}`, { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const bid = await res.json();
        const m = bid?.milestones?.[milestoneIndex];

        if (m && isPaid(m)) {
          removePending(key);
          // update only this bid in-place
          setBids(prev => prev.map(b => (b.bidId === bidId ? bid : b)));
          router.refresh(); // make sure server components revalidate
          return;
        }
      } else {
        console.warn('pollUntilPaid non-200', res.status);
      }
    } catch (err) {
      console.error('Polling error:', err);
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }

  // last attempt: force a full refresh, and clear the sticky pending chip
  removePending(key);
  await loadProofs(true);
  router.refresh();
}

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
      const key = mkKey(bidId, milestoneIndex);
      addPending(key);
      pollUntilPaid(bidId, milestoneIndex).catch(() => {});
    } catch (e: any) {
      alert(e?.message || 'Payment failed');
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
      setRejectedLocal(prev => {
        const next = new Set(prev);
        next.add(mkRejectKey(bidId, milestoneIndex));
        return next;
      });
      await loadProofs();
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
      // Clear cache for this bid since archive status changed
      clearBulkArchiveCache(bidId);
      setArchMap(prev => ({
        ...prev,
        [mkKey(bidId, milestoneIndex)]: {
          archived: true,
          archiveReason: reason || null,
          archivedAt: new Date().toISOString(),
        },
      }));
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
      // Clear cache for this bid since archive status changed
      clearBulkArchiveCache(bidId);
      setArchMap(prev => ({
        ...prev,
        [mkKey(bidId, milestoneIndex)]: {
          archived: false,
          archiveReason: null,
          archivedAt: null,
        },
      }));
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
        const bidId = Number(bidIdStr);
        const idx = Number(idxStr);
        if (Number.isFinite(bidId) && Number.isFinite(idx)) {
          try { 
            await unarchiveMilestone(bidId, idx);
            clearBulkArchiveCache(bidId);
          } catch {}
        }
      }
      await hydrateArchiveStatuses(bids);
    } catch (e: any) {
      alert(e?.message || 'Unarchive all failed');
    } finally {
      setProcessing(null);
    }
  };

  // ---- Proof renderer (with lightbox support) ----
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const renderProof = (m: any) => {
    if (!m?.proof) return null;

    let parsed: any = null;
    try { parsed = JSON.parse(m.proof); } catch {}

    if (parsed && typeof parsed === 'object') {
      return (
        <div className="mt-2 space-y-2">
          {parsed.description && (
            <p className="text-sm text-gray-700">{parsed.description}</p>
          )}
          {parsed.files?.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {parsed.files.map((f: any, i: number) => {
                const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(f?.name || f?.url || '');
                if (isImage) {
                  const imageUrls = parsed.files
                    .filter((ff: any) => /\.(png|jpe?g|gif|webp|svg)$/i.test(ff?.name || ff?.url || ''))
                    .map((ff: any) => ff.url);
                  const startIndex = imageUrls.findIndex((u: string) => u === f.url);

                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setLightbox({ urls: imageUrls, index: Math.max(0, startIndex) });
                        setLightboxOpen(true);
                      }}
                      className="group relative overflow-hidden rounded border"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt={f.name || `Proof ${i}`}
                        className="h-32 w-full object-cover group-hover:scale-105 transition"
                      />
                      <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                        {f.name || 'Image'}
                      </div>
                    </button>
                  );
                }
                return (
                  <div key={i} className="p-3 rounded border bg-gray-50">
                    <p className="truncate text-sm">{f?.name || 'Attachment'}</p>
                    <a
                      href={f?.url}
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
        </div>
      );
    }

    const text = String(m.proof);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = [...text.matchAll(urlRegex)].map((match) => match[0]);

    return (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-gray-700 whitespace-pre-line">{text}</p>
        {urls.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {urls.map((url, i) => {
              const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
              if (isImage) {
                const imageUrls = urls.filter((u) => /\.(png|jpe?g|gif|webp|svg)$/i.test(u));
                const startIndex = imageUrls.findIndex((u) => u === url);
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setLightbox({ urls: imageUrls, index: Math.max(0, startIndex) });
                      setLightboxOpen(true);
                    }}
                    className="group relative overflow-hidden rounded border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Proof ${i}`}
                      className="h-32 w-full object-cover group-hover:scale-105 transition"
                    />
                  </button>
                );
              }
              return (
                <div key={i} className="p-3 rounded border bg-gray-50">
                  <p className="truncate text-sm">Attachment</p>
                  <a
                    href={url}
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
      </div>
    );
  };

  // ---- UI ----
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

      {/* Archive Controls (server) */}
      {tab === 'archived' && archivedCount > 0 && (
        <div className="mb-4 p-3 bg-slate-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">
              {archivedCount} milestone{archivedCount === 1 ? '' : 's'} archived
            </span>
            <button
              onClick={handleUnarchiveAll}
              disabled={processing === 'unarchive-all'}
              className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-white disabled:opacity-50"
            >
              {processing === 'unarchive-all' ? 'Working…' : 'Unarchive All'}
            </button>
          </div>
        </div>
      )}

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
          <div className="text-5xl mb-3">
            {tab === 'archived' ? '📁' : '🗂️'}
          </div>
          <p className="text-slate-700">
            {tab === 'archived' ? 'No archived milestones.' : 'No items match this view.'}
          </p>
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
                  const archived = isArchived(bid.bidId, origIdx);
                  const key = mkKey(bid.bidId, origIdx);
                  const showApprove = hasProof(m) && !isCompleted(m);
                  const payIsPending = pendingPay.has(key);
                  const showPay = isReadyToPay(m) && !payIsPending;

                  return (
                    <div key={`${bid.bidId}:${origIdx}`} className="border-t pt-4 mt-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{m.name}</p>

                            {archived && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 border">
                                Archived
                              </span>
                            )}

                            {isCompleted(m) && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                                Approved
                              </span>
                            )}

                            {payIsPending && !isPaid(m) && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                                Payment Pending
                              </span>
                            )}

                            {isPaid(m) && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">
                                Paid
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-gray-600">
                            Amount: ${m.amount} | Due: {m.dueDate}
                          </p>

                          {renderProof(m)}

                          {m.paymentTxHash && (
                            <p className="text-sm text-green-600 mt-2 break-all">
                              Paid ✅ Tx: {m.paymentTxHash || m.txHash || m.hash}
                            </p>
                          )}
                          {!hasProof(m) && !isCompleted(m) && (
                            <p className="text-sm text-amber-600 mt-2">
                              No proof submitted yet.
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2">
                          {tab !== 'archived' && (
                            <>
                              {showApprove && (
                                <button
                                  onClick={() => handleApprove(bid.bidId, origIdx, m.proof)}
                                  disabled={processing === `approve-${bid.bidId}-${origIdx}`}
                                  className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded disabled:opacity-50"
                                >
                                  {processing === `approve-${bid.bidId}-${origIdx}` ? 'Approving...' : 'Approve Proof'}
                                </button>
                              )}

                              {hasProof(m) && !isCompleted(m) && (() => {
                                const rKey = mkRejectKey(bid.bidId, origIdx);
                                const isProcessing = processing === `reject-${bid.bidId}-${origIdx}`;
                                const isLocked = rejectedLocal.has(rKey);
                                const disabled = isProcessing || isLocked;

                                return (
                                  <button
                                    onClick={() => handleReject(bid.bidId, origIdx)}
                                    disabled={disabled}
                                    className={[
                                      "px-4 py-2 rounded disabled:opacity-50",
                                      disabled ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                                               : "bg-red-600 hover:bg-red-700 text-white"
                                    ].join(" ")}
                                  >
                                    {isProcessing ? "Rejecting..." : (isLocked ? "Rejected" : "Reject")}
                                  </button>
                                );
                              })()}

 {showPay && (
  <div className="flex items-center gap-2">
    {/* Manual (existing) */}
    <button
      type="button"
      onClick={() => handlePay(bid.bidId, origIdx)}
      disabled={processing === `pay-${bid.bidId}-${origIdx}` || payIsPending}
      className={[
        "px-4 py-2 rounded text-white",
        (processing === `pay-${bid.bidId}-${origIdx}` || payIsPending)
          ? "bg-green-600 opacity-60 cursor-not-allowed"
          : "bg-green-600 hover:bg-green-700"
      ].join(" ")}
      title="Release payment manually (EOA)"
    >
      {processing === `pay-${bid.bidId}-${origIdx}` ? 'Paying...'
        : payIsPending ? 'Payment Pending…'
        : 'Release Payment'}
    </button>

    {/* SAFE (multisig) */}
    <SafePayButton
      bidId={bid.bidId}
      milestoneIndex={origIdx}
      amountUSD={Number(m?.amount || 0)}
      disabled={processing === `pay-${bid.bidId}-${origIdx}` || payIsPending}
      onQueued={() => {
        // mirror manual-flow UX: mark pending locally and start polling
        const key = mkKey(bid.bidId, origIdx);
        addPending(key);
        pollUntilPaid(bid.bidId, origIdx).catch(() => {});
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
                              title="Hide this milestone from default views (server archived)"
                            >
                              {processing === `archive-${bid.bidId}-${origIdx}` ? 'Archiving…' : 'Archive'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUnarchive(bid.bidId, origIdx)}
                              disabled={processing === `unarchive-${bid.bidId}-${origIdx}`}
                              className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded disabled:opacity-50"
                              title="Return this milestone to default views"
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

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.urls[lightbox.index]}
            alt="proof preview"
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />

          {lightbox.index > 0 && (
            <button
              className="absolute left-4 text-white text-3xl font-bold"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox({ ...lightbox, index: lightbox.index - 1 });
              }}
            >
              ‹
            </button>
          )}

          {lightbox.index < lightbox.urls.length - 1 && (
            <button
              className="absolute right-4 text-white text-3xl font-bold"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox({ ...lightbox, index: lightbox.index + 1 });
              }}
            >
              ›
            </button>
          )}

          <button
            className="absolute top-4 right-4 text-white text-2xl"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}