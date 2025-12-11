// src/app/admin/proofs/client.tsx
'use client';

// ============================================================================
// 1. IMPORTS
// ============================================================================
import { useEffect, useMemo, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// API & Logic
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
import {
  isPaid as msIsPaid,
  hasSafeMarker as msHasSafeMarker,
  isApproved as msIsApproved,
  canShowPayButtons as msCanShowPayButtons,
} from '@/lib/milestonePaymentState';
import useMilestonesUpdated from '@/hooks/useMilestonesUpdated';

// Components
import SafePayButton from '@/components/SafePayButton';
import ChangeRequestsPanel from '@/components/ChangeRequestsPanel';

// ============================================================================
// 2. CONFIGURATION & CONSTANTS
// ============================================================================

// API Base
const RAW_API_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
const API_BASE = RAW_API_BASE;
const apiUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path);

// IPFS Gateway
const BASE_GW = (
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
  'https://gateway.pinata.cloud'
)
  .replace(/\/+$/, '')
  .replace(/(?:\/ipfs)+$/i, '');

const GW = `${BASE_GW}/ipfs/`;

// Debug Flags
const DEBUG_FILES =
  typeof window !== 'undefined' &&
  (localStorage.getItem('debug_files') === 'true' || process.env.NODE_ENV === 'development');

const SAFE_DEBUG =
  typeof window !== 'undefined' &&
  (process.env.NEXT_PUBLIC_DEBUG_SAFE === '1' ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('mx_debug_safe') === '1'));

// Local Storage Keys
const PENDING_LS_KEY = 'mx_pay_pending';
const PENDING_TS_PREFIX = 'mx_pay_pending_ts:';
const PAID_OVERRIDE_LS_KEY = 'mx_paid_override';

// Tabs Configuration
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'needs-approval', label: 'Needs Approval' },
  { key: 'ready-to-pay', label: 'Ready to Pay' },
  { key: 'paid', label: 'Paid' },
  { key: 'no-proof', label: 'No Proof' },
  { key: 'archived', label: 'Archived' },
] as const;

// ============================================================================
// 3. TYPES
// ============================================================================
type TabKey = typeof TABS[number]['key'];
type LightboxState = { urls: string[]; index: number } | null;
type ArchiveInfo = { archived: boolean; archivedAt?: string | null; archiveReason?: string | null };

// ============================================================================
// 4. UTILITY FUNCTIONS (Pure Logic)
// ============================================================================

const mkKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

// --- File / IPFS Utilities ---

function isImg(s?: string) {
  if (!s) return false;
  return /\.(png|jpe?g|gif|webp|svg)(?=($|\?|#))/i.test(s);
}

function isImageFile(f: any, href: string): boolean {
  const mime = f?.mime || f?.mimetype || f?.contentType || f?.['content-type'] || '';
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

// --- Local Storage Helpers ---

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
  } catch { }
}

// ============================================================================
// 5. INDEPENDENT SUB-COMPONENTS
// ============================================================================

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
                  alt={file.name || 'image'}
                  className="h-24 w-24 object-cover group-hover:scale-105 transition"
                  onError={(e) => {
                    if (DEBUG_FILES) console.log('🔍 Image failed to load:', href);
                    // Don't hide, show alt text or placeholder
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement?.classList.add('bg-gray-100', 'flex', 'items-center', 'justify-center');
                    const span = document.createElement('span');
                    span.innerText = '❌ Img';
                    span.className = 'text-xs text-red-500 font-bold';
                    e.currentTarget.parentElement?.appendChild(span);
                  }}
                  onLoad={() => {
                    if (DEBUG_FILES) console.log('🔍 Image loaded:', href);
                  }}
                />
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

// ============================================================================
// 6. MAIN CLIENT COMPONENT
// ============================================================================

export default function Client({ initialBids = [] as any[] }: { initialBids?: any[] }) {
  // --- State: UI & Data ---
  const [loading, setLoading] = useState(initialBids.length === 0);
  const [bids, setBids] = useState<any[]>(initialBids);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const router = useRouter();

  // --- State: Filtering & Search ---
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  // --- State: Interaction (Lightbox / CR / Expansion) ---
  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const [crFor, setCrFor] = useState<{ bidId: number; proposalId: number; milestoneIndex: number } | null>(null);
  const [crText, setCrText] = useState<Record<string, string>>({});
  const [crBusy, setCrBusy] = useState<Record<string, boolean>>({});
  const [crErr, setCrErr] = useState<Record<string, string | null>>({});

  // ** New: Accordion state **
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // --- State: Caching & Local Tracking ---
  const [rejectedLocal, setRejectedLocal] = useState<Set<string>>(new Set());
  const [archMap, setArchMap] = useState<Record<string, ArchiveInfo>>({});
  const [latestProofByKey, setLatestProofByKey] = useState<Record<string, { description?: string; files?: any[]; status?: string }>>({});
  const [dataCache, setDataCache] = useState<{ bids: any[]; lastUpdated: number }>({ bids: [], lastUpdated: 0 });

  // --- State: Payment Persistence ---
  const [pendingPay, setPendingPay] = useState<Set<string>>(() =>
    typeof window !== 'undefined' ? loadSet(PENDING_LS_KEY) : new Set()
  );
  const [paidOverride, setPaidOverride] = useState<Set<string>>(() =>
    typeof window !== 'undefined' ? loadSet(PAID_OVERRIDE_LS_KEY) : new Set()
  );

  // --- Refs ---
  const safeStatusCache = useRef<Map<string, { isExecuted: boolean; txHash?: string | null; at: number }>>(new Map());
  const pollers = useRef<Set<string>>(new Set());
  const bcRef = useRef<BroadcastChannel | null>(null);

  // --------------------------------------------------------------------------
  // Helper: Accordion Toggle
  // --------------------------------------------------------------------------
  const toggleExpanded = (key: string) => {
    const next = new Set(expandedIds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedIds(next);
  };

  // --------------------------------------------------------------------------
  // Inner Component: Agent2 Panel
  // --------------------------------------------------------------------------
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
        const list: any[] = Array.isArray(r) ? r : (Array.isArray((r as any)?.proofs) ? (r as any).proofs : []);
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
        } catch { }
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
      <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm font-semibold flex items-center gap-2">
            ✨ AI Analysis (Agent 2)
          </div>
          <button
            onClick={rerun}
            disabled={!proofId}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
            title={proofId ? 'Re-run analysis' : 'No proof found for this milestone'}
          >
            ↻ Re-run
          </button>
        </div>

        {loading && <div className="mt-2 text-sm text-slate-500">Loading analysis…</div>}
        {error && <div className="mt-2 text-sm text-rose-600">{error}</div>}
        {!loading && !analysis && !error && <div className="mt-2 text-sm text-slate-500 italic">No analysis available.</div>}

        {analysis && (
          <div className="space-y-3 text-sm">
            {summary && (
              <div className="text-slate-800">{summary}</div>
            )}
            <div className="flex flex-wrap gap-2">
              {typeof fit !== 'undefined' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-white border text-slate-600 text-xs shadow-sm">Fit: {String(fit)}</span>
              )}
              {typeof confidence !== 'undefined' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-white border text-slate-600 text-xs shadow-sm">
                  Confidence: {String(confidence)}
                </span>
              )}
            </div>
            {risks.length > 0 && (
              <div className="text-rose-700 text-xs">
                <span className="font-semibold">Risks:</span> {risks.join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Logic: Broadcast & Messaging
  // --------------------------------------------------------------------------
  function emitPayQueued(bidId: number, milestoneIndex: number) {
    try {
      bcRef.current?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex });
    } catch { }
  }
  function emitPayDone(bidId: number, milestoneIndex: number) {
    try {
      bcRef.current?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex });
    } catch { }
  }
  function emitMilestonesUpdated(detail: any) {
    try { window.dispatchEvent(new CustomEvent('milestones:updated', { detail })); } catch { }
    try { bcRef.current?.postMessage({ type: 'mx:ms:updated', ...detail }); } catch { }
  }

  // --------------------------------------------------------------------------
  // Logic: Change Requests
  // --------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------
  // Logic: Pending/Paid Local Cache
  // --------------------------------------------------------------------------
  function addPending(key: string) {
    try { if (typeof window !== 'undefined') localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, String(Date.now())); } catch { }
    setPendingPay((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveSet(PENDING_LS_KEY, next);
      return next;
    });
  }
  function removePending(key: string) {
    try { if (typeof window !== 'undefined') localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`); } catch { }
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

  // --------------------------------------------------------------------------
  // Logic: Safe Transaction Polling
  // --------------------------------------------------------------------------
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
          try { invalidateBidsCache(); } catch { }
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

  // --------------------------------------------------------------------------
  // Logic: Data Loading & Archiving
  // --------------------------------------------------------------------------

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
          if (needsPoll && !pollers.current.has(key)) pollUntilPaid(bid.bidId, i).catch(() => { });
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
          for (const k of Array.from(prev)) {
            if (!validKeys.has(k)) {
              next.delete(k);
              changed = true;
            }
          }
          if (changed) saveSet(PENDING_LS_KEY, next);
          return next;
        });
      } catch { }

      setDataCache({ bids: rows, lastUpdated: Date.now() });
      setBids(rows);

      // 🔁 Fetch latest proofs per milestone (same source Agent2 uses)
      const map: Record<string, { description?: string; files?: any[]; status?: string }> = {};
      for (const bid of rows) {
        let list: any[] = [];
        try {
          const r = await getProofs(bid.bidId);
          list = Array.isArray(r) ? r : (Array.isArray((r as any)?.proofs) ? (r as any).proofs : []);
        } catch (e) {
          // console.error(`[DEBUG] Failed to fetch proofs for bid ${bid.bidId}`, e);
        }
        const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
        for (let i = 0; i < ms.length; i++) {
          const allForMs = (list || [])
            .filter((p: any) => (p.milestoneIndex ?? p.milestone_index) === i)
            .sort((a: any, b: any) => {
              const at = new Date(a.updatedAt ?? a.submitted_at ?? a.createdAt ?? 0).getTime() || 0;
              const bt = new Date(b.updatedAt ?? b.submitted_at ?? b.createdAt ?? 0).getTime() || 0;
              return bt - at;
            });

          const mine = allForMs[0];

          // Collect ALL files from ALL proofs for this milestone (deduplicated)
          // This ensures that if the "latest" logic fails or if we want to see history, we see everything.
          const allFiles: any[] = [];
          const seenUrls = new Set<string>();

          for (const p of allForMs) {
            const files = p.files || p.file_json || p.attachments || p.ai_analysis?.files || p.aiAnalysis?.files || [];
            if (Array.isArray(files)) {
              for (const f of files) {
                const u = (f?.url || f || '').toString().trim();
                if (u && !seenUrls.has(u)) {
                  seenUrls.add(u);
                  allFiles.push(f);
                }
              }
            }
          }

          if (mine) {
            map[mkKey(bid.bidId, i)] = {
              description: mine?.description || mine?.text || mine?.vendor_prompt || mine?.title || '',
              files: allFiles,
              status: mine?.status,
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
    const uniqueBidIds = Array.from(
      new Set(allBids.map((bid) => Number(bid.bidId)).filter(Number.isFinite))
    );

    if (uniqueBidIds.length === 0) {
      setArchMap({});
      return;
    }

    try {
      const bulkArchiveStatus = await getBulkArchiveStatus(uniqueBidIds);
      updateBulkArchiveCache(bulkArchiveStatus);

      // Build a fresh map each time so UI updates immediately after archive/unarchive
      const nextMap: Record<string, ArchiveInfo> = {};

      for (const bid of allBids) {
        const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
        const byIdx = bulkArchiveStatus[bid.bidId] || {};

        for (let index = 0; index < ms.length; index++) {
          const key = mkKey(bid.bidId, index);
          const info = byIdx[index] || { archived: false };
          nextMap[key] = {
            archived: !!info.archived,
            archivedAt: info.archivedAt ?? null,
            archiveReason: info.archiveReason ?? null,
          };
        }
      }

      setArchMap(nextMap);
    } catch {
      await hydrateArchiveStatusesFallback(allBids);
    }
  }

  async function hydrateArchiveStatusesFallback(allBids: any[]) {
    const tasks: Array<Promise<void>> = [];
    // Build from scratch so we don't keep stale keys around
    const nextMap: Record<string, ArchiveInfo> = {};

    for (const bid of allBids || []) {
      const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
      for (let i = 0; i < ms.length; i++) {
        const key = mkKey(bid.bidId, i);
        tasks.push(
          (async () => {
            try {
              const j = await getMilestoneArchive(bid.bidId, i);
              const mi = (j as any)?.milestone ?? j;
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
    }
    setArchMap(nextMap);
  }

  // --------------------------------------------------------------------------
  // Effects
  // --------------------------------------------------------------------------

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('mx-payments');
      bcRef.current = bc;
    } catch { }

    if (bc) {
      bc.onmessage = (e: MessageEvent) => {
        const { type, bidId, milestoneIndex, archived, reason } = (e?.data || {}) as any;
        if (!type) return;

        if (type === 'mx:pay:queued') {
          const key = mkKey(Number(bidId), Number(milestoneIndex));
          addPending(key);
          pollUntilPaid(Number(bidId), Number(milestoneIndex)).catch(() => { });
          return; // no full reload here
        }

        if (type === 'mx:pay:done') {
          removePending(mkKey(Number(bidId), Number(milestoneIndex)));
          return; // no full reload here
        }

        if (type === 'mx:ms:updated') {
          // If archive info is provided, flip UI instantly without refetch.
          if (
            Number.isFinite(Number(bidId)) &&
            Number.isFinite(Number(milestoneIndex)) &&
            typeof archived === 'boolean'
          ) {
            const k = mkKey(Number(bidId), Number(milestoneIndex));
            setArchMap(prev => ({
              ...prev,
              [k]: archived
                ? { archived: true, archivedAt: new Date().toISOString(), archiveReason: reason ?? null }
                : { archived: false, archivedAt: null, archiveReason: null },
            }));
            return;
          }
          // Fallback: re-hydrate archive map from server if no explicit info came through
          hydrateArchiveStatuses(bids).catch(() => { });
        }
      };
    }

    if (initialBids.length === 0) {
      loadProofs();
    } else {
      hydrateArchiveStatuses(initialBids).catch(() => { });
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
            if (needsPoll && !pollers.current.has(key)) pollUntilPaid(bid.bidId, i).catch(() => { });
          }
        }
      } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMilestonesUpdated(loadProofs);

  // --------------------------------------------------------------------------
  // Action Handlers
  // --------------------------------------------------------------------------

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
      pollUntilPaid(bidId, milestoneIndex).catch(() => { });
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
          } catch { }
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

  // --------------------------------------------------------------------------
  // Helpers: Filtering & Rendering
  // --------------------------------------------------------------------------

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
            ? withIdx.filter(({ idx }: { idx: number }) => !isArchived(bid.bidId, idx))
            : withIdx.filter(({ m, idx }: { m: any; idx: number }) => milestoneMatchesTab(m, bid.bidId, idx));
        return { ...bid, _withIdxAll: withIdx, _withIdxVisible: visibleWithIdx };
      })
      .filter((b: any) => (b._withIdxVisible?.length ?? 0) > 0);
  }, [bids, tab, query, archMap, pendingPay, paidOverride]);

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
    const urls = Array.from(text.matchAll(urlRegex)).map((match) => match[0]);

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

  // ============================================================================
  // 7. MAIN RENDER
  // ============================================================================

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
    <div className="max-w-5xl mx-auto py-8 px-4">
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

      <div className="mb-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Processed / History
      </div>

      {(filtered || []).length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <div className="text-5xl mb-3">{tab === 'archived' ? '📁' : '🗂️'}</div>
          <p className="text-slate-700">{tab === 'archived' ? 'No archived milestones.' : 'No items match this view.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((bid: any) => (
            (bid._withIdxVisible as Array<{ m: any; idx: number }>).map(({ m, idx: origIdx }) => {
              const key = mkKey(bid.bidId, origIdx);
              const isExpanded = expandedIds.has(key);

              const approved = msIsApproved(m) || isCompleted(m);
              const paid = msIsPaid(m) || paidOverride.has(key);
              const localPending = pendingPay.has(key);
              const hasRealSafeHash = !!readSafeTxHash(m);
              const showPendingChip = !paid && (localPending || (hasRealSafeHash && msHasSafeMarker(m)));
              const showRequestChanges = hasProof(m) && !approved && !paid && !isArchived(bid.bidId, origIdx);

              // 👉 Build file list: prefer /proofs (Agent2 source), else milestone
              const lp = latestProofByKey[key];
              const fromProofs = entriesFromProofFiles(lp?.files || []);
              const fromMilestone = extractFilesFromMilestone(m);
              const filesToShow = fromProofs.length ? fromProofs : fromMilestone;

              // WORKAROUND: The remote backend fails to reset status to 'pending' on resubmission.
              // We must treat 'rejected' status as 'pending' (Needs Review) if a proof record exists,
              // otherwise the admin effectively cannot see the new submission.
              const lpIsPending = lp?.status === 'pending' || (lp && !lp.status);

              // Only consider it rejected if there is NO proof, or if we explicitly decide to trust the status 
              // BUT here we force it: if lp exists, we assume it needs review.
              // The only case it is "rejected" is if m.status is rejected AND we don't have a fresh proof?
              // Actually, let's just say: It is NOT rejected if we have a proof. 
              // We want to force the "Needs Review" state.
              const isRejectedServer = m?.status === 'rejected' && !lp;

              const rejected = isRejectedServer || rejectedLocal.has(key);

              // ✅ FIX: hasProof should be true if we have a latest proof record, even if m.proof is empty
              const proofExists = hasProof(m) || !!lp;

              return (
                <div key={`${bid.bidId}:${origIdx}`} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all">

                  {/* ACCORDION HEADER (Clickable) */}
                  <div
                    onClick={() => toggleExpanded(key)}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                  >
                    <div className="flex items-center gap-4">
                      {/* Status Icon Circle */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${approved ? 'bg-emerald-100 text-emerald-600' :
                        rejected ? 'bg-rose-100 text-rose-600' :
                          proofExists ? 'bg-amber-100 text-amber-600' :
                            'bg-slate-100 text-slate-400'
                        }`}>
                        {approved ? '✓' : rejected ? '✕' : proofExists ? '!' : '○'}
                      </div>

                      <div>
                        <h3 className="font-bold text-slate-900">{m.name}</h3>
                        <p className="text-xs text-slate-500">
                          Bid #{bid.bidId} · <span className="uppercase">{bid.vendorName}</span> · ${m.amount}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Status Badges */}
                      {paid && (
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                          Paid ↗
                        </span>
                      )}
                      {approved && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                          APPROVED
                        </span>
                      )}

                      {/* WORKAROUND: If we have a proof (lp), but status is 'rejected', it might be a resubmission
                       * that the buggy backend didn't reset. Show as "Needs Review" (pending) to be safe. */}
                      {(() => {
                        const showAsPending = lp && lp.status === 'rejected';
                        if (isRejectedServer && !lpIsPending && !showAsPending) {
                          return (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                              REJECTED
                            </span>
                          );
                        }
                        // Only show Needs Review if NOT approved
                        if (!approved && (lpIsPending || (lp && lp.status === 'rejected'))) {
                          return (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                              Needs Review
                            </span>
                          );
                        }
                        return null;
                      })()}

                      {showPendingChip && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                          PENDING PAYMENT
                        </span>
                      )}

                      {/* Chevron */}
                      <svg
                        className={`w-5 h-5 text-slate-400 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* EXPANDABLE BODY */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/30">
                      <div className="px-6 py-6">
                        <DebugPanel data={m} title={`Milestone Data: ${origIdx}`} />

                        {/* Proof text/description */}
                        {renderProof(m)}

                        {/* FIX: Remove the '!' and use a strict start/end anchor regex to check if it IS a URL */}
                        {(!m?.proof || (typeof m.proof === 'string' && /^(https?:\/\/[^\s]+)$/i.test(m.proof.trim()))) && lp?.description && (
                          <p className="text-sm text-gray-700 mt-2 bg-white p-3 rounded border border-slate-100 shadow-sm">
                            {lp.description}
                          </p>
                        )}

                        {/* Files */}
                        <div className="mt-4">
                          <FilesStrip files={filesToShow} onImageClick={(urls, index) => setLightbox({ urls, index })} />
                        </div>

                        {/* Agent2 Panel */}
                        <Agent2PanelInline bidId={bid.bidId} milestoneIndex={origIdx} />

                        {/* Change Request Thread */}
                        {!isArchived(bid.bidId, origIdx) && (
                          <div className="mt-6 pt-4 border-t border-slate-200">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Change Request History</h4>
                            <ChangeRequestsPanel
                              key={`cr:${bid.proposalId}:${origIdx}`}
                              proposalId={Number(bid.proposalId)}
                              initialMilestoneIndex={origIdx}
                              forceMilestoneIndex={origIdx}
                              hideMilestoneTabs
                              milestoneStatus={m.status || (m.paymentTxHash || m.safePaymentTxHash || m.paymentDate ? 'paid' : (m.completed ? 'completed' : 'pending'))}
                            />
                          </div>
                        )}

                        {/* Tx Info */}
                        {(m.paymentTxHash || m.safePaymentTxHash) && (
                          <div className="mt-4 p-2 bg-green-50 text-green-700 text-xs rounded border border-green-100 flex items-center gap-2 w-fit">
                            ✅ <strong>Paid:</strong> <span className="font-mono truncate max-w-[200px]">{m.paymentTxHash || m.safePaymentTxHash}</span>
                          </div>
                        )}

                        {!proofExists && !approved && (
                          <div className="mt-4 p-3 bg-amber-50 text-amber-800 text-sm rounded border border-amber-100 text-center">
                            ⏳ No proof submitted yet.
                          </div>
                        )}
                      </div>

                      {/* ACTION TOOLBAR (Only visible when expanded) */}
                      {tab !== 'archived' && (
                        <div className="bg-white border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-4">

                          {/* LEFT: Admin Actions */}
                          <div className="flex items-center gap-2">
                            {!isArchived(bid.bidId, origIdx) ? (
                              <button
                                onClick={() => handleArchive(bid.bidId, origIdx)}
                                disabled={processing === `archive-${bid.bidId}-${origIdx}`}
                                className="px-4 py-2 rounded bg-slate-700 text-white hover:bg-slate-800 text-sm font-medium transition shadow-sm disabled:opacity-50"
                                title="Hide this milestone"
                              >
                                {processing === `archive-${bid.bidId}-${origIdx}` ? 'Archiving…' : 'Archive'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUnarchive(bid.bidId, origIdx)}
                                disabled={processing === `unarchive-${bid.bidId}-${origIdx}`}
                                className="px-4 py-2 rounded bg-slate-600 text-white hover:bg-slate-700 text-sm font-medium transition shadow-sm disabled:opacity-50"
                              >
                                {processing === `unarchive-${bid.bidId}-${origIdx}` ? 'Unarchiving…' : 'Unarchive'}
                              </button>
                            )}

                            {proofExists && !approved && !rejected && (() => {
                              const rKey = mkKey(bid.bidId, origIdx);
                              const isProcessing = processing === `reject-${bid.bidId}-${origIdx}`;
                              const isLocked = rejectedLocal.has(rKey);
                              const disabled = isProcessing || isLocked;
                              return (
                                <button
                                  onClick={() => handleReject(bid.bidId, origIdx)}
                                  disabled={disabled}
                                  className={`px-4 py-2 rounded border border-red-200 text-red-600 bg-white hover:bg-red-50 text-sm font-medium transition shadow-sm disabled:opacity-50 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  {isProcessing ? 'Rejecting...' : isLocked ? 'Rejected' : 'Reject'}
                                </button>
                              );
                            })()}
                          </div>

                          {/* RIGHT: Primary Actions */}
                          <div className="flex items-center gap-3">
                            {showRequestChanges && (
                              <button
                                onClick={() =>
                                  setCrFor({
                                    bidId: Number(bid.bidId),
                                    proposalId: Number(bid.proposalId),
                                    milestoneIndex: origIdx,
                                  })
                                }
                                className="px-4 py-2 rounded border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 text-sm font-medium transition shadow-sm"
                              >
                                Request Changes
                              </button>
                            )}

                            {proofExists && !approved && !rejected && (
                              <button
                                onClick={() => handleApprove(bid.bidId, origIdx, m.proof)}
                                disabled={processing === `approve-${bid.bidId}-${origIdx}`}
                                className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded text-sm font-medium shadow-sm transition disabled:opacity-50"
                              >
                                {processing === `approve-${bid.bidId}-${origIdx}` ? 'Approving...' : 'Approve Proof'}
                              </button>
                            )}

                            {msCanShowPayButtons(m, { approved, localPending }) && !paid && (
                              <div className="flex items-center gap-2 pl-2 border-l border-slate-200 bg-emerald-50/50 p-1 rounded-lg">
                                <button
                                  type="button"
                                  onClick={() => handlePay(bid.bidId, origIdx)}
                                  disabled={processing === `pay-${bid.bidId}-${origIdx}`}
                                  className={`px-4 py-2 rounded text-white text-sm font-medium shadow-sm transition ${processing === `pay-${bid.bidId}-${origIdx}` ? 'bg-emerald-600 opacity-60 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                  title="Release payment manually (EOA)"
                                >
                                  {processing === `pay-${bid.bidId}-${origIdx}` ? 'Paying...' : 'Pay (Manual)'}
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
                                    pollUntilPaid(bid.bidId, origIdx).catch(() => { });
                                    router.refresh();
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
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
                proposalId={Number(crFor.proposalId)}
                initialMilestoneIndex={crFor.milestoneIndex}
                forceMilestoneIndex={crFor.milestoneIndex}
                hideMilestoneTabs
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