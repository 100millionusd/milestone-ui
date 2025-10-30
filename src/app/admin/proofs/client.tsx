// src/app/admin/proofs/client.tsx
'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import {
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
} from '@/lib/milestonePaymentState';
import ChangeRequestsPanel from '@/components/ChangeRequestsPanel';


// ---------------- IPFS Gateway (project-page style, unified) ----------------
const BASE_GW = (
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
  'https://gateway.pinata.cloud'
)
  .replace(/\/+$/, '')
  .replace(/(?:\/ipfs)+$/i, '');

const GW = `${BASE_GW}/ipfs/`;

// ---------------- Debug toggle ----------------
const DEBUG_FILES =
  typeof window !== 'undefined' &&
  (localStorage.getItem('debug_files') === 'true' || process.env.NODE_ENV === 'development');

// ---------------- Small utils ----------------
function isImg(s?: string) {
  if (!s) return false;
  return /\.(png|jpe?g|gif|webp|svg)(?=($|\?|#))/i.test(s);
}
function isImageFile(f: any, href: string): boolean {
  const mime =
    f?.mime || f?.mimetype || f?.contentType || f?.['content-type'] || '';
  const name = f?.name || '';
  return isImg(href) || isImg(name) || /^data:image\//i.test(href) || /^image\//i.test(String(mime));
}
function withFilename(url: string, name?: string) {
  if (!url || !name) return url;
  try {
    const u = new URL(url);
    if (/\/ipfs\/[^/?#]+$/.test(u.pathname) && !u.search) {
      u.search = `?filename=${encodeURIComponent(name)}`;
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Build safe gateway URL from string | {url?, cid?, name?}
function toGatewayUrl(file: { url?: string; cid?: string; name?: string } | string | undefined): string {
  const G = GW.replace(/\/+$/, '/');
  if (!file) return '';

  // Accept plain string tokens
  if (typeof file === 'string') {
    let s = file.trim();
    if (!s) return '';
    // http(s)
    if (/^https?:\/\//i.test(s)) return s;
    // ipfs://... or ipfs/... or bare CID
    s = s.replace(/^ipfs:\/\//i, '').replace(/^\/+/, '').replace(/^(?:ipfs\/)+/i, '');
    // if it still looks like absolute http, keep it
    if (/^https?:\/\//i.test(s)) return s;
    return `${G}${s}`;
  }

  const rawUrl = file?.url ? String(file.url).trim() : '';
  const rawCid = file?.cid ? String(file.cid).trim() : '';
  const name = file?.name;

  if (DEBUG_FILES) console.log('🔍 toGatewayUrl input:', { rawUrl, rawCid, name });

  if ((!rawUrl || /^\s*$/.test(rawUrl)) && rawCid) {
    const url = `${G}${rawCid.replace(/^ipfs\//i, '')}`;
    return withFilename(url, name);
  }
  if (!rawUrl) return '';

  // bare CID in url field
  const cidOnly = rawUrl.match(/^([A-Za-z0-9]{32,})(\?.*)?$/);
  if (cidOnly) {
    const url = `${G}${cidOnly[1]}${cidOnly[2] || ''}`;
    return withFilename(url, name);
  }

  // ipfs://... or ipfs/... normalize
  let u = rawUrl
    .replace(/^ipfs:\/\//i, '')
    .replace(/^\/+/, '')
    .replace(/^(?:ipfs\/)+/i, '');

  if (!/^https?:\/\//i.test(u)) u = `${G}${u}`;
  u = u.replace(/\/ipfs\/(?:ipfs\/)+/gi, '/ipfs/');

  const out = withFilename(u, name);
  if (DEBUG_FILES) console.log('🔍 Final URL result:', out);
  return out;
}

// ---------------- Files UI ----------------
/// Fixed FilesStrip: clickable images + files, no image names
function FilesStrip({
  files,
  onImageClick,
}: {
  files: Array<{ url?: string; cid?: string; name?: string }>;
  onImageClick?: (imageUrls: string[], index: number) => void;
}) {
  if (DEBUG_FILES) console.log('🔍 FilesStrip received files:', files);
  if (!files?.length) {
    if (DEBUG_FILES) console.log('🔍 FilesStrip: No files to display');
    return null;
  }

  // Precompute entries so we keep (file, href) pairs together
  const entries = files
    .map((file, idx) => {
      const href = toGatewayUrl(file);
      return { file, href, idx, isImage: href ? isImageFile(file, href) : false };
    })
    .filter(e => !!e.href);

  return (
    <div className="overflow-x-auto scroll-smooth">
      <div className="flex flex-nowrap gap-3 pb-2 touch-pan-x snap-x snap-mandatory">
        {entries.map(({ file, href, isImage }, i) => {
          if (isImage) {
            // Image tile: clickable (lightbox if provided; fallback opens new tab)
            return (
              <button
                key={i}
                type="button"
                className="shrink-0 snap-start group relative overflow-hidden rounded border cursor-pointer"
                onClick={() => {
                  if (onImageClick) {
                    const imageEntries = entries.filter(e => e.isImage);
                    const imageUrls = imageEntries.map(e => e.href!);
                    const startIndex = imageEntries.findIndex(e => e.href === href);
                    if (DEBUG_FILES) console.log('🔍 Image clicked:', { href, startIndex });
                    onImageClick(imageUrls, Math.max(0, startIndex));
                  } else {
                    window.open(href!, '_blank', 'noopener,noreferrer');
                  }
                }}
                aria-label="Open image"
                title=""
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={href!}
                  alt=""
                  className="h-24 w-24 object-cover group-hover:scale-105 transition"
                  onError={(e) => {
                    if (DEBUG_FILES) console.log('🔍 Image failed to load:', href);
                    e.currentTarget.style.display = 'none';
                  }}
                  onLoad={() => {
                    if (DEBUG_FILES) console.log('🔍 Image loaded:', href);
                  }}
                />
                {/* No filename overlay */}
              </button>
            );
          }

          // Non-image: keep a simple card with name + Open link
          const name =
            file.name ||
            (href ? decodeURIComponent(href.split('/').pop() || '') : '') ||
            'file';

          return (
            <div
              key={i}
              className="shrink-0 snap-start p-2 rounded border bg-gray-50 text-xs text-gray-700 min-w-[120px]"
            >
              <p className="truncate mb-1" title={name}>
                {name}
              </p>
              <a
                href={href!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
                onClick={() => {
                  if (DEBUG_FILES) console.log('🔍 File link clicked:', { href, name });
                }}
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

// ---------------- Proof/file extraction ----------------
function entriesFromProofFiles(files: any[]): { name: string; url: string }[] {
  if (!Array.isArray(files) || files.length === 0) return [];
  const out: { name: string; url: string }[] = [];

  for (const x of files) {
    if (!x) continue;

    if (typeof x === 'string') {
      const s = x.trim();
      if (!s) continue;

      if (/^https?:\/\//i.test(s)) {
        const url = s;
        const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'file');
        out.push({ name, url });
        continue;
      }
      if (/^ipfs:\/\//i.test(s) || /^ipfs\//i.test(s)) {
        const url = toGatewayUrl(s);
        const name = (s.replace(/^ipfs:\/\//i, '').replace(/^ipfs\//i, '').split(/[?#]/)[0]) || 'file';
        out.push({ name, url });
        continue;
      }
      if (/^[A-Za-z0-9]{46,}([/?#].*)?$/i.test(s)) {
        const bare = s.split(/[/?#]/)[0];
        const url = toGatewayUrl({ cid: bare });
        out.push({ name: bare, url });
        continue;
      }
      continue;
    }

    const rawName = x.name || x.fileName || x.filename || x.title || x.displayName || x.originalname || null;
    const url = toGatewayUrl({ url: typeof x.url === 'string' ? x.url : '', cid: typeof x.cid === 'string' ? x.cid : '', name: rawName || undefined });
    if (!url) continue;
    const name = rawName || decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'file');
    out.push({ name, url });
  }

  const seen = new Set<string>();
  return out.filter((f) => {
    const key = f.url.split('#')[0];
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Fallback extractor from milestone object (legacy shapes)
function extractFilesFromMilestone(m: any): { name: string; url: string }[] {
  // try JSON proof.files
  let proofFiles: any[] = [];
  if (m?.proof && typeof m.proof === 'string') {
    try {
      const parsed = JSON.parse(m.proof);
      if (parsed && Array.isArray(parsed.files)) proofFiles = parsed.files;
    } catch {
      // not JSON; fall through
    }
  }

  const candidates =
    (m?.files?.data ?? m?.files ?? [])
      .concat(m?.files_json ?? [])
      .concat(m?.vendorFiles ?? [])
      .concat(m?.submission?.files ?? [])
      .concat(m?.uploads ?? [])
      .concat(m?.input?.files ?? [])
      .concat(m?.proofParsed?.files ?? [])
      .concat(m?.parsed?.files ?? [])
      .concat(m?.aiAnalysis?.files ?? [])
      .concat(m?.aiAnalysis?.raw?.files ?? [])
      .concat(m?.ai_analysis?.files ?? [])
      .concat(m?.ai_analysis?.raw?.files ?? [])
      .concat(proofFiles);

  const flat = ([] as any[]).concat(...(candidates || []).map((c: any) => (Array.isArray(c) ? c : [c])));
  return entriesFromProofFiles(flat);
}

// ---------------- Config / endpoints ----------------
const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
const API_BASE = RAW_API_BASE;
const apiUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

// Toggle client console spam without redeploy
const SAFE_DEBUG =
  typeof window !== 'undefined' &&
  (process.env.NEXT_PUBLIC_DEBUG_SAFE === '1' ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('mx_debug_safe') === '1'));

// ---------------- Tabs / types ----------------
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
const PENDING_TS_PREFIX = 'mx_pay_pending_ts:';
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

// ---------------- Small debug panel ----------------
function DebugPanel({ data, title }: { data: any; title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!DEBUG_FILES) return null;
  return (
    <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 text-sm font-medium text-yellow-800">
        <span>🐛 {title}</span>
        <span>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <pre className="mt-2 text-xs text-yellow-700 overflow-auto max-h-60">{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
}

// ---------------- Main component ----------------
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
  const [archMap, setArchMap] = useState<Record<string, ArchiveInfo>>({});
  const [pendingPay, setPendingPay] = useState<Set<string>>(() =>
    typeof window !== 'undefined' ? loadSet(PENDING_LS_KEY) : new Set()
  );
  const [paidOverride, setPaidOverride] = useState<Set<string>>(() =>
    typeof window !== 'undefined' ? loadSet(PAID_OVERRIDE_LS_KEY) : new Set()
  );

  const [crFor, setCrFor] = useState<{ bidId: number; proposalId: number; milestoneIndex: number } | null>(null);

  // --- Change Requests (composer) ---

const [crText, setCrText] = useState<Record<string, string>>({});
const [crBusy, setCrBusy] = useState<Record<string, boolean>>({});
const [crErr, setCrErr] = useState<Record<string, string | null>>({});

 
  // 🔑 The missing piece: cache latest proof (same source Agent2 uses)
  const [latestProofByKey, setLatestProofByKey] = useState<
    Record<string, { description?: string; files?: any[] }>
  >({});

  const safeStatusCache = useRef<Map<string, { isExecuted: boolean; txHash?: string | null; at: number }>>(new Map());
  const pollers = useRef<Set<string>>(new Set());
  const [dataCache, setDataCache] = useState<{ bids: any[]; lastUpdated: number }>({ bids: [], lastUpdated: 0 });
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
    try { window.dispatchEvent(new CustomEvent('milestones:updated', { detail })); } catch {}
    try { bcRef.current?.postMessage({ type: 'mx:ms:updated', ...detail }); } catch {}
  }

// --- Change Request submit helper ---
// IMPORTANT: hit the Next.js API route (relative), NOT the backend base URL.
async function submitCR(proposalId: number, bidId: number, milestoneIndex: number) {
  const key = mkKey(bidId, milestoneIndex);
  const comment = (crText[key] || '').trim();
  if (!comment) {
    alert('Type what to change.');
    return;
  }

  setCrBusy(prev => ({ ...prev, [key]: true }));
  setCrErr(prev => ({ ...prev, [key]: null }));

  try {
    const r = await fetch('/api/proofs/change-requests', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        proposalId,
        milestoneIndex,
        comment,
        bidId, // optional but nice to attach
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      throw new Error(t || `HTTP ${r.status}`);
    }

    // Clear the textbox and let the panel refresh
    setCrText(prev => ({ ...prev, [key]: '' }));
    // Kick any listeners (and ChangeRequestsPanel) to refetch
    emitMilestonesUpdated({ bidId, milestoneIndex, changeRequestCreated: true });

    // CLOSE THE MODAL ON SUCCESS
    setCrFor(null);
  } catch (e: any) {
    setCrErr(prev => ({ ...prev, [key]: e?.message || 'Failed' }));
  } finally {
    setCrBusy(prev => ({ ...prev, [key]: false }));
  }
}

  function addPending(key: string) {
    try { if (typeof window !== 'undefined') localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, String(Date.now())); } catch {}
    setPendingPay((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveSet(PENDING_LS_KEY, next);
      return next;
    });
  }
  function removePending(key: string) {
    try { if (typeof window !== 'undefined') localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`); } catch {}
    setPendingPay((prev) => {
      const next = new Set(prev);
      next.delete(key);
      saveSet(PENDING_LS_KEY, next);
      return next;
    });
  }
  function setPaidOverrideKey(key: string, on: boolean) {
    setPaidOverride((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      saveSet(PAID_OVERRIDE_LS_KEY, next);
      return next;
    });
  }

  function readSafeTxHash(m: any): string | null {
    return m?.safeTxHash || m?.safe_tx_hash || m?.safePaymentTxHash || m?.safe_payment_tx_hash || null;
  }

  async function fetchSafeTx(hash: string): Promise<{ isExecuted: boolean; txHash?: string | null } | null> {
    if (!hash) return null;
    const now = Date.now();
    const cached = safeStatusCache.current.get(hash);
    if (cached && now - cached.at < 3000) return { isExecuted: cached.isExecuted, txHash: cached.txHash };
    try {
      const r = await fetch(apiUrl(`/safe/tx/${encodeURIComponent(hash)}`), { method: 'GET', credentials: 'include' });
      if (!r.ok) return null;
      const j = await r.json();
      const out = { isExecuted: !!j?.isExecuted, txHash: j?.txHash ?? null };
      safeStatusCache.current.set(hash, { ...out, at: now });
      return out;
    } catch {
      return null;
    }
  }

  async function pollUntilPaid(bidId: number, milestoneIndex: number) {
    const key = mkKey(bidId, milestoneIndex);
    if (pollers.current.has(key)) return;
    pollers.current.add(key);
    try {
      let executedStreak = 0; // need 2 consecutive executions
      for (let i = 0; i < 120; i++) {
        let bid: any | null = null;
        try { bid = await getBid(bidId); } catch (err: any) {
          if (SAFE_DEBUG) console.error('Error fetching bid:', err);
          if (err?.status === 401 || err?.status === 403) { setError('Your session expired. Please sign in again.'); break; }
        }
        const m = bid?.milestones?.[milestoneIndex];
        if (m && msIsPaid(m)) {
          removePending(key);
          setPaidOverrideKey(key, false);
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
        const safeHash = m ? readSafeTxHash(m) : null;
        if (safeHash) {
          const safeStatus = await fetchSafeTx(safeHash);
          if (safeStatus?.isExecuted) {
            executedStreak++;
            if (executedStreak >= 2) {
              setPaidOverrideKey(key, true);
              removePending(key);
              emitPayDone(bidId, milestoneIndex);
              router.refresh();
              setTimeout(() => loadProofs(true), 15000);
              return;
            }
          } else {
            executedStreak = 0;
          }
        }
        await new Promise((r) => setTimeout(r, 5000));
      }
      removePending(key);
    } finally {
      pollers.current.delete(key);
    }
  }

  // ---------------- Init ----------------
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
      loadProofs();
    } else {
      hydrateArchiveStatuses(initialBids).catch(() => {});
      try {
        for (const bid of initialBids) {
          const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
          for (let i = 0; i < ms.length; i++) {
            const key = mkKey(bid.bidId, i);
            if (msIsPaid(ms[i])) {
              removePending(key);
              setPaidOverrideKey(key, false);
              continue;
            }
            const needsPoll = pendingPay.has(key) || (msHasSafeMarker(ms[i]) && !!readSafeTxHash(ms[i]));
            if (needsPoll && !pollers.current.has(key)) pollUntilPaid(bid.bidId, i).catch(() => {});
          }
        }
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMilestonesUpdated(loadProofs);

  // ---------------- Data loading ----------------
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
      if (DEBUG_FILES) console.log('🔍 loadProofs: Raw bids data:', rows);

      // clear local pending for server-paid
      for (const bid of rows || []) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          if (msIsPaid(ms[i])) {
            const key = mkKey(bid.bidId, i);
            removePending(key);
            setPaidOverrideKey(key, false);
          }
        }
      }

      // resume polling for inflight
      for (const bid of rows || []) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          const key = mkKey(bid.bidId, i);
          if (msIsPaid(ms[i])) {
            removePending(key);
            setPaidOverrideKey(key, false);
            continue;
          }
          const needsPoll = pendingPay.has(key) || (msHasSafeMarker(ms[i]) && !!readSafeTxHash(ms[i]));
          if (needsPoll && !pollers.current.has(key)) pollUntilPaid(bid.bidId, i).catch(() => {});
        }
      }

      // prune locals that no longer exist
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

      setDataCache({ bids: rows, lastUpdated: Date.now() });
      setBids(rows);

      // 🔁 Fetch latest proofs per milestone (same source Agent2 uses)
      const map: Record<string, { description?: string; files?: any[] }> = {};
      for (const bid of rows) {
        let list: any[] = [];
        try {
          const r = await getProofs(bid.bidId);
          list = Array.isArray(r) ? r : (Array.isArray(r?.proofs) ? r.proofs : []);
        } catch {}
        const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          const mine = (list || [])
            .filter((p: any) => (p.milestoneIndex ?? p.milestone_index) === i)
            .sort((a: any, b: any) => {
              const at = new Date(a.updatedAt ?? a.submitted_at ?? a.createdAt ?? 0).getTime() || 0;
              const bt = new Date(b.updatedAt ?? b.submitted_at ?? b.createdAt ?? 0).getTime() || 0;
              return bt - at;
            })[0];
          if (mine) {
            map[mkKey(bid.bidId, i)] = {
              description: mine?.description || mine?.text || mine?.vendor_prompt || mine?.title || '',
              files:
                mine?.files ||
                mine?.file_json ||
                mine?.attachments ||
                mine?.ai_analysis?.files ||
                mine?.aiAnalysis?.files ||
                [],
            };
          }
        }
      }
      setLatestProofByKey(map);

      await hydrateArchiveStatuses(rows);
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
          if (nextMap[key] === undefined) nextMap[key] = bidArchiveStatus[index] || { archived: false };
        });
      });
      setArchMap(nextMap);
    } catch {
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

  // ---------------- Helpers ----------------
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

  // ---------------- Agent 2 panel ----------------
  function Agent2PanelInline({ bidId, milestoneIndex }: { bidId: number; milestoneIndex: number }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<any | null>(null);
    const [proofId, setProofId] = useState<number | null>(null);

    const RAW = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
    const API = RAW;
    const api = (path: string) => (API ? `${API}${path}` : path);

    async function fetchLatest() {
      setError(null);
      try {
        setLoading(true);
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
          const r = await fetch(api(`/proofs?bidId=${bidId}&t=${Date.now()}`), {
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
        await analyzeProof(proofId);
        await pollUpdatedAnalysis();
      } catch (e: any) {
        setError(e?.message || 'Failed to analyze');
      }
    }

    useEffect(() => {
      fetchLatest();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bidId, milestoneIndex]);

    const A = analysis || {};
    const summary: string | undefined = A.summary || A.tldr || A.brief || A.overview;
    const fit: string | undefined = A.fit || A.fitScore || A.fitment;
    const confidence: string | number | undefined = A.confidence;
    const risks: string[] = Array.isArray(A.risks) ? A.risks : A.risks ? [A.risks] : [];
    const notes: string[] = Array.isArray(A.milestoneNotes) ? A.milestoneNotes : A.milestoneNotes ? [A.milestoneNotes] : [];

    return (
      <div className="mt-3 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-medium">Agent 2</div>
          <button
            onClick={rerun}
            disabled={!proofId}
            className="px-3 py-1.5 rounded-md text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            title={proofId ? 'Re-run analysis' : 'No proof found for this milestone'}
          >
            Run Agent 2
          </button>
        </div>

        {loading && <div className="mt-2 text-sm text-slate-500">Loading…</div>}
        {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}

        {!loading && !analysis && !error && <div className="mt-2 text-sm text-slate-500">No analysis yet.</div>}

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
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs">
                  Confidence: {String(confidence)}
                </span>
              )}
            </div>
            {risks.length > 0 && (
              <div>
                <div className="text-xs uppercase text-slate-500">Risks</div>
                <ul className="list-disc pl-5 mt-1 space-y-1">{risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            )}
            {notes.length > 0 && (
              <div>
                <div className="text-xs uppercase text-slate-500">Milestone Notes</div>
                <ul className="list-disc pl-5 mt-1 space-y-1">{notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---------------- Actions ----------------
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

  // ---------------- Filters / search ----------------
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

  // ---------------- Proof renderer ----------------
  // ---- UI helpers ----
const renderProof = (m: any) => {
  if (!m?.proof) return null;

  const title = String(m?.name || '').trim();

  // Try JSON first
  try {
    const parsed = JSON.parse(m.proof);
    if (parsed && typeof parsed === 'object') {
      const desc = String(parsed.description || '').trim();
      const showDesc = !!desc && desc !== title;

      return (
        <div className="mt-2 space-y-2">
          {showDesc && (
            <p className="text-sm text-gray-700">{desc}</p>
          )}
          {/* Files are rendered below via <FilesStrip files={extractFiles(m)} /> */}
        </div>
      );
    }
  } catch {
    // not JSON; fall through
  }

  // Plain text proof
  const text = String(m.proof).trim();
  const showText = !!text && text !== title;
  if (!showText) return null;

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

  // ---------------- Render ----------------
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
      {/* Debug Controls */}
      {DEBUG_FILES && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">🐛 Debug Mode Active</span>
            <button
              onClick={() => {
                localStorage.removeItem('debug_files');
                window.location.reload();
              }}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
            >
              Disable Debug
            </button>
          </div>
          <p className="text-xs text-blue-600 mt-1">Check browser console for detailed file debugging information</p>
        </div>
      )}

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
                <span className="ml-1 bg-slate-600 text-white rounded-full px-1.5 py-0.5 text-xs min-w-[20px]">{archivedCount}</span>
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
                  <h2 className="text-lg font-semibold">{bid.vendorName} — Proposal #{bid.proposalId}</h2>
                  <p className="text-gray-600 text-sm">Bid ID: {bid.bidId}</p>
                </div>
                <Link href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`} className="text-sm text-blue-600 hover:underline">
                  Manage →
                </Link>
              </div>

              <DebugPanel data={bid} title={`Bid Data: ${bid.bidId}`} />

              <div className="space-y-4">
                {(bid._withIdxVisible as Array<{ m: any; idx: number }>).map(({ m, idx: origIdx }) => {
                  const key = mkKey(bid.bidId, origIdx);

                  const approved = msIsApproved(m) || isCompleted(m);
                  const paid = msIsPaid(m) || paidOverride.has(key);
                  const localPending = pendingPay.has(key);
                  const hasRealSafeHash = !!readSafeTxHash(m);
                  const showPendingChip = !paid && (localPending || (hasRealSafeHash && msHasSafeMarker(m)));

                  // 👉 Build file list: prefer /proofs (Agent2 source), else milestone
                  const lp = latestProofByKey[key];
                  const fromProofs = entriesFromProofFiles(lp?.files || []);
                  const fromMilestone = extractFilesFromMilestone(m);
                  const filesToShow = fromProofs.length ? fromProofs : fromMilestone;

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

                          <DebugPanel data={m} title={`Milestone Data: ${origIdx}`} />
                          <DebugPanel data={filesToShow} title={`Files to Show: ${origIdx}`} />

                          {/* Proof text/description */}
                          {renderProof(m)}
                          {/* If milestone.proof is plain text without links, show latest proof description */}
                          {(!m?.proof || (typeof m.proof === 'string' && !/https?:\/\//i.test(m.proof))) && lp?.description && (
                            <p className="text-sm text-gray-700 mt-2">{lp.description}</p>
                          )}

                          {/* Files */}
                          <FilesStrip files={filesToShow} onImageClick={(urls, index) => setLightbox({ urls, index })} />

                          {/* Agent2 */}
                          <Agent2PanelInline bidId={bid.bidId} milestoneIndex={origIdx} />

                          {/* Tx */}
                          {(m.paymentTxHash || m.safePaymentTxHash) && (
                            <p className="text-sm text-green-600 mt-2 break-all">
                              Paid ✅ Tx: {m.paymentTxHash || m.safePaymentTxHash}
                            </p>
                          )}
                          {!hasProof(m) && !approved && <p className="text-sm text-amber-600 mt-2">No proof submitted yet.</p>}
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
                                    className={['px-4 py-2 rounded disabled:opacity-50', disabled ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 text-white'].join(
                                      ' '
                                    )}
                                  >
                                    {isProcessing ? 'Rejecting...' : isLocked ? 'Rejected' : 'Reject'}
                                  </button>
                                );
                              })()}

                              {msCanShowPayButtons(m, { approved, localPending }) && !paid && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handlePay(bid.bidId, origIdx)}
                                    disabled={processing === `pay-${bid.bidId}-${origIdx}`}
                                    className={['px-4 py-2 rounded text-white', processing === `pay-${bid.bidId}-${origIdx}` ? 'bg-green-600 opacity-60 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'].join(
                                      ' '
                                    )}
                                    title="Release payment manually (EOA)"
                                  >
                                    {processing === `pay-${bid.bidId}-${origIdx}` ? 'Paying...' : 'Release Payment'}
                                  </button>

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

{/* Request Changes (open MODAL like project page) */}
<button
  onClick={() =>
    setCrFor({
      bidId: Number(bid.bidId),
      proposalId: Number(bid.proposalId),
      milestoneIndex: origIdx,
    })
  }
  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"
  title="Ask the vendor for fixes or additional proof"
>
  Request Changes
</button>


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

{/* ===== Change Request Modal (Project-page style) ===== */}
{crFor && (
  <div
    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
    onClick={() => setCrFor(null)}
  >
    <div
      className="w-full max-w-2xl rounded-xl bg-white shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cr-modal-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 id="cr-modal-title" className="text-base font-semibold">
          Request Changes — Milestone #{crFor.milestoneIndex + 1}
        </h3>
        <button
          onClick={() => setCrFor(null)}
          className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Body (panel + composer) */}
      <div className="p-4">
        {/* Existing thread / list (same as project page) */}
 <ChangeRequestsPanel
  key={`cr:${crFor.proposalId}:${crFor.milestoneIndex}:${dataCache.lastUpdated}`}
  proposalId={crFor.proposalId}
  milestoneIndex={crFor.milestoneIndex}
  initialMilestoneIndex={crFor.milestoneIndex}
  bidId={crFor.bidId}
/>

        {/* Composer (spacing/labels synced 1:1) */}
        {(() => {
          const key = `${crFor.bidId}-${crFor.milestoneIndex}`;
          return (
            <div className="border-t mt-4 pt-3">
              <label className="text-sm text-slate-700 block mb-1">
                Comment (what to change)
              </label>
              <textarea
                rows={4}
                value={crText[key] || ''}
                onChange={(e) =>
                  setCrText((prev) => ({ ...prev, [key]: e.target.value }))
                }
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                placeholder="Be specific about what needs to change…"
                autoFocus
              />
              {crErr[key] && (
                <div className="text-sm text-rose-600 mt-1">{crErr[key]}</div>
              )}

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    submitCR(crFor.proposalId, crFor.bidId, crFor.milestoneIndex)
                  }
                  disabled={!!crBusy[key]}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  {crBusy[key] ? 'Sending…' : 'Send to Vendor'}
                </button>
                <button
                  type="button"
                  className="px-3 py-2 rounded border"
                  onClick={() => setCrFor(null)}
                >
                  Close
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  </div>
)}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
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
