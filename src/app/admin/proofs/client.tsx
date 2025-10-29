// src/app/admin/proofs/client.tsx
'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
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
  getProofs,
  analyzeProof,
  invalidateBidsCache,
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

const BASE_GW = (
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
  "https://gateway.pinata.cloud"
).replace(/\/+$/, "").replace(/(?:\/ipfs)+$/i, "");
const GW = `${BASE_GW}/ipfs/`;

function isImg(s?: string) {
  if (!s) return false;
  return /\.(png|jpe?g|gif|webp|svg)(?=($|\?|#))/i.test(s);
}

// Treat as image if URL has an image extension, or the file object hints an image MIME, or it's a data:image URL
function isImageFile(f: any, href: string): boolean {
  const mime =
    f?.mime ||
    f?.mimetype ||
    f?.contentType ||
    f?.['content-type'] ||
    '';
  const name = f?.name || '';

  return (
    isImg(href) ||
    isImg(name) ||
    /^data:image\//i.test(href) ||
    /^image\//i.test(String(mime))
  );
}

// Add filename parameter to URLs for better display
function withFilename(url: string, name?: string) {
  if (!url) return url;
  if (!name) return url;
  
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url.replace(/^https?:\/\//, '')}`);
    if (/\/ipfs\/[^/?#]+$/.test(u.pathname) && !u.search) {
      u.search = `?filename=${encodeURIComponent(name)}`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Build a safe https URL from {url|cid}, collapsing duplicate /ipfs/ segments
function toGatewayUrl(file: { url?: string; cid?: string; name?: string } | undefined): string {
  const G = GW.replace(/\/+$/, '/');
  if (!file) return "";

  const rawUrl = (file as any)?.url ? String((file as any).url).trim() : "";
  const rawCid = (file as any)?.cid ? String((file as any).cid).trim() : "";
  const name = file.name;

  // Only CID present
  if ((!rawUrl || /^\s*$/.test(rawUrl)) && rawCid) {
    const url = `${G}${String(rawCid).replace(/^ipfs\//i, "")}`;
    return withFilename(url, name);
  }
  if (!rawUrl) return "";

  let u = rawUrl.trim();

  // Bare CID in url field
  const cidOnly = u.match(/^([A-Za-z0-9]{32,})(\?.*)?$/);
  if (cidOnly) {
    const url = `${G}${cidOnly[1]}${cidOnly[2] || ""}`;
    return withFilename(url, name);
  }

  // ipfs://... or leading ipfs/... → normalize
  u = u.replace(/^ipfs:\/\//i, "")
       .replace(/^\/+/, "")
       .replace(/^(?:ipfs\/)+/i, "");

  // Prefix with our gateway if not absolute http(s)
  if (!/^https?:\/\//i.test(u)) u = `${G}${u}`;

  // Collapse duplicate /ipfs/ipfs/
  u = u.replace(/\/ipfs\/(?:ipfs\/)+/gi, "/ipfs/");
  
  return withFilename(u, name);
}

// Updated FilesStrip component with horizontal scroll layout
function FilesStrip({ files, onImageClick }: { files: Array<{url?: string; cid?: string; name?: string}>, onImageClick?: (imageUrls: string[], index: number) => void }) {
  if (!files?.length) return null;
  
  return (
    <div className="overflow-x-auto scroll-smooth">
      <div className="flex flex-nowrap gap-3 pb-2 touch-pan-x snap-x snap-mandatory">
        {files.map((f, i) => {
          const href = toGatewayUrl(f);
          if (!href) return null;
          
          const name = f.name || (href ? decodeURIComponent(href.split('/').pop() || '') : '') || 'file';
          const isImage = isImageFile(f, href);

          if (isImage) {
            return (
              <button
                key={i}
                onClick={() => {
                  if (onImageClick) {
                    // Get all image URLs for lightbox
                    const imageUrls = files
                      .map(file => toGatewayUrl(file))
                      .filter(url => url && isImageFile(file, url));
                    const startIndex = imageUrls.findIndex(url => url === href);
                    onImageClick(imageUrls, Math.max(0, startIndex));
                  }
                }}
                className="shrink-0 snap-start group relative overflow-hidden rounded border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={href} 
                  alt={name} 
                  className="h-24 w-24 object-cover group-hover:scale-105 transition"
                />
                <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-1 py-0.5 truncate text-center">
                  {name}
                </div>
              </button>
            );
          }

          return (
            <div key={i} className="shrink-0 snap-start p-2 rounded border bg-gray-50 text-xs text-gray-700 min-w-[100px]">
              <p className="truncate mb-1" title={name}>{name}</p>
              <a 
                href={href} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-blue-600 hover:underline"
              >
                Open
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Improved extractFiles function to be more comprehensive
function extractFiles(m: any): { name: string; url: string }[] {
  if (!m) return [];

  // Collect all possible file sources
  const candidates = [
    m?.files?.data ?? m?.files ?? [],
    m?.files_json ?? [],
    m?.vendorFiles ?? [],
    m?.submission?.files ?? [],
    m?.uploads ?? [],
    m?.input?.files ?? [],
    m?.proofParsed?.files ?? [],
    m?.parsed?.files ?? [],
    m?.aiAnalysis?.files ?? [],
    m?.aiAnalysis?.raw?.files ?? [],
    m?.ai_analysis?.files ?? [],
    m?.ai_analysis?.raw?.files ?? [],
  ];

  // Also try to parse proof JSON for files
  try {
    if (m?.proof && typeof m.proof === "string") {
      const parsed = JSON.parse(m.proof);
      if (parsed && Array.isArray(parsed.files)) {
        candidates.push(parsed.files);
      }
    }
  } catch {}

  const flat = ([] as any[]).concat(...candidates);
  
  const mapped = flat.map((item): { name: string; url: string } | null => {
    if (!item) return null;

    // Handle string items
    if (typeof item === "string") {
      const url = toGatewayUrl({ url: item });
      if (!url) return null;
      const name = decodeURIComponent(url.split('/').pop() || 'file');
      return { name, url };
    }

    // Handle object items
    if (typeof item === "object") {
      const url = toGatewayUrl(item);
      if (!url) return null;
      
      const name = 
        item.name || 
        item.fileName || 
        item.filename || 
        item.title || 
        item.displayName || 
        item.originalname ||
        decodeURIComponent(url.split('/').pop() || 'file');
      
      return { name, url };
    }

    return null;
  }).filter(Boolean) as { name: string; url: string }[];

  // De-duplicate by URL
  const seen = new Set<string>();
  const unique: { name: string; url: string }[] = [];
  
  for (const file of mapped) {
    const key = file.url.split('#')[0];
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(file);
    }
  }

  return unique;
}

// -------------------------------
// Config / endpoints
// -------------------------------
const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
const API_BASE = RAW_API_BASE;
const apiUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

// Toggle client console spam without redeploy:
//   localStorage.setItem('mx_debug_safe','1')  to enable
//   localStorage.removeItem('mx_debug_safe')   to disable
const SAFE_DEBUG =
  typeof window !== 'undefined' &&
  (process.env.NEXT_PUBLIC_DEBUG_SAFE === '1' ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('mx_debug_safe') === '1'));

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
type ArchiveInfo = { archived: boolean; archivedAt?: string | null; archiveReason?: string | null };

const mkKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

// ===== Persist local "pending" and "paid override" =====
const PENDING_LS_KEY = 'mx_pay_pending';
const PENDING_TS_PREFIX = 'mx_pay_pending_ts:'; // kept for compatibility
const PAID_OVERRIDE_LS_KEY = 'mx_paid_override';

function loadSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function saveSet(key: string, s: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(s)));
  } catch {}
}

// -----------------------------
// Client component
// -----------------------------
export default function Client({ initialBids = [] as any[] }: { initialBids?: any[] }) {
  const [loading, setLoading] = useState(initialBids.length === 0);
  const [bids, setBids] = useState<any[]>(initialBids);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const router = useRouter();

  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const [rejectedLocal, setRejectedLocal] = useState<Set<string>>(new Set());

  // Archive state map (server)
  const [archMap, setArchMap] = useState<Record<string, ArchiveInfo>>({});

  // Local "payment pending" (persisted)
  const [pendingPay, setPendingPay] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? loadSet(PENDING_LS_KEY) : new Set())
  );
  // Local "paid override" (persisted) — set when Safe executed on-chain, before backend flips to paid
  const [paidOverride, setPaidOverride] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? loadSet(PAID_OVERRIDE_LS_KEY) : new Set())
  );

  // Cache for /safe/tx lookups to avoid hammering
  const safeStatusCache = useRef<Map<string, { isExecuted: boolean; txHash?: string | null; at: number }>>(new Map());

  // One poller per milestone
  const pollers = useRef<Set<string>>(new Set());

  // Client-side caching for bids data
  const [dataCache, setDataCache] = useState<{ bids: any[]; lastUpdated: number }>({
    bids: [],
    lastUpdated: 0,
  });

  // Broadcast channel
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

  // Helpers: local pending
  function addPending(key: string) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, String(Date.now()));
      }
    } catch {}
    setPendingPay((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveSet(PENDING_LS_KEY, next);
      return next;
    });
  }
  function removePending(key: string) {
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`);
      }
    } catch {}
    setPendingPay((prev) => {
      const next = new Set(prev);
      next.delete(key);
      saveSet(PENDING_LS_KEY, next);
      return next;
    });
  }

  // Helpers: local paid override
  function setPaidOverrideKey(key: string, on: boolean) {
    setPaidOverride((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      saveSet(PAID_OVERRIDE_LS_KEY, next);
      return next;
    });
  }

  // -------- Safe helpers --------
  function readSafeTxHash(m: any): string | null {
    return (
      m?.safeTxHash ||
      m?.safe_tx_hash ||
      m?.safePaymentTxHash ||
      m?.safe_payment_tx_hash ||
      null
    );
  }

  async function fetchSafeTx(hash: string): Promise<{ isExecuted: boolean; txHash?: string | null } | null> {
    if (!hash) return null;

    // small cache to reduce spam
    const now = Date.now();
    const cached = safeStatusCache.current.get(hash);
    if (cached && now - cached.at < 3000) return { isExecuted: cached.isExecuted, txHash: cached.txHash };

    try {
      const r = await fetch(apiUrl(`/safe/tx/${encodeURIComponent(hash)}`), {
        method: 'GET',
        credentials: 'include',
      });
      if (!r.ok) return null;
      const j = await r.json();
      const out = { isExecuted: !!j?.isExecuted, txHash: j?.txHash ?? null };
      safeStatusCache.current.set(hash, { ...out, at: now });
      return out;
    } catch {
      return null;
    }
  }

  // ==== SAFE PAYMENT POLLING ONLY ====
  // Local override: flip to PAID as soon as Safe shows executed (2 consecutive ticks)
  async function pollUntilPaid(bidId: number, milestoneIndex: number) {
    const key = mkKey(bidId, milestoneIndex);
    if (pollers.current.has(key)) return;
    pollers.current.add(key);

    if (SAFE_DEBUG) console.log(`🚀 Starting SAFE payment status check for ${key}`);

    try {
      let executedStreak = 0; // require two consecutive confirmations

      // Poll for up to 10 minutes (120 * 5s)
      for (let i = 0; i < 120; i++) {
        if (SAFE_DEBUG) console.log(`📡 Safe payment check ${i + 1}/120 for ${key}`);

        // 1) Get fresh bid from the server
        let bid: any | null = null;
        try {
          bid = await getBid(bidId);
        } catch (err: any) {
          if (SAFE_DEBUG) console.error('Error fetching bid:', err);
          if (err?.status === 401 || err?.status === 403) {
            setError('Your session expired. Please sign in again.');
            break;
          }
        }

        const m = bid?.milestones?.[milestoneIndex];

        // 2) If server already shows paid → finish
        if (m && msIsPaid(m)) {
          if (SAFE_DEBUG) console.log('🎉 PAYMENT CONFIRMED BY SERVER! Updating UI...');
          removePending(key);
          setPaidOverrideKey(key, false);

          // Update local state
          setBids((prev) =>
            prev.map((b) => {
              const match = ((b as any).bidId ?? (b as any).id) === bidId;
              if (!match) return b;
              const ms = Array.isArray((b as any).milestones) ? [...(b as any).milestones] : [];
              ms[milestoneIndex] = { ...ms[milestoneIndex], ...m };
              return { ...b, milestones: ms };
            })
          );

          try { invalidateBidsCache(); } catch {}
          router.refresh();
          emitPayDone(bidId, milestoneIndex);
          return;
        }

        // 3) Safe direct check; if executed twice consecutively → mark Paid locally (override)
        const safeHash = m ? readSafeTxHash(m) : null;
        if (safeHash) {
          const safeStatus = await fetchSafeTx(safeHash);
          if (safeStatus?.isExecuted) {
            executedStreak++;
            if (executedStreak >= 2) {
              if (SAFE_DEBUG) console.log('✅ SAFE EXECUTED ON-CHAIN → mark Paid (local override).');
              setPaidOverrideKey(key, true);   // flip chip to Paid now
              removePending(key);
              emitPayDone(bidId, milestoneIndex);
              router.refresh();

              // gentle refresh later to pick up server reconcile if it lags
              setTimeout(() => loadProofs(true), 15_000);
              return;
            }
          } else {
            executedStreak = 0;
          }
        }

        // 4) Wait 5s
        await new Promise((r) => setTimeout(r, 5000));
      }

      if (SAFE_DEBUG) console.log('🛑 Stopping Safe payment status check - time limit reached');
      removePending(key);
    } finally {
      pollers.current.delete(key);
    }
  }

  // Init
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
          // start polling immediately
          pollUntilPaid(bidId, milestoneIndex).catch(() => {});
          loadProofs(true);
        } else if (type === 'mx:pay:done') {
          removePending(mkKey(bidId, milestoneIndex));
          loadProofs(true);
        } else if (type === 'mx:ms:updated') {
          loadProofs(true);
        }
      };
    }

    if (initialBids.length === 0) {
      // No SSR data → normal fetch path
      loadProofs();
    } else {
      // We DO have SSR data; hydrate AND kick polls for any Safe-in-flight rows
      hydrateArchiveStatuses(initialBids).catch(() => {});

      try {
        for (const bid of initialBids) {
          const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
          for (let i = 0; i < ms.length; i++) {
            const key = mkKey(bid.bidId, i);

            // If server already says PAID, clear any local flags
            if (msIsPaid(ms[i])) {
              removePending(key);
              setPaidOverrideKey(key, false);
              continue;
            }

            // START POLLING ONLY IF: (local pending) OR (Safe markers AND there is a real Safe hash)
            const needsPoll = pendingPay.has(key) || (msHasSafeMarker(ms[i]) && !!readSafeTxHash(ms[i]));
            if (needsPoll && !pollers.current.has(key)) {
              pollUntilPaid(bid.bidId, i).catch(() => {});
            }
          }
        }
      } catch {}
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMilestonesUpdated(loadProofs);

  // ------------- Data loading -------------
  async function loadProofs(forceRefresh = false) {
    const CACHE_TTL = 0;

    if (!forceRefresh && dataCache.bids.length > 0 && Date.now() - dataCache.lastUpdated < CACHE_TTL) {
      setBids(dataCache.bids);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const allBids = await getBidsOnce();
      const rows = Array.isArray(allBids) ? allBids : [];

      // Clear local "pending" for milestones that are now paid (server truth)
      for (const bid of rows || []) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          if (msIsPaid(ms[i])) {
            const key = mkKey(bid.bidId, i);
            removePending(key);
            setPaidOverrideKey(key, false); // server is source of truth once paid
          }
        }
      }

      // Resume polling for any still pending OR any milestone that shows Safe markers with a real hash
      for (const bid of rows || []) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          const key = mkKey(bid.bidId, i);

          // Skip if server already says PAID — and clear local flags
          if (msIsPaid(ms[i])) {
            removePending(key);
            setPaidOverrideKey(key, false);
            continue;
          }

          const needsPoll = pendingPay.has(key) || (msHasSafeMarker(ms[i]) && !!readSafeTxHash(ms[i]));
          if (needsPoll && !pollers.current.has(key)) {
            pollUntilPaid(bid.bidId, i).catch(() => {});
          }
        }
      }

      // Prune local pending keys that don't exist anymore
      try {
        const validKeys = new Set<string>();
        for (const bid of rows || []) {
          const msArr: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
          for (let i = 0; i < msArr.length; i++) validKeys.add(mkKey(bid.bidId, i));
        }
        setPendingPay((prev) => {
          const next = new Set(prev);
          let changed = false;
          for (const k of prev) {
            if (!validKeys.has(k)) {
              next.delete(k);
              changed = true;
            }
          }
          if (changed) saveSet(PENDING_LS_KEY, next);
          return next;
        });
      } catch {}

      // Hydrate milestones lacking `proof` from the proofs table
      let merged = rows;
      try {
        merged = await mergeLatestProofsFromTable(rows);
      } catch {
        // non-fatal; keep original rows
      }

      setDataCache({ bids: merged, lastUpdated: Date.now() });
      setBids(merged);

      await hydrateArchiveStatuses(merged);
    } catch (e: any) {
      if (SAFE_DEBUG) console.error('Error fetching proofs:', e);
      setError(e?.message || 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  }

  async function hydrateArchiveStatuses(allBids: any[]) {
    const uniqueBidIds = [...new Set(allBids.map((bid) => bid.bidId))];

    if (uniqueBidIds.length === 0) {
      setArchMap({});
      return;
    }

    try {
      const bulkArchiveStatus = await getBulkArchiveStatus(uniqueBidIds);
      updateBulkArchiveCache(bulkArchiveStatus);

      const nextMap: Record<string, ArchiveInfo> = { ...archMap };

      allBids.forEach((bid) => {
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
      if (SAFE_DEBUG) console.error('Failed to fetch bulk archive status:', error);
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
    return m?.completed === true || m?.approved === true || String(m?.status ?? '').toLowerCase() === 'completed';
  }
  function isArchived(bidId: number, milestoneIndex: number): boolean {
    return !!archMap[mkKey(bidId, milestoneIndex)]?.archived;
  }

  // ---- backfill missing milestone.proof from /proofs ----
  async function mergeLatestProofsFromTable(rows: any[]) {
    const out = (rows || []).map((b) => ({
      ...b,
      milestones: Array.isArray(b?.milestones) ? [...b.milestones] : [],
    }));

    const tasks: Promise<void>[] = [];

    for (let bi = 0; bi < out.length; bi++) {
      const bid = out[bi];
      const ms = bid.milestones;

      const missingIdxs = ms
        .map((m: any, i: number) => (!hasProof(m) ? i : -1))
        .filter((i: number) => i >= 0);

      if (missingIdxs.length === 0) continue;

      tasks.push(
        (async () => {
          let list: any[] = [];
          try {
            const r = await getProofs(bid.bidId);
            list = Array.isArray(r) ? r : (Array.isArray(r?.proofs) ? r.proofs : []);
          } catch {
            return;
          }
          if (!Array.isArray(list) || list.length === 0) return;

          for (const mi of missingIdxs) {
            const candidates = list.filter(
              (p: any) => (p.milestoneIndex ?? p.milestone_index) === mi
            );
            if (candidates.length === 0) continue;

            candidates.sort((a: any, b: any) => {
              const at =
                new Date(a.updatedAt ?? a.submitted_at ?? a.createdAt ?? 0).getTime() || 0;
              const bt =
                new Date(b.updatedAt ?? b.submitted_at ?? b.createdAt ?? 0).getTime() || 0;
              return bt - at;
            });

            const latest = candidates[0];
            const description =
              latest?.description ||
              latest?.text ||
              latest?.vendor_prompt ||
              latest?.title ||
              '';
            const files =
              latest?.files ||
              latest?.file_json ||
              latest?.attachments ||
              [];

            try {
              ms[mi] = {
                ...ms[mi],
                proof: JSON.stringify({ description, files }),
              };
            } catch {
              // ignore
            }
          }
        })()
      );
    }

    if (tasks.length) await Promise.all(tasks);
    return out;
  }

  function Agent2PanelInline({ bidId, milestoneIndex }: { bidId: number; milestoneIndex: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [proofId, setProofId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);

  const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
  const API_BASE = RAW_API_BASE;
  const apiUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

  async function fetchLatest() {
    setError(null);
    try {
      setLoading(true);
      // load all proofs for this bid and pick the latest for this milestone
      const r = await getProofs(bidId);
      const list: any[] = Array.isArray(r) ? r : (Array.isArray(r?.proofs) ? r.proofs : []);
      const mine = list
        .filter((p: any) => (p.milestoneIndex ?? p.milestone_index) === milestoneIndex)
        .sort((a: any, b: any) => {
          const at = new Date(a.updatedAt ?? a.submitted_at ?? a.createdAt ?? 0).getTime() || 0;
          const bt = new Date(b.updatedAt ?? b.submitted_at ?? b.createdAt ?? 0).getTime() || 0;
          return bt - at;
        })[0];

      setProofId(Number(mine?.id ?? mine?.proof_id ?? mine?.proofId ?? NaN) || null);
      setAnalysis(mine?.ai_analysis ?? mine?.aiAnalysis ?? null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load Agent2 result');
    } finally {
      setLoading(false);
    }
  }

  async function pollUpdatedAnalysis(timeoutMs = 60000, intervalMs = 1500) {
    const stop = Date.now() + timeoutMs;
    while (Date.now() < stop) {
      try {
        const r = await fetch(apiUrl(`/proofs?bidId=${bidId}&t=${Date.now()}`), {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (r.ok) {
          const j = await r.json();
          const list: any[] = Array.isArray(j) ? j : (j?.proofs ?? []);
          const mine = list
            .filter((p: any) => (p.milestoneIndex ?? p.milestone_index) === milestoneIndex)
            .sort((a: any, b: any) => {
              const at = new Date(a.updatedAt ?? a.submitted_at ?? a.createdAt ?? 0).getTime() || 0;
              const bt = new Date(b.updatedAt ?? b.submitted_at ?? b.createdAt ?? 0).getTime() || 0;
              return bt - at;
            })[0];
          const a = mine?.ai_analysis ?? mine?.aiAnalysis ?? null;
          if (a) {
            setAnalysis(a);
            return;
          }
        }
      } catch {}
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async function rerun() {
    setError(null);
    if (!proofId) {
      setError('No proof found for this milestone.');
      return;
    }
    try {
      setRunning(true);
      await analyzeProof(proofId);
      await pollUpdatedAnalysis();
    } catch (e: any) {
      setError(e?.message || 'Failed to analyze');
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => { fetchLatest(); /* on mount */ }, [bidId, milestoneIndex]);

  const A = analysis || {};
  const summary: string | undefined = A.summary || A.tldr || A.brief || A.overview;
  const fit: string | undefined = A.fit || A.fitScore || A.fitment;
  const confidence: string | number | undefined = A.confidence;
  const risks: string[] = Array.isArray(A.risks) ? A.risks : (A.risks ? [A.risks] : []);
  const notes: string[] = Array.isArray(A.milestoneNotes) ? A.milestoneNotes : (A.milestoneNotes ? [A.milestoneNotes] : []);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Agent 2</div>
        <button
          onClick={rerun}
          disabled={running || !proofId}
          className={['px-3 py-1.5 rounded-md text-sm',
            running ? 'bg-slate-300 text-slate-600' : 'bg-blue-600 hover:bg-blue-700 text-white'
          ].join(' ')}
          title={proofId ? 'Re-run analysis' : 'No proof found for this milestone'}
        >
          {running ? 'Analyzing…' : 'Run Agent 2'}
        </button>
      </div>

      {loading && <div className="mt-2 text-sm text-slate-500">Loading…</div>}
      {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}

      {!loading && !analysis && !error && (
        <div className="mt-2 text-sm text-slate-500">No analysis yet.</div>
      )}

      {analysis && (
        <div className="mt-3 space-y-2 text-sm">
          {summary && (
            <div>
              <div className="text-xs uppercase text-slate-500">Summary</div>
              <div className="mt-0.5">{summary}</div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {typeof fit !== 'undefined' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">Fit: {String(fit)}</span>
            )}
            {typeof confidence !== 'undefined' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">Confidence: {String(confidence)}</span>
            )}
          </div>
          {risks.length > 0 && (
            <div>
              <div className="text-xs uppercase text-slate-500">Risks</div>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {risks.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          {notes.length > 0 && (
            <div>
              <div className="text-xs uppercase text-slate-500">Milestone Notes</div>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                {notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
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
      await payMilestone(bidId, milestoneIndex);
      const key = mkKey(bidId, milestoneIndex);
      addPending(key);
      emitPayQueued(bidId, milestoneIndex);
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
      setRejectedLocal((prev) => {
        const next = new Set(prev);
        next.add(mkKey(bidId, milestoneIndex));
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
      setArchMap((prev) => ({
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
      setArchMap((prev) => ({
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

  // ---- Filters / search ----
  function milestoneMatchesTab(m: any, bidId: number, idx: number): boolean {
    const key = mkKey(bidId, idx);
    const archived = isArchived(bidId, idx);

    if (tab === 'archived') return archived;
    if (archived) return false;

    const approved = msIsApproved(m) || isCompleted(m);
    const paid = msIsPaid(m) || paidOverride.has(key);
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
    const msMatch = (Array.isArray(bid.milestones) ? bid.milestones : []).some((m: any) =>
      (m?.name || '').toLowerCase().includes(q)
    );
    return hay.includes(q) || msMatch;
  }

  const archivedCount = useMemo(() => Object.values(archMap).filter((v) => v.archived).length, [archMap]);

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
  }, [bids, tab, query, archMap, pendingPay, paidOverride]);

  // ---- UI helpers ----
  const renderProof = (m: any) => {
    if (!m?.proof) return null;

    let parsed: any = null;
    try {
      parsed = JSON.parse(m.proof);
    } catch {}

 if (parsed && typeof parsed === 'object') {
  return (
    <div className="mt-2 space-y-2">
      {parsed.description && (
        <p className="text-sm text-gray-700">{parsed.description}</p>
      )}
      {/* Files are rendered below via <FilesStrip files={extractFiles(m)} /> */}
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
                    onClick={() => setLightbox({ urls: imageUrls, index: Math.max(0, startIndex) })}
                    className="group relative overflow-hidden rounded border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Proof ${i}`} className="h-32 w-full object-cover group-hover:scale-105 transition" />
                  </button>
                );
              }
              return (
                <div key={i} className="p-3 rounded border bg-gray-50">
                  <p className="truncate text-sm">Attachment</p>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
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

  // ---- Render ----
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
                tab === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
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

      {/* Archive Controls */}
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
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by vendor, project, wallet, milestone…"
          className="w-full md:w-96 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
        />
      </div>

      {(filtered || []).length === 0 ? (
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
                  <h2 className="text-lg font-semibold">
                    {bid.vendorName} — Proposal #{bid.proposalId}
                  </h2>
                  <p className="text-gray-600 text-sm">Bid ID: {bid.bidId}</p>
                </div>
                <Link href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`} className="text-sm text-blue-600 hover:underline">
                  Manage →
                </Link>
              </div>

              <div className="space-y-4">
                {(bid._withIdxVisible as Array<{ m: any; idx: number }>).map(({ m, idx: origIdx }) => {
                  const key = mkKey(bid.bidId, origIdx);

                  const approved = msIsApproved(m) || isCompleted(m);
                  const paid = msIsPaid(m) || paidOverride.has(key);
                  const localPending = pendingPay.has(key);

                  // Only show the "Payment Pending" chip when:
                  //  - it's not paid (incl. override), AND
                  //  - there is a real Safe hash to track OR we have a localPending flag
                  const hasRealSafeHash = !!readSafeTxHash(m);
                  const showPendingChip = !paid && (localPending || (hasRealSafeHash && msHasSafeMarker(m)));

                  return (
                    <div key={`${bid.bidId}:${origIdx}`} className="border-t pt-4 mt-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{m.name}</p>

                            {isArchived(bid.bidId, origIdx) && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 border">Archived</span>
                            )}

                            {approved && !paid && !msHasSafeMarker(m) && !localPending && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Approved</span>
                            )}

                            {showPendingChip && (
                              <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Payment Pending</span>
                            )}

                            {paid && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Paid</span>}
                          </div>

                          <p className="text-sm text-gray-600">Amount: ${m.amount} | Due: {m.dueDate}</p>

{/* Proof */}
{renderProof(m)}

{/* Files submitted with this proof */}
<FilesStrip 
  files={extractFiles(m)} 
  onImageClick={(urls, index) => setLightbox({ urls, index })}
/>

{/* Agent2 (summary + re-run) */}
<Agent2PanelInline bidId={bid.bidId} milestoneIndex={origIdx} />

                          {/* Tx display */}
                          {(m.paymentTxHash || m.safePaymentTxHash) && (
                            <p className="text-sm text-green-600 mt-2 break-all">
                              Paid ✅ Tx: {m.paymentTxHash || m.safePaymentTxHash}
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

                              {hasProof(m) && !approved && (() => {
                                const rKey = mkKey(bid.bidId, origIdx);
                                const isProcessing = processing === `reject-${bid.bidId}-${origIdx}`;
                                const isLocked = rejectedLocal.has(rKey);
                                const disabled = isProcessing || isLocked;

                                return (
                                  <button
                                    onClick={() => handleReject(bid.bidId, origIdx)}
                                    disabled={disabled}
                                    className={['px-4 py-2 rounded disabled:opacity-50', disabled ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'].join(' ')}
                                  >
                                    {isProcessing ? 'Rejecting...' : isLocked ? 'Rejected' : 'Reject'}
                                  </button>
                                );
                              })()}

                              {/* Hide buttons if paid (including local override) */}
                              {msCanShowPayButtons(m, { approved, localPending }) && !paid && (
                                <div className="flex items-center gap-2">
                                  {/* Manual payment */}
                                  <button
                                    type="button"
                                    onClick={() => handlePay(bid.bidId, origIdx)}
                                    disabled={processing === `pay-${bid.bidId}-${origIdx}`}
                                    className={['px-4 py-2 rounded text-white', processing === `pay-${bid.bidId}-${origIdx}` ? 'bg-green-600 opacity-60 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'].join(' ')}
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
                                      const k = mkKey(bid.bidId, origIdx);
                                      addPending(k);
                                      emitPayQueued(bid.bidId, origIdx);
                                      pollUntilPaid(bid.bidId, origIdx).catch(() => {});
                                      router.refresh();
                                    }}
                                  />
                                </div>
                              )}
                            </>
                          )}

                          {!isArchived(bid.bidId, origIdx) ? (
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
          <button className="absolute top-4 right-4 text-white text-2xl" onClick={() => setLightbox(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}