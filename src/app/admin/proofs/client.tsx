'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import {
  getBids, // kept to avoid unused import churn
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
import { useRouter } from 'next/navigation';
import {
  isPaid as msIsPaid,
  hasSafeMarker as msHasSafeMarker,
  isApproved as msIsApproved,
} from '@/lib/milestonePaymentState';

// Tabs
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'needs-approval', label: 'Needs Approval' },
  { key: 'ready-to-pay', label: 'Ready to Pay' },
  { key: 'paid', label: 'Paid' },
  { key: 'no-proof', label: 'No Proof' },
  { key: 'archived', label: 'Archived' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

type LightboxState = { urls: string[]; index: number } | null;
const mkKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

type ArchiveInfo = {
  archived: boolean;
  archivedAt?: string | null;
  archiveReason?: string | null;
};

// ===== Persist "payment pending" across refreshes =====
const PENDING_LS_KEY = 'mx_pay_pending';
const PENDING_TS_PREFIX = 'mx_pay_pending_ts:'; // retained for backwards-compat (no TTL logic)

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
  try {
    localStorage.setItem(PENDING_LS_KEY, JSON.stringify(Array.from(s)));
  } catch {}
}

// Resolve API base
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  process.env.NEXT_PUBLIC_API_URL ||
  ''
).replace(/\/+$/, '');
function apiUrl(path: string) {
  if (API_BASE) return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  return path; // assume proxy in dev
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
function isCompletedLoose(m: any): boolean {
  return (
    m?.completed === true ||
    m?.approved === true ||
    String(m?.status ?? '').toLowerCase() === 'completed'
  );
}
function readSafeTxHash(m: any): string | null {
  return (
    m?.safeTxHash ||
    m?.safe_tx_hash ||
    m?.safePaymentTxHash ||
    m?.safe_payment_tx_hash ||
    null
  );
}

// ========== Component ==========
export default function Client({ initialBids = [] as any[] }: { initialBids?: any[] }) {
  const router = useRouter();

  const [loading, setLoading] = useState(initialBids.length === 0);
  const [bids, setBids] = useState<any[]>(initialBids);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false); // kept
  const [rejectedLocal, setRejectedLocal] = useState<Set<string>>(new Set());
  const mkRejectKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

  // Tabs + search
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  // server archive state map
  const [archMap, setArchMap] = useState<Record<string, ArchiveInfo>>({});

  // local "payment pending" while we poll the server after clicking Pay (persisted). NO TTL auto-clear.
  const [pendingPay, setPendingPay] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? loadPendingFromLS() : new Set())
  );

  // one active poller per milestone key
  const activePollers = useRef<Set<string>>(new Set());

  // cross-page payment sync
  const bcRef = useRef<BroadcastChannel | null>(null);
  function emitPayQueued(bidId: number, milestoneIndex: number) {
    try {
      bcRef.current?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex });
    } catch {}
  }
  function emitPayDone(bidId: number, milestoneIndex: number) {
    try {
      bcRef.current?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex });
    } catch {}
  }
  function emitMilestonesUpdated(detail: any) {
    try {
      window.dispatchEvent(new CustomEvent('milestones:updated', { detail }));
    } catch {}
    try {
      bcRef.current?.postMessage({ type: 'mx:ms:updated', ...detail });
    } catch {}
  }
  function addPending(key: string) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, String(Date.now()));
      } catch {}
    }
    setPendingPay(prev => {
      const next = new Set(prev);
      next.add(key);
      savePendingToLS(next);
      return next;
    });
  }
  function removePending(key: string) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`);
      } catch {}
    }
    setPendingPay(prev => {
      const next = new Set(prev);
      next.delete(key);
      savePendingToLS(next);
      return next;
    });
  }

  // listen for archive/unarchive from anywhere
  useMilestonesUpdated(loadProofs);

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('mx-payments');
      bcRef.current = bc;
    } catch {}

    if (bc) {
      bc.onmessage = (e: MessageEvent) => {
        const { type, bidId, milestoneIndex } = (e?.data || {}) as any;
        if (!type) return;

        if (type === 'mx:pay:queued') {
          const key = mkKey(bidId, milestoneIndex);
          addPending(key);
          pollUntilPaid(bidId, milestoneIndex).catch(() => {});
        } else if (type === 'mx:pay:done') {
          removePending(mkKey(bidId, milestoneIndex));
          loadProofs(true);
        } else if (type === 'mx:ms:updated') {
          loadProofs(true);
        }
      };
    }

    if (initialBids.length === 0) {
      loadProofs();
    } else {
      hydrateArchiveStatuses(initialBids).catch(() => {});
      // resume any pending pollers
      for (const bid of initialBids) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          const key = mkKey(bid.bidId, i);
          if (pendingPay.has(key) && !msIsPaid(ms[i])) {
            pollUntilPaid(bid.bidId, i).catch(() => {});
          }
        }
      }
    }

    return () => {
      try {
        bc?.close();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- DATA LOAD ----
  async function loadProofs(forceRefresh = false) {
    setLoading(true);
    setError(null);
    try {
      const allBids = await getBidsOnce();
      const rows = Array.isArray(allBids) ? allBids : [];

      setBids(rows);

      // Clear local "pending" for milestones that are now PAID
      for (const bid of rows || []) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          if (msIsPaid(ms[i])) {
            removePending(mkKey(bid.bidId, i));
          }
        }
      }

      // Resume polling if something still pending and not paid
      for (const bid of rows || []) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          const key = mkKey(bid.bidId, i);
          if (pendingPay.has(key) && !msIsPaid(ms[i])) {
            pollUntilPaid(bid.bidId, i).catch(() => {});
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
      await hydrateArchiveStatusesFallback(allBids);
    }
  }

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

  // ---- SAFE reconcile helpers ----
  async function reconcileSafe(): Promise<void> {
    try {
      await fetch(apiUrl('/admin/oversight/reconcile-safe'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch {}
  }
  async function fetchSafeTx(hash: string): Promise<{ isExecuted: boolean; txHash?: string | null } | null> {
    try {
      const r = await fetch(apiUrl(`/safe/tx/${encodeURIComponent(hash)}`), {
        method: 'GET',
        credentials: 'include',
      });
      if (!r.ok) return null;
      const j = await r.json();
      return { isExecuted: !!j?.isExecuted, txHash: j?.txHash ?? null };
    } catch {
      return null;
    }
  }

  // ==== POLL UNTIL PAID (strict; single poller per milestone) ====
  async function pollUntilPaid(
    bidId: number,
    milestoneIndex: number,
    tries = 200,
    intervalMs = 3000
  ) {
    const key = mkKey(bidId, milestoneIndex);
    if (activePollers.current.has(key)) return; // already polling
    activePollers.current.add(key);

    try {
      for (let i = 0; i < tries; i++) {
        // ask server to reconcile safe payments → released
        await reconcileSafe();

        // fetch latest bid and inspect milestone
        let latest: any;
        try {
          latest = await getBid(bidId);
        } catch (err: any) {
          if (err?.status === 401 || err?.status === 403) {
            setError('Your session expired. Please sign in again.');
            break;
          }
        }

        const m = latest?.milestones?.[milestoneIndex];

        // optional accelerator: if we see a Safe tx hash, check if it's executed and re-trigger reconcile
        const safeHash = readSafeTxHash(m || {});
        if (safeHash) {
          const st = await fetchSafeTx(safeHash);
          if (st?.isExecuted && st?.txHash) {
            await reconcileSafe();
          }
        }

        // re-fetch after potential reconcile
        const fresh = await getBid(bidId).catch(() => latest);
        const fm = fresh?.milestones?.[milestoneIndex];

        if (fm && msIsPaid(fm)) {
          // DONE → clear local pending, update row, broadcast
          removePending(key);
          setBids(prev =>
            prev.map(b => {
              const match = ((b as any).bidId ?? (b as any).id) === bidId;
              if (!match) return b;
              const ms = Array.isArray((b as any).milestones) ? [...(b as any).milestones] : [];
              ms[milestoneIndex] = { ...ms[milestoneIndex], ...fm };
              return { ...b, milestones: ms };
            })
          );
          try {
            (await import('@/lib/api')).invalidateBidsCache?.();
          } catch {}
          if (typeof router?.refresh === 'function') router.refresh();
          emitPayDone(bidId, milestoneIndex);
          return;
        }

        await new Promise(r => setTimeout(r, intervalMs));
      }

      // Final check & cleanup (only clear if neither paid nor in-flight)
      try {
        const bid = await getBid(bidId);
        const m = bid?.milestones?.[milestoneIndex];
        if (!m || (!msIsPaid(m) && !msHasSafeMarker(m))) {
          removePending(key);
        }
        setBids(prev =>
          prev.map(b => {
            const match = ((b as any).bidId ?? (b as any).id) === bidId;
            if (!match) return b;
            const ms = Array.isArray((b as any).milestones) ? [...(b as any).milestones] : [];
            const srvM = (bid as any)?.milestones?.[milestoneIndex];
            if (srvM) ms[milestoneIndex] = { ...ms[milestoneIndex], ...srvM };
            return { ...b, milestones: ms };
          })
        );
      } catch {}
      if (typeof router?.refresh === 'function') router.refresh();
    } finally {
      activePollers.current.delete(key);
    }
  }

  // ---- Actions ----
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
      await payMilestone(bidId, milestoneIndex); // returns { ok: true, status: 'pending' }
      const key = mkKey(bidId, milestoneIndex);
      addPending(key);
      emitPayQueued(bidId, milestoneIndex);
      // start strict polling until server marks PAID
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
      clearBulkArchiveCache(bidId);
      setArchMap(prev => ({
        ...prev,
        [mkKey(bidId, milestoneIndex)]: {
          archived: true,
          archiveReason: reason || null,
          archivedAt: new Date().toISOString(),
        },
      }));

      emitMilestonesUpdated({ bidId, milestoneIndex, archived: true, reason });
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
        [mkKey(bidId, milestoneIndex)]: {
          archived: false,
          archiveReason: null,
          archivedAt: null,
        },
      }));

      emitMilestonesUpdated({ bidId, milestoneIndex, archived: false });
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
      const keys = Object.entries(archMap)
        .filter(([, v]) => v.archived)
        .map(([k]) => k);
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
      emitMilestonesUpdated({ bulk: true });
    } catch (e: any) {
      alert(e?.message || 'Unarchive all failed');
    } finally {
      setProcessing(null);
    }
  };

  // ---- Proof renderer (with lightbox support) ----
  const renderProof = (m: any) => {
    if (!m?.proof) return null;

    let parsed: any = null;
    try {
      parsed = JSON.parse(m.proof);
    } catch {}

    if (parsed && typeof parsed === 'object') {
      return (
        <div className="mt-2 space-y-2">
          {parsed.description && <p className="text-sm text-gray-700">{parsed.description}</p>}
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
    const urls = [...text.matchAll(urlRegex)].map(match => match[0]);

    return (
      <div className="mt-2 space-y-2">
        <p className="text-sm text-gray-700 whitespace-pre-line">{text}</p>
        {urls.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {urls.map((url, i) => {
              const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(url);
              if (isImage) {
                const imageUrls = urls.filter(u => /\.(png|jpe?g|gif|webp|svg)$/i.test(u));
                const startIndex = imageUrls.findIndex(u => u === url);
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

  // ---- Filters / search ----
  function isArchived(bidId: number, milestoneIndex: number): boolean {
    return !!archMap[mkKey(bidId, milestoneIndex)]?.archived;
  }

  function milestoneMatchesTab(m: any, bidId: number, idx: number): boolean {
    const archived = isArchived(bidId, idx);

    if (tab === 'archived') return archived;
    if (archived) return false;

    const key = mkKey(bidId, idx);
    const approved = msIsApproved(m) || isCompletedLoose(m);
    const paid = msIsPaid(m);
    const inflight = msHasSafeMarker(m);
    const localPending = pendingPay.has(key);

    switch (tab) {
      case 'needs-approval':
        return hasProof(m) && !approved;
      case 'ready-to-pay':
        return approved && !paid && !inflight && !localPending;
      case 'paid':
        return paid;
      case 'no-proof':
        return !hasProof(m) && !approved;
      case 'all':
      default:
        return true;
    }
  }

  function bidMatchesSearch(bid: any): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${bid.vendorName || ''} ${bid.proposalId || ''} ${bid.bidId || ''} ${bid.walletAddress || ''}`.toLowerCase();
    const msMatch = (Array.isArray(bid.milestones) ? bid.milestones : []).some(
      (m: any) => (m?.name || '').toLowerCase().includes(q)
    );
    return hay.includes(q) || msMatch;
  }

  const archivedCount = useMemo(
    () => Object.values(archMap).filter(v => v.archived).length,
    [archMap]
  );

  const filtered = useMemo(() => {
    return (bids || [])
      .filter(bidMatchesSearch)
      .map(bid => {
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
          {TABS.map(t => (
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
              className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg:white disabled:opacity-50"
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
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by vendor, project, wallet, milestone…"
          className="w-full md:w-96 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <div className="text-5xl mb-3">{tab === 'archived' ? '📁' : '🗂️'}</div>
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
                  const key = mkKey(bid.bidId, origIdx);
                  const archived = isArchived(bid.bidId, origIdx);

                  // strict state:
                  const approved = msIsApproved(m) || isCompletedLoose(m);
                  const paid = msIsPaid(m);
                  const inflight = msHasSafeMarker(m);
                  const localPending = pendingPay.has(key);

                  // chip:
                  const showPendingChip = !paid && (inflight || localPending);

                  // buttons visibility (STRICT):
                  const canShowButtons = approved && !paid && !inflight && !localPending;

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

                            {approved && !paid && !inflight && !localPending && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">
                                Approved
                              </span>
                            )}

                            {showPendingChip && (
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

                          {renderProof(m)}

                          {m.paymentTxHash && (
                            <p className="text-sm text-green-600 mt-2 break-all">
                              Paid ✅ Tx: {m.paymentTxHash || m.txHash || m.hash}
                            </p>
                          )}
                          {!hasProof(m) && !approved && (
                            <p className="text-sm text-amber-600 mt-2">No proof submitted yet.</p>
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
                                  {processing === `approve-${bid.bidId}-${origIdx}` ? 'Approving...' : 'Approve Proof'}
                                </button>
                              )}

                              {hasProof(m) && !approved &&
                                (() => {
                                  const rKey = mkRejectKey(bid.bidId, origIdx);
                                  const isProcessing = processing === `reject-${bid.bidId}-${origIdx}`;
                                  const isLocked = rejectedLocal.has(rKey);
                                  const disabled = isProcessing || isLocked;

                                  return (
                                    <button
                                      onClick={() => handleReject(bid.bidId, origIdx)}
                                      disabled={disabled}
                                      className={[
                                        'px-4 py-2 rounded disabled:opacity-50',
                                        disabled
                                          ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                                          : 'bg-red-600 hover:bg-red-700 text-white',
                                      ].join(' ')}
                                    >
                                      {isProcessing ? 'Rejecting...' : isLocked ? 'Rejected' : 'Reject'}
                                    </button>
                                  );
                                })()}

                              {canShowButtons && (
                                <div className="flex items-center gap-2">
                                  {/* Manual */}
                                  <button
                                    type="button"
                                    onClick={() => handlePay(bid.bidId, origIdx)}
                                    disabled={processing === `pay-${bid.bidId}-${origIdx}`}
                                    className={[
                                      'px-4 py-2 rounded text-white',
                                      processing === `pay-${bid.bidId}-${origIdx}`
                                        ? 'bg-green-600 opacity-60 cursor-not-allowed'
                                        : 'bg-green-600 hover:bg-green-700',
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
                                    onQueued={async () => {
                                      const k = mkKey(bid.bidId, origIdx);
                                      addPending(k);
                                      emitPayQueued(bid.bidId, origIdx);
                                      // immediate reconcile kick, then poll until PAID
                                      try {
                                        await reconcileSafe();
                                      } catch {}
                                      pollUntilPaid(bid.bidId, origIdx).catch(() => {});
                                      if (typeof router?.refresh === 'function') router.refresh();
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
            onClick={e => e.stopPropagation()}
          />

          {lightbox.index > 0 && (
            <button
              className="absolute left-4 text-white text-3xl font-bold"
              onClick={e => {
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
              onClick={e => {
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
