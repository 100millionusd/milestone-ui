'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids, getBid, getAuthRoleOnce, getProofs, payMilestone } from '@/lib/api';
import AdminProofs from '@/components/AdminProofs';
import MilestonePayments from '@/components/MilestonePayments';
import ChangeRequestsPanel from '@/components/ChangeRequestsPanel';
import useMilestonesUpdated from '@/hooks/useMilestonesUpdated';
import SafePayButton from '@/components/SafePayButton';
import {
  isPaid as msIsPaid,
  hasSafeMarker as msHasSafeMarker,
} from '@/lib/milestonePaymentState';

// ---------------- Consts ----------------
const PINATA_GATEWAY = (() => {
  const raw1 = (process.env.NEXT_PUBLIC_PINATA_GATEWAY || '').trim();
  if (raw1) {
    const host = raw1
      .replace(/^https?:\/\//i, '')
      .replace(/\/+$/, '')
      .replace(/(?:\/ipfs)+$/i, '');
    return `https://${host}/ipfs`;
  }

  const raw2 = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud').trim();
  const base = raw2
    .replace(/\/+$/, '')
    .replace(/(?:\/ipfs)+$/i, '');
  return `${base}/ipfs`;
})();

// ⚠️ Proofs endpoint
const PROOFS_ENDPOINT =
  process.env.NEXT_PUBLIC_PROOFS_ENDPOINT && process.env.NEXT_PUBLIC_PROOFS_ENDPOINT.trim() !== ''
    ? process.env.NEXT_PUBLIC_PROOFS_ENDPOINT.replace(/\/+$/, '')
    : '/api/proofs';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// ---------------- Types -----------------
type AnalysisV2 = {
  status?: 'ready' | 'error' | string;
  summary?: string;
  fit?: 'low' | 'medium' | 'high';
  risks?: string[];
  milestoneNotes?: string[];
  confidence?: number;
  pdfUsed?: boolean;
  pdfDebug?: any;
};

type AnalysisV1 = {
  verdict?: string;
  reasoning?: string;
  suggestions?: string[];
  status?: 'ready' | 'error' | string;
};

type Milestone = {
  name?: string;
  amount?: number;
  dueDate?: string;
  completed?: boolean;
  completionDate?: string | null;
  paymentTxHash?: string | null;
  paymentDate?: string | null;
  proof?: string;
  files?: Array<{ url?: string; cid?: string; name?: string } | string>;
};

type ProofFile = { url?: string; cid?: string; name?: string } | string;
type ProofRecord = {
  proposalId: number;
  milestoneIndex?: number;
  note?: string;
  files?: ProofFile[];
  urls?: string[];
  cids?: string[];
};

type TabKey = 'overview' | 'timeline' | 'bids' | 'milestones' | 'files' | 'admin';

// -------------- Helpers --------------
function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}
function fmt(dt?: string | null) {
  if (!dt) return '';
  const d = new Date(dt);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
}
function coerceAnalysis(a: any): (AnalysisV2 & AnalysisV1) | null {
  if (!a) return null;
  if (typeof a === 'string') { try { return JSON.parse(a); } catch { return null; } }
  if (typeof a === 'object') return a as any;
  return null;
}
function parseMilestones(raw: unknown): Milestone[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Milestone[];
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? (arr as Milestone[]) : [];
  } catch {
    return [];
  }
}
function parseDocs(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
  }
  return [];
}
function normalizeIpfsUrl(input?: string, cid?: string) {
  const GW = PINATA_GATEWAY.replace(/\/+$/, '');
  if (cid && (!input || /^\s*$/.test(input))) return `${GW}/${cid}`;
  if (!input) return '';
  let u = String(input).trim();
  const m = u.match(/^([A-Za-z0-9]{46,})(\?.*)?$/);
  if (m) return `${GW}/${m[1]}${m[2] || ''}`;
  u = u.replace(/^ipfs:\/\//i, '');
  u = u.replace(/^\/+/, '');
  u = u.replace(/^(?:ipfs\/)+/i, '');
  if (!/^https?:\/\//i.test(u)) u = `${GW}/${u}`;
  u = u.replace(/\/ipfs\/(?:ipfs\/)+/gi, '/ipfs/');
  return u;
}
function filesFromProofRecords(items: ProofRecord[]) {
  const isBad = (u?: string) =>
    !u || u.includes('<gw>') || u.includes('<CID') || u.includes('>') || /^\s*$/.test(u);
  const fixProtocol = (u: string) =>
    /^https?:\/\//i.test(u) ? u : `https://${u.replace(/^https?:\/\//, '')}`;
  const rows: Array<{ scope: string; doc: any }> = [];
  for (const p of (items || [])) {
    const mi = Number.isFinite(p?.milestoneIndex) ? Number(p.milestoneIndex) : undefined;
    const scope = typeof mi === 'number' ? `Milestone ${mi + 1} proof` : 'Proofs';
    const list: ProofFile[] = []
      .concat(p.files || [])
      .concat((p.urls || []) as ProofFile[])
      .concat((p.cids || []) as ProofFile[]);
    for (const raw of list) {
      let url: string | undefined;
      if (typeof raw === 'string') {
        url = raw;
      } else if (raw && typeof raw === 'object') {
        url = (raw as any).url || ((raw as any).cid ? `${PINATA_GATEWAY}/${(raw as any).cid}` : undefined);
      }
      if (!url || isBad(url)) continue;
      url = fixProtocol(url);
      const nameFromUrl = decodeURIComponent((url.split('/').pop() || '').trim());
      const explicitName =
        typeof raw === 'object' && raw && (raw as any).name
          ? String((raw as any).name)
          : undefined;
      const name = explicitName && explicitName.toLowerCase() !== 'file' ? explicitName : nameFromUrl || 'file';
      rows.push({ scope, doc: { url, name } });
    }
  }
  return rows;
}
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
function isImageName(n?: string) {
  return !!n && /\.(png|jpe?g|gif|webp|svg)$/i.test(n);
}

// ---- local helpers: keys ----
const msKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

// -------------- Component ----------------
export default function ProjectDetailPage() {
  const params = useParams();
  const projectIdParam = (params as any)?.id;
  const projectIdNum = Number(Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam);

  const [project, setProject] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingProofs, setLoadingProofs] = useState(true);
  const [me, setMe] = useState<{ address?: string; role?: 'admin'|'vendor'|'guest' }>({ role: 'guest' });
  const [tab, setTab] = useState<TabKey>('overview');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [proofJustSent, setProofJustSent] = useState<Record<string, boolean>>({});
  const [releasingKey, setReleasingKey] = useState<string | null>(null);

  // --- SINGLE-POLL + DEBOUNCED REFRESH HELPERS ---
  const activePollsRef = useRef<Set<string>>(new Set());
  const makeKey = (bidId: number, idx: number) => `${bidId}-${idx}`;
  function startPollUntilPaid(bidId: number, idx: number, tries = 100, intervalMs = 3000) {
    const k = makeKey(bidId, idx);
    if (activePollsRef.current.has(k)) return;
    activePollsRef.current.add(k);
    pollUntilPaid(bidId, idx, tries, intervalMs)
      .catch(() => {})
      .finally(() => activePollsRef.current.delete(k));
  }
  const refreshDebounceRef = useRef<number | null>(null);
  function requestDebouncedRefresh(run: () => void | Promise<void>, delay = 500) {
    if (refreshDebounceRef.current) return;
    refreshDebounceRef.current = window.setTimeout(() => {
      refreshDebounceRef.current = null;
      Promise.resolve(run()).catch(() => {});
    }, delay);
  }

  // Full approved bid
  const [approvedFull, setApprovedFull] = useState<any>(null);
  const approvedBidId =
    Array.isArray(bids) ? Number((bids.find((b: any) => b?.status === 'approved') || {}).bidId) : NaN;

  useEffect(() => {
    if (!Number.isFinite(approvedBidId)) { setApprovedFull(null); return; }
    getBid(approvedBidId)
      .then(setApprovedFull)
      .catch(() => setApprovedFull(null));
  }, [approvedBidId]);

  async function refreshApproved(bidId?: number) {
    const id = Number(bidId ?? approvedBidId);
    if (!Number.isFinite(id)) return;
    try { setApprovedFull(await getBid(id)); } catch {}
  }

  // Persist local pending
  const PENDING_LS_KEY = 'mx_pay_pending';
  const PENDING_TS_PREFIX = 'mx_pay_pending_ts:';
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

  const [safePending, setSafePending] = useState<Set<string>>(
    () => (typeof window !== 'undefined' ? loadPendingFromLS() : new Set())
  );
  const addSafePending = (key: string) => {
    setSafePending(prev => {
      const next = new Set(prev);
      next.add(key);
      savePendingToLS(next);
      try { localStorage.setItem(`${PENDING_TS_PREFIX}${key}`, String(Date.now())); } catch {}
      return next;
    });
  };
  const removeSafePending = (key: string) => {
    setSafePending(prev => {
      const next = new Set(prev);
      next.delete(key);
      savePendingToLS(next);
      try { localStorage.removeItem(`${PENDING_TS_PREFIX}${key}`); } catch {}
      return next;
    });
  };

  const safeBids = Array.isArray(bids)
    ? bids.filter((b): b is any => !!b && typeof b === 'object')
    : [];

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };

  // Initial fetch
  useEffect(() => {
    let alive = true;
    async function run() {
      if (!Number.isFinite(projectIdNum)) return;
      try {
        const [p, b] = await Promise.all([ getProposal(projectIdNum), getBids(projectIdNum) ]);
        if (!alive) return;
        setProject(p);
        setBids(Array.isArray(b) ? b : []);
        setErrorMsg(null);
      } catch (e: any) {
        if (!alive) return;
        setErrorMsg(e?.message || 'Failed to load project');
      } finally {
        if (alive) setLoadingProject(false);
      }
    }
    run();
    return () => { alive = false; };
  }, [projectIdNum]);

  // Auth
  useEffect(() => {
    getAuthRoleOnce().then(setMe).catch(() => {});
  }, []);

  // Fetch proofs (merged)
  const refreshProofs = async () => {
    if (!Number.isFinite(projectIdNum)) return;
    setLoadingProofs(true);

    try {
      const localUrl = `${PROOFS_ENDPOINT}?proposalId=${encodeURIComponent(projectIdNum)}&_t=${Date.now()}`;
      const localReq = fetch(localUrl, { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : []))
        .catch(() => []);

      const accepted = safeBids.find(b => b.status === 'approved') || safeBids[0] || null;

      const adminReq = accepted
        ? getProofs(Number(accepted.bidId))
            .then(rows => {
              return (Array.isArray(rows) ? rows : []).map((p: any) => ({
                proposalId: projectIdNum,
                milestoneIndex: Number(p?.milestoneIndex ?? p?.milestone_index),
                note: p?.description || p?.title || '',
                files: Array.isArray(p?.files) ? p.files.map((f: any) => ({
                  url: f?.url || '',
                  name: f?.name || (f?.url ? decodeURIComponent(String(f.url).split('/').pop() || 'file') : 'file'),
                })) : [],
              }));
            })
            .catch(() => [])
        : Promise.resolve([]);

      const [localRows, adminRows] = await Promise.all([localReq, adminReq]);

      const key = (r: any, f: any) => `${Number(r.milestoneIndex)}|${String((f?.url || '').trim()).toLowerCase()}`;
      const seen = new Set<string>();
      const merged: any[] = [];

      function pushRecord(r: any) {
        const files = Array.isArray(r.files) ? r.files : [];
        for (const f of files) {
          const k = key(r, f);
          if (!f?.url || seen.has(k)) continue;
          seen.add(k);
          merged.push({
            proposalId: projectIdNum,
            milestoneIndex: Number(r.milestoneIndex),
            note: r.note || '',
            files: [{ url: String(f.url), name: String(f.name || 'file') }],
          });
        }
      }

      (Array.isArray(localRows) ? localRows : []).forEach(pushRecord);
      (Array.isArray(adminRows) ? adminRows : []).forEach(pushRecord);

      const byMs = new Map<number, { proposalId:number; milestoneIndex:number; note?:string; files:any[] }>();
      for (const r of merged) {
        const ms = Number(r.milestoneIndex);
        if (!byMs.has(ms)) byMs.set(ms, { proposalId: projectIdNum, milestoneIndex: ms, note: '', files: [] });
        byMs.get(ms)!.files.push(...r.files);
      }

      setProofs(Array.from(byMs.values()));
    } catch (e) {
      console.warn('refreshProofs failed:', e);
      setProofs([]);
    } finally {
      setLoadingProofs(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!Number.isFinite(projectIdNum)) return;
      try { await refreshProofs(); } catch {}
      if (!alive) return;
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdNum]);

  // Re-hydrate when any page archives/unarchives a milestone
useMilestonesUpdated(async () => {
  await refreshProofs();
  await refreshApproved(); // <-- make Release button appear without page reload
  setTimeout(async () => {
    try { setBids(await getBids(projectIdNum)); } catch {}
  }, 50);
});


 // Cross-page payment sync (REPLACE THIS ENTIRE BLOCK)
const payChanRef = useRef<BroadcastChannel | null>(null);
useEffect(() => {
  let bc: BroadcastChannel | null = null;
  try { bc = new BroadcastChannel('mx-payments'); } catch {}
  payChanRef.current = bc;

  const onMsg = async (e: MessageEvent) => {
    const { type, bidId, milestoneIndex } = (e?.data || {}) as any;
    if (!type) return;

    const b = Number(bidId);
    const i = Number(milestoneIndex);

    if (type === 'mx:pay:queued') {
      addSafePending(msKey(b, i));
      startPollUntilPaid(b, i);
    } else if (type === 'mx:pay:done') {
      removeSafePending(msKey(b, i));
    } else if (type === 'mx:ms:updated') {
      // Proof was approved elsewhere → milestone marked completed.
      await refreshApproved(b); // refresh the full bid (drives the payments UI)
    }

    await refreshProofs();
    requestDebouncedRefresh(async () => {
      const next = await getBids(projectIdNum);
      setBids(Array.isArray(next) ? next : []);
    }, 500);
  };

  if (bc) bc.onmessage = onMsg;

  return () => {
    if (bc) {
      try { bc.onmessage = null as any; bc.close(); } catch {}
    }
    payChanRef.current = null;
  };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [projectIdNum]);

  useEffect(() => {
    if (tab === 'files') { refreshProofs(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
 const onAnyProofUpdate = (ev: any) => {
  const pid = Number(ev?.detail?.proposalId);
  if (!Number.isFinite(pid) || pid === projectIdNum) {
    refreshProofs();
    refreshApproved(); // <-- critical so completed status is reflected
  }
};
    window.addEventListener('proofs:updated', onAnyProofUpdate);
    window.addEventListener('proofs:changed', onAnyProofUpdate);
    return () => {
      window.removeEventListener('proofs:updated', onAnyProofUpdate);
      window.removeEventListener('proofs:changed', onAnyProofUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdNum]);

  useEffect(() => {
  try {
    const raw = localStorage.getItem('mx_pay_pending');
    const arr: string[] = raw ? JSON.parse(raw) : [];
    let changed = false;

    const migrated = arr.map(k => {
      if (k.includes(':')) { changed = true; return k.replace(':','-'); }
      return k;
    });

    if (changed) {
      localStorage.setItem('mx_pay_pending', JSON.stringify(migrated));
      // migrate timestamps
      arr.forEach(oldK => {
        if (!oldK.includes(':')) return;
        const v = localStorage.getItem(`mx_pay_pending_ts:${oldK}`);
        if (v) {
          localStorage.setItem(`mx_pay_pending_ts:${oldK.replace(':','-')}`, v);
          localStorage.removeItem(`mx_pay_pending_ts:${oldK}`);
        }
      });
    }
  } catch {}
}, []);

  useEffect(() => {
    const onJustSent = (ev: any) => {
      const bidId = Number(ev?.detail?.bidId);
      const idx   = Number(ev?.detail?.milestoneIndex);
      if (!Number.isFinite(bidId) || !Number.isFinite(idx)) return;

      setProofJustSent(prev => ({ ...prev, [msKey(bidId, idx)]: true }));
      setBids(prev => prev.map(b => {
        if (!b || typeof b !== 'object') return b;
        return Number(b.bidId) !== bidId
          ? b
          : {
              ...b,
              milestones: parseMilestones(b.milestones).map((m: any, i: number) =>
                i === idx ? { ...m, proof: m.proof || '{}' } : m
              ),
            };
      }));
    };

    window.addEventListener('proofs:just-sent', onJustSent);
    return () => window.removeEventListener('proofs:just-sent', onJustSent);
  }, []);

  // Poll bids while analysis runs (unchanged)
  useEffect(() => {
    if (!Number.isFinite(projectIdNum)) return;
    const start = Date.now();

    const needsMore = (rows: any[]) =>
      rows.some((row) => {
        const a = coerceAnalysis(row?.aiAnalysis ?? row?.ai_analysis);
        return !a || (a.status && a.status !== 'ready' && a.status !== 'error');
      });

    const tick = async () => {
      try {
        const next = await getBids(projectIdNum);
        const safeNext = Array.isArray(next) ? next.filter(x => !!x && typeof x === 'object') : [];
        setBids(next);
        if (Date.now() - start < 90_000 && needsMore(safeNext)) {
          pollTimer.current = setTimeout(tick, 1500);
        } else {
          clearPoll();
        }
      } catch {
        if (Date.now() - start < 90_000) {
          pollTimer.current = setTimeout(tick, 2000);
        } else {
          clearPoll();
        }
      }
    };

    if (needsMore(safeBids)) {
      clearPoll();
      pollTimer.current = setTimeout(tick, 1500);
    }

    const onFocus = () => {
      if (needsMore(safeBids)) {
        clearPoll();
        pollTimer.current = setTimeout(tick, 0);
      }
    };
    window.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      clearPoll();
      window.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [projectIdNum, safeBids]);

  // Reconcile pending after refresh
  useEffect(() => {
    const rows = Array.isArray(bids) ? bids : [];

    for (const bid of rows) {
      const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
      for (let i = 0; i < ms.length; i++) {
        const k = msKey(Number(bid.bidId), i);
        if (msIsPaid(ms[i])) {
          removeSafePending(k);
        }
      }
    }

    try {
      const now = Date.now();
      const MAX_MS = 30 * 60 * 1000;
      for (const k of Array.from(safePending)) {
        const tsRaw = typeof window !== 'undefined' ? localStorage.getItem(`${PENDING_TS_PREFIX}${k}`) : null;
        const ts = tsRaw ? Number(tsRaw) : 0;
        if (!ts || (now - ts) > MAX_MS) {
          removeSafePending(k);
          continue;
        }
        const [bidIdStr, idxStr] = k.split('-');
        const bidId = Number(bidIdStr), idx = Number(idxStr);
        if (Number.isFinite(bidId) && Number.isFinite(idx)) {
          const bid = rows.find((b: any) => Number(b.bidId) === bidId);
          const m = Array.isArray(bid?.milestones) ? bid.milestones[idx] : null;
          if (!m || (!msIsPaid(m) && !msHasSafeMarker(m))) {
            startPollUntilPaid(bidId, idx);
          }
        }
      }
    } catch {}
  }, [bids, safePending]);

  useEffect(() => {
    if (typeof window !== 'undefined') (window as any).__PROOFS = proofs;
  }, [proofs]);

  if (loadingProject) return <div className="p-6">Loading project...</div>;
  if (!project) return <div className="p-6">Project not found{errorMsg ? ` — ${errorMsg}` : ''}</div>;

  const acceptedBid = safeBids.find((b) => b.status === 'approved') || null;
  const acceptedMilestones = parseMilestones(acceptedBid?.milestones);

  async function pollUntilPaid(
    bidId: number,
    milestoneIndex: number,
    tries = 100,
    intervalMs = 3000
  ) {
    for (let i = 0; i < tries; i++) {
      try {
        const bid = await getBid(bidId);
        const m = bid?.milestones?.[milestoneIndex];

        if (!m) {
          // keep polling
        } else if (msIsPaid(m)) {
          await refreshApproved(bidId);
          await refreshProofs();
          try {
            try { (await import('@/lib/api')).invalidateBidsCache?.(); } catch {}
            requestDebouncedRefresh(async () => {
              const next = await getBids(projectIdNum);
              setBids(Array.isArray(next) ? next : []);
            }, 500);
          } catch {}
          removeSafePending(msKey(bidId, milestoneIndex));
          try { payChanRef.current?.postMessage({ type: 'mx:pay:done', bidId, milestoneIndex }); } catch {}
          return;
        } else if (msHasSafeMarker(m)) {
          await refreshApproved(bidId);
          await refreshProofs();
          try {
            try { (await import('@/lib/api')).invalidateBidsCache?.(); } catch {}
            requestDebouncedRefresh(async () => {
              const next = await getBids(projectIdNum);
              setBids(Array.isArray(next) ? next : []);
            }, 500);
          } catch {}
        }
      } catch {
        // ignore
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  // Admin action: manual release
  async function handleReleasePayment(idx: number) {
    if (!acceptedBid) return;
    const bidIdNum = Number(acceptedBid.bidId);
    const key = `${bidIdNum}:${idx}`;
    if (!Number.isFinite(bidIdNum)) return;

    if (!confirm(`Release payment for milestone #${idx + 1}?`)) return;

    try {
      setReleasingKey(key);
      await payMilestone(bidIdNum, idx);

      try { payChanRef.current?.postMessage({ type: 'mx:pay:queued', bidId: bidIdNum, milestoneIndex: idx }); } catch {}
      startPollUntilPaid(bidIdNum, idx);

      await refreshProofs();
      requestDebouncedRefresh(async () => {
        const next = await getBids(projectIdNum);
        setBids(Array.isArray(next) ? next : []);
      }, 500);
      alert('Payment released.');
    } catch (e: any) {
      alert(e?.message || 'Failed to release payment.');
    } finally {
      setReleasingKey(null);
    }
  }

  const projectDocs = parseDocs(project?.docs) || [];

  const canEdit =
    me?.role === 'admin' ||
    (!!project?.ownerWallet &&
      !!me?.address &&
      String(project.ownerWallet).toLowerCase() === String(me.address).toLowerCase());

  const isCompleted = (() => {
    if (project.status === 'completed') return true;
    if (!acceptedBid) return false;
    if (acceptedMilestones.length === 0) return false;
    return acceptedMilestones.every((m) => m?.completed === true || !!m?.paymentTxHash);
  })();

  const msTotal = acceptedMilestones.length;
  const msCompleted = acceptedMilestones.filter((m) => m?.completed || m?.paymentTxHash).length;
  const msPaid = acceptedMilestones.filter((m) => msIsPaid(m)).length;

  const lastActivity = (() => {
    const dates: (string | undefined | null)[] = [project.updatedAt, project.createdAt];
    for (const b of safeBids) {
      dates.push(b.createdAt, b.updatedAt);
      const arr = parseMilestones(b.milestones);
      for (const m of arr) {
        dates.push(m.paymentDate, m.completionDate, m.dueDate);
      }
    }
    const valid = dates
      .filter(Boolean)
      .map((s) => new Date(String(s)))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    return valid[0] ? valid[0].toLocaleString() : '—';
  })();

  type EventItem = { at?: string | null; type: string; label: string; meta?: string };
  const timeline: EventItem[] = [];
  if (project.createdAt) timeline.push({ at: project.createdAt, type: 'proposal_created', label: 'Proposal created' });
  if (project.updatedAt && project.updatedAt !== project.createdAt) timeline.push({ at: project.updatedAt, type: 'proposal_updated', label: 'Proposal updated' });
  for (const b of safeBids) {
    if (b.createdAt) timeline.push({ at: b.createdAt, type: 'bid_submitted', label: `Bid submitted by ${b.vendorName}`, meta: `${currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}` });
    if (b.status === 'approved' && b.updatedAt) timeline.push({ at: b.updatedAt, type: 'bid_approved', label: `Bid approved (${b.vendorName})` });
    const arr = parseMilestones(b.milestones);
    arr.forEach((m, idx) => {
      if (m.completionDate) timeline.push({ at: m.completionDate, type: 'milestone_completed', label: `Milestone ${idx + 1} completed (${m.name || 'Untitled'})` });
      if (m.paymentDate || msIsPaid(m)) timeline.push({ at: m.paymentDate || (m as any).paidAt || (m as any).safeExecutedAt, type: 'milestone_paid', label: `Milestone ${idx + 1} paid`, meta: ((m as any).paymentTxHash || (m as any).safePaymentTxHash) ? `tx ${String((m as any).paymentTxHash || (m as any).safePaymentTxHash).slice(0, 10)}…` : undefined });
    });
  }
  timeline.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());

  const projectFiles = (projectDocs || []).map((d: any) => ({ scope: 'Project', doc: d }));
  // ↓ collect docs (plural or single) + files (array), merge & de-dupe
const bidFiles = safeBids.flatMap((b: any) => {
  // docs can be: array, single, or absent
  const docsArr = Array.isArray(b?.docs)
    ? b.docs
    : (b?.docs ? [b.docs] : (b?.doc ? [b.doc] : []));
  // files: always an array if present
  const filesArr = Array.isArray(b?.files) ? b.files : [];

  const merged = [...docsArr.filter(Boolean), ...filesArr.filter(Boolean)];

  // de-dupe by url+cid to avoid duplicates
  const seen = new Set<string>();
  const uniq = merged.filter((d: any) => {
    const url = String(d?.url || '').trim().toLowerCase();
    const cid = String(d?.cid || '').trim().toLowerCase();
    const key = `${url}|${cid}`;
    if (!url && !cid) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniq.map((d: any) => ({
    scope: `Bid #${b.bidId} — ${b.vendorName || 'Vendor'}`,
    doc: d,
  }));
});

  const proofFiles = filesFromProofRecords(proofs);
  const allFiles = [...projectFiles, ...bidFiles, ...proofFiles];

  if (typeof window !== 'undefined') {
    (window as any).__FILES = allFiles.map((x) => {
      const name = x.doc?.name || null;
      const normalized = normalizeIpfsUrl(x.doc?.url, x.doc?.cid);
      return {
        scope: x.scope,
        href: normalized ? withFilename(normalized, name || undefined) : null,
        name,
      };
    });
  }

  function renderAttachment(doc: any, key: number) {
    if (!doc) return null;
    const baseUrl = normalizeIpfsUrl(doc.url, doc.cid);
    if (!baseUrl) return null;
    const nameFromUrl = decodeURIComponent((baseUrl.split('/').pop() || '').trim());
    const name = (doc.name && String(doc.name)) || nameFromUrl || 'file';
    const href = withFilename(baseUrl, name);
    const looksImage = isImageName(name) || isImageName(href);

    if (looksImage) {
      return (
        <button
          key={key}
          onClick={() => setLightbox(href)}
          className="group relative overflow-hidden rounded border"
          title={name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={name}
            className="h-24 w-24 object-cover group-hover:scale-105 transition"
          />
        </button>
      );
    }

    return (
      <div key={key} className="p-2 rounded border bg-gray-50 text-xs text-gray-700">
        <p className="truncate" title={name}>{name}</p>
        <a
          href={href.startsWith('http') ? href : `https://${href}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Open
        </a>
      </div>
    );
  }

  function renderAnalysis(raw: any) {
    const a = coerceAnalysis(raw);
    const pending = !a || (a.status && a.status !== 'ready' && a.status !== 'error');
    if (pending) return <p className="mt-2 text-xs text-gray-400 italic">⏳ Analysis pending…</p>;
    if (!a) return <p className="mt-2 text-xs text-gray-400 italic">No analysis.</p>;
    const isV2 = a.summary || a.fit || a.risks || a.confidence || a.milestoneNotes;
    const isV1 = a.verdict || a.reasoning || a.suggestions;

    return (
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-sm mb-1">Agent 2 Analysis</h4>
        {isV2 && (
          <>
            {a.summary && <p className="text-sm mb-1">{a.summary}</p>}
            <div className="text-sm">
              {a.fit && (<><span className="font-medium">Fit:</span> {String(a.fit)} </>)}
              {typeof a.confidence === 'number' && (
                <>
                  <span className="mx-1">·</span>
                  <span className="font-medium">Confidence:</span> {Math.round(a.confidence * 100)}%
                </>
              )}
            </div>
            {!!a.risks?.length && (
              <div className="mt-2">
                <div className="font-medium text-sm">Risks</div>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {a.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {!!a.milestoneNotes?.length && (
              <div className="mt-2">
                <div className="font-medium text-sm">Milestone Notes</div>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {a.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
            {typeof a.pdfUsed === 'boolean' && (
              <div className="mt-3 text-[11px] text-gray-600 space-y-1">
                <div>PDF parsed: {a.pdfUsed ? 'Yes' : 'No'}</div>
                {a.pdfDebug?.url && (
                  <div>
                    File:{' '}
                    <a href={a.pdfDebug.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      {a.pdfDebug.name || 'open'}
                    </a>
                  </div>
                )}
                {a.pdfDebug?.bytes !== undefined && <div>Bytes: {a.pdfDebug.bytes}</div>}
                {a.pdfDebug?.first5 && <div>First bytes: {a.pdfDebug.first5}</div>}
                {a.pdfDebug?.reason && <div>Reason: {a.pdfDebug.reason}</div>}
                {a.pdfDebug?.error && <div className="text-rose-600">Error: {a.pdfDebug.error}</div>}
              </div>
            )}
          </>
        )}

        {isV1 && (
          <div className={isV2 ? 'mt-3 pt-3 border-t border-blue-100' : ''}>
            {a.verdict && (<p className="text-sm"><span className="font-medium">Verdict:</span> {a.verdict}</p>)}
            {a.reasoning && (<p className="text-sm"><span className="font-medium">Reasoning:</span> {a.reasoning}</p>)}
            {!!a.suggestions?.length && (
              <ul className="list-disc list-inside mt-1 text-sm text-gray-700">
                {a.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
        )}

        {!isV1 && !isV2 && <p className="text-xs text-gray-500 italic">Unknown analysis format.</p>}
      </div>
    );
  }

  // ----------------- Render -----------------
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{project.title}</h1>
            {canEdit && (
              <Link href={`/proposals/${projectIdNum}/edit`} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm">
                Edit
              </Link>
            )}
            <span className={classNames(
              'px-2 py-0.5 text-xs font-medium rounded-full',
              isCompleted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            )}>
              {isCompleted ? 'Completed' : 'Active'}
            </span>
          </div>
          <p className="text-gray-600">{project.orgName}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            <span>Budget: <b>{currency.format(Number(project.amountUSD || 0))}</b></span>
            <span>Last activity: <b>{lastActivity}</b></span>
            {acceptedBid && (<span>Awarded: <b>{currency.format(Number((acceptedBid.priceUSD ?? acceptedBid.priceUsd) || 0))}</b></span>)}
          </div>
        </div>

        {!isCompleted && (
          <Link
            href={`/bids/new?proposalId=${projectIdNum}`}
            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
          >
            Submit Bid
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-2">
          <TabBtn id="overview" label="Overview" tab={tab} setTab={setTab} />
          <TabBtn id="timeline" label="Timeline" tab={tab} setTab={setTab} />
          <TabBtn id="bids" label={`Bids (${safeBids.length})`} tab={tab} setTab={setTab} />
          <TabBtn id="milestones" label={`Milestones${acceptedMilestones.length ? ` (${msPaid}/${acceptedMilestones.length} paid)` : ''}`} tab={tab} setTab={setTab} />
          <TabBtn id="files" label={`Files (${allFiles.length})`} tab={tab} setTab={setTab} />
          {me.role === 'admin' && <TabBtn id="admin" label="Admin" tab={tab} setTab={setTab} />}
        </div>
      </div>

       {/* Overview */}
{tab === 'overview' && (
  <section className="space-y-6">
    {/* 1. Key Metrics Row */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* Budget Card */}
      <div className="p-4 bg-white border rounded-lg shadow-sm">
        <div className="flex items-center gap-2 text-gray-500 mb-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-xs font-medium uppercase tracking-wider">Budget</span>
        </div>
        <div className="text-xl font-bold text-gray-900">
          {currency.format(Number(project.amountUSD || 0))}
        </div>
        {acceptedBid && (
          <div className="text-xs text-emerald-600 font-medium mt-1">
            Awarded at {currency.format(Number((acceptedBid.priceUSD ?? acceptedBid.priceUsd) || 0))}
          </div>
        )}
      </div>

      {/* Bids Card */}
      <div className="p-4 bg-white border rounded-lg shadow-sm">
        <div className="flex items-center gap-2 text-gray-500 mb-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          <span className="text-xs font-medium uppercase tracking-wider">Total Bids</span>
        </div>
        <div className="text-xl font-bold text-gray-900">{safeBids.length}</div>
        <div className="text-xs text-gray-400 mt-1">
          {safeBids.filter(b => b.status === 'rejected').length} rejected
        </div>
      </div>

      {/* Status Card */}
      <div className="p-4 bg-white border rounded-lg shadow-sm">
        <div className="flex items-center gap-2 text-gray-500 mb-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-xs font-medium uppercase tracking-wider">Status</span>
        </div>
        <div className="text-xl font-bold text-gray-900 capitalize">
          {project.status || (isCompleted ? 'Completed' : 'Active')}
        </div>
        <div className="text-xs text-gray-400 mt-1">
          Last updated {fmt(project.updatedAt).split(',')[0]}
        </div>
      </div>

      {/* Completion Card */}
      <div className="p-4 bg-white border rounded-lg shadow-sm">
        <div className="flex items-center gap-2 text-gray-500 mb-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span className="text-xs font-medium uppercase tracking-wider">Progress</span>
        </div>
        <div className="text-xl font-bold text-gray-900">
          {acceptedMilestones.length 
            ? Math.round((msCompleted / acceptedMilestones.length) * 100) 
            : 0}%
        </div>
        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2 overflow-hidden">
           <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${acceptedMilestones.length ? (msCompleted / acceptedMilestones.length) * 100 : 0}%` }}></div>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 2. Main Content: Description & Context */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Project Brief */}
        <div className="bg-white border rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 border-b pb-2">Project Brief</h3>
          <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed">
            {project.summary 
              ? project.summary.split('\n').map((line: string, i: number) => <p key={i} className="mb-2">{line}</p>) 
              : <p className="italic text-gray-400">No description provided.</p>}
          </div>
          
          {/* Tags / Metadata footer if available */}
          <div className="mt-6 pt-4 border-t flex flex-wrap gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
               <span className="font-medium">Owner:</span> {project.ownerWallet ? `${String(project.ownerWallet).slice(0,6)}...${String(project.ownerWallet).slice(-4)}` : 'Unknown'}
            </div>
            <div className="flex items-center gap-1">
               <span className="font-medium">Created:</span> {fmt(project.createdAt).split(',')[0]}
            </div>
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white border rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Latest Activity</h3>
          {timeline.length ? (
            <div className="relative border-l-2 border-gray-200 ml-3 space-y-6">
              {timeline.slice(-5).reverse().map((e, i) => (
                <div key={i} className="relative pl-6">
                  <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 border-white bg-blue-600 shadow-sm"></div>
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{e.label}</p>
                      {e.meta && <p className="text-xs text-gray-500 mt-0.5">{e.meta}</p>}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap mt-1 sm:mt-0">
                      {fmt(e.at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No activity recorded yet.</p>
          )}
          {timeline.length > 5 && (
            <button 
              onClick={() => setTab('timeline')}
              className="mt-4 text-sm text-blue-600 hover:underline font-medium"
            >
              View full history →
            </button>
          )}
        </div>
      </div>

      {/* 3. Right Sidebar: Vendor & Bids */}
      <div className="space-y-6">
        
        {/* Active Vendor / Winning Bid */}
        {acceptedBid ? (
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-1.5 bg-emerald-200 rounded-full text-emerald-800">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <h3 className="font-semibold text-emerald-900">Awarded Vendor</h3>
            </div>
            <div className="text-lg font-bold text-gray-900">{acceptedBid.vendorName}</div>
            <div className="text-sm text-gray-600 mb-4">
              {currency.format(Number((acceptedBid.priceUSD ?? acceptedBid.priceUsd) || 0))} • {acceptedBid.days} days
            </div>
            <button 
              onClick={() => setTab('milestones')}
              className="w-full py-2 bg-white border border-emerald-200 text-emerald-700 rounded text-sm font-medium hover:bg-emerald-100 transition-colors"
            >
              View Payments & Milestones
            </button>
          </div>
        ) : (
          /* Call to Action if no vendor yet */
          <div className="bg-blue-50 border border-blue-100 rounded-lg shadow-sm p-5 text-center">
            <h3 className="font-semibold text-blue-900 mb-1">No Vendor Selected</h3>
            <p className="text-xs text-blue-700 mb-3">Review bids to start the project.</p>
            <button 
              onClick={() => setTab('bids')}
              className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 w-full"
            >
              Review {safeBids.length} Bids
            </button>
          </div>
        )}

        {/* Bids Snapshot List */}
        <div className="bg-white border rounded-lg shadow-sm p-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-900">Bids Snapshot</h3>
            <span className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">{safeBids.length}</span>
          </div>
          
          {safeBids.length ? (
            <div className="space-y-3">
              {safeBids.slice(0, 5).map((b) => (
                <div key={b.bidId} className="flex items-center justify-between p-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{b.vendorName}</div>
                    <div className="text-xs text-gray-500">{fmt(b.createdAt).split(',')[0]}</div>
                  </div>
                  <div className="text-right pl-2">
                    <div className="font-medium text-sm">{currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}</div>
                     <span className={classNames(
                        'text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wide',
                        b.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        b.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                     )}>
                       {b.status}
                     </span>
                  </div>
                </div>
              ))}
              {safeBids.length > 5 && (
                <button 
                  onClick={() => setTab('bids')}
                  className="block w-full text-center text-xs text-gray-500 hover:text-gray-800 pt-2"
                >
                  + {safeBids.length - 5} more
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400 text-sm">
              No bids submitted yet.
            </div>
          )}
        </div>
      </div>
    </div>
  </section>
)}
   {tab === 'timeline' && (
  <section className="max-w-3xl mx-auto">
    <div className="mb-6 flex items-center justify-between">
      <h3 className="font-semibold text-lg text-gray-900">Project History</h3>
      <span className="text-xs font-medium bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full">
        {timeline.length} Events
      </span>
    </div>

    <div className="relative border-l-2 border-gray-200 ml-4 space-y-8 pb-8">
      {timeline.length ? (
        timeline.slice().reverse().map((e, i) => {
          // Helper to determine styling based on event type
          let iconBg = 'bg-gray-100';
          let iconColor = 'text-gray-500';
          let iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />; // Info default

          if (e.type.includes('paid')) {
            iconBg = 'bg-emerald-100';
            iconColor = 'text-emerald-600';
            iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />;
          } else if (e.type.includes('completed') || e.type.includes('approved')) {
            iconBg = 'bg-blue-100';
            iconColor = 'text-blue-600';
            iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />;
          } else if (e.type.includes('bid')) {
            iconBg = 'bg-purple-100';
            iconColor = 'text-purple-600';
            iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />;
          } else if (e.type.includes('created') || e.type.includes('updated')) {
             iconBg = 'bg-gray-100';
             iconColor = 'text-gray-600';
             iconPath = <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />;
          }

          return (
            <div key={i} className="relative pl-8">
              {/* Icon Dot */}
              <div className={`absolute -left-[9px] top-0 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${iconBg} ${iconColor}`}>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {iconPath}
                </svg>
              </div>

              {/* Card Content */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start bg-white border border-gray-100 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{e.label}</p>
                  {e.meta && (
                    <p className="mt-1 text-sm text-gray-600 bg-gray-50 inline-block px-2 py-0.5 rounded border border-gray-100">
                      {e.meta}
                    </p>
                  )}
                </div>
                <div className="mt-2 sm:mt-0 sm:text-right">
                  <time className="text-xs text-gray-400 font-medium whitespace-nowrap" dateTime={e.at || ''}>
                    {fmt(e.at)}
                  </time>
                  <div className="text-[10px] text-gray-300 uppercase tracking-wider mt-0.5">
                    {e.type.replace('_', ' ')}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="pl-8 py-4 text-gray-500 text-sm italic">No activity recorded yet.</div>
      )}
    </div>
  </section>
)}

 {tab === 'bids' && (
  <section className="space-y-6">
    {/* 1. Market Stats Header */}
    {safeBids.length > 0 && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white border rounded-lg shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Bids</div>
          <div className="text-2xl font-bold text-gray-900">{safeBids.length}</div>
        </div>
        <div className="p-4 bg-white border rounded-lg shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Lowest Price</div>
          <div className="text-2xl font-bold text-gray-900">
            {currency.format(Math.min(...safeBids.map(b => Number((b.priceUSD ?? b.priceUsd) || 0) || Infinity)) === Infinity ? 0 : Math.min(...safeBids.map(b => Number((b.priceUSD ?? b.priceUsd) || 0) || Infinity)))}
          </div>
        </div>
        <div className="p-4 bg-white border rounded-lg shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Average Price</div>
          <div className="text-2xl font-bold text-gray-900">
            {(() => {
              const valid = safeBids.map(b => Number((b.priceUSD ?? b.priceUsd) || 0)).filter(n => n > 0);
              if (!valid.length) return currency.format(0);
              return currency.format(valid.reduce((a, b) => a + b, 0) / valid.length);
            })()}
          </div>
        </div>
        <div className="p-4 bg-white border rounded-lg shadow-sm">
           <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Fastest Delivery</div>
           <div className="text-2xl font-bold text-gray-900">
             {Math.min(...safeBids.map(b => Number(b.days || 0) || Infinity)) === Infinity ? 0 : Math.min(...safeBids.map(b => Number(b.days || 0) || Infinity))} <span className="text-sm font-normal text-gray-500">days</span>
           </div>
        </div>
      </div>
    )}

    {/* 2. Rich Bids Table */}
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50 flex justify-between items-center">
        <h3 className="font-semibold text-gray-900">Received Proposals</h3>
        {acceptedBid && (
           <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-medium rounded-full flex items-center gap-1">
             <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
             Bid Awarded
           </span>
        )}
      </div>

      {safeBids.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium">Vendor</th>
                <th className="px-6 py-3 font-medium">Bid Amount</th>
                <th className="px-6 py-3 font-medium">Duration</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Submitted</th>
                <th className="px-6 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {safeBids.map((b) => {
                const isApproved = b.status === 'approved';
                const isRejected = b.status === 'rejected';
                
                return (
                  <tr 
                    key={b.bidId} 
                    className={classNames(
                      'transition-colors hover:bg-gray-50',
                      isApproved ? 'bg-emerald-50/60 hover:bg-emerald-50' : ''
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {/* Vendor Avatar/Initial */}
                        <div className={classNames(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border",
                          isApproved ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-600 border-gray-200"
                        )}>
                          {b.vendorName ? b.vendorName.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{b.vendorName || 'Unknown Vendor'}</div>
                          {isApproved && <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide">Winning Bid</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-gray-900">{currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-700">{b.days} days</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={classNames(
                        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                        isApproved ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                        isRejected ? 'bg-red-100 text-red-800 border-red-200' :
                        'bg-amber-100 text-amber-800 border-amber-200'
                      )}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {fmt(b.createdAt)}
                    </td>
<td className="px-6 py-4 text-right">
  {(() => {
    // 1. Extract the first available document object from the bid
    const docsArr = Array.isArray(b?.docs) ? b.docs : (b?.docs ? [b.docs] : (b?.doc ? [b.doc] : []));
    const filesArr = Array.isArray(b?.files) ? b.files : [];
    const mainDoc = docsArr[0] || filesArr[0];

    // 2. Resolve the IPFS/Gateway URL
    // (using the helper functions already defined in your file)
    const rawUrl = mainDoc?.url || mainDoc?.cid;
    const resolvedUrl = rawUrl ? normalizeIpfsUrl(rawUrl, mainDoc?.cid) : null;

    if (!resolvedUrl) {
      return <span className="text-gray-400 text-xs italic">No doc</span>;
    }

    // 3. Add filename param for cleaner downloading
    const finalHref = withFilename(resolvedUrl, mainDoc?.name || 'proposal-doc');

    return (
      <a 
        href={finalHref}
        target="_blank" 
        rel="noopener noreferrer"
        className="text-blue-600 hover:text-blue-800 hover:underline font-medium text-xs"
      >
        View Document
      </a>
    );
  })()}
</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-12 text-center">
           <div className="mx-auto h-12 w-12 text-gray-300 mb-3">
             <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
           </div>
           <h3 className="text-gray-900 font-medium">No bids received yet</h3>
           <p className="text-gray-500 text-sm mt-1">Share your project to attract vendors.</p>
        </div>
      )}
    </div>
  </section>
)}

 {tab === 'milestones' && (
  <section className="space-y-6">
    {/* 1. High Level Summary Cards (Always Visible) */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="p-4 rounded-lg border bg-white shadow-sm">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Budget</div>
        <div className="text-2xl font-bold text-gray-900">
          {acceptedBid 
            ? currency.format(Number((acceptedBid.priceUSD ?? acceptedBid.priceUsd) || 0)) 
            : '—'}
        </div>
      </div>
      <div className="p-4 rounded-lg border bg-white shadow-sm">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Amount Paid</div>
        <div className="text-2xl font-bold text-emerald-600">
          {currency.format(
            acceptedMilestones
              .filter((m) => msIsPaid(m))
              .reduce((acc, m) => acc + Number(m.amount || 0), 0)
          )}
        </div>
      </div>
      <div className="p-4 rounded-lg border bg-white shadow-sm">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</div>
        <div className="flex items-center gap-3 mt-1">
          <div className="text-2xl font-bold text-gray-900">
            {acceptedMilestones.length > 0 
              ? Math.round((msCompleted / acceptedMilestones.length) * 100) 
              : 0}%
          </div>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 rounded-full" 
              style={{ width: `${acceptedMilestones.length ? (msCompleted / acceptedMilestones.length) * 100 : 0}%` }} 
            />
          </div>
        </div>
      </div>
    </div>

    {acceptedMilestones.length ? (
      <>
        {/* 2. Collapsible Detailed List (Table Only - Closed by default) */}
        <details className="group border rounded-lg bg-white overflow-hidden shadow-sm">
          <summary className="px-6 py-4 bg-gray-50 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors select-none list-none">
            <div className="flex items-center gap-3">
              <div className="p-1 rounded bg-gray-200 group-open:bg-blue-100 text-gray-500 group-open:text-blue-600 transition-colors">
                <svg className="w-5 h-5 transform transition-transform duration-200 group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <h3 className="font-semibold text-gray-900">
                Milestone Details {acceptedBid ? `— ${acceptedBid.vendorName}` : ''}
              </h3>
            </div>
            <span className="text-xs bg-gray-200 px-2 py-1 rounded-full text-gray-600">
              {acceptedMilestones.length} Milestones
            </span>
          </summary>

          <div className="border-t border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-medium">#</th>
                    <th className="px-6 py-3 font-medium">Description</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Dates</th>
                    <th className="px-6 py-3 font-medium">Transaction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {acceptedMilestones.map((m, idx) => {
                    const src = (Array.isArray(approvedFull?.milestones) ? approvedFull.milestones[idx] : null) || m;
                    const key = `${Number(acceptedBid?.bidId || 0)}-${idx}`;
                    const paid = msIsPaid(src);
                    const localPending = safePending.has(key);
                    const safeInFlight = msHasSafeMarker(src) || !!(src as any)?.paymentPending || localPending;
                    const completedRow = paid || !!(src as any)?.completed;
                    const hasProofNow = !!(src as any)?.proof || !!proofJustSent[key];

                    let statusLabel = 'Pending';
                    let statusClass = 'bg-gray-100 text-gray-600 border-gray-200';
                    if (paid) { statusLabel = 'Paid'; statusClass = 'bg-green-100 text-green-700 border-green-200'; }
                    else if (safeInFlight) { statusLabel = 'Processing'; statusClass = 'bg-amber-100 text-amber-700 border-amber-200'; }
                    else if (completedRow) { statusLabel = 'Completed'; statusClass = 'bg-blue-100 text-blue-700 border-blue-200'; }
                    else if (hasProofNow) { statusLabel = 'Submitted'; statusClass = 'bg-indigo-50 text-indigo-600 border-indigo-100'; }

                    return (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-500">{idx + 1}</td>
                        <td className="px-6 py-4"><div className="font-medium text-gray-900">{m.name || 'Untitled'}</div></td>
                        <td className="px-6 py-4"><span className="font-bold text-gray-900">{m.amount ? currency.format(Number(m.amount)) : '—'}</span></td>
                        <td className="px-6 py-4"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusClass}`}>{statusLabel}</span></td>
                        <td className="px-6 py-4 text-gray-500 text-xs space-y-1">
                          {completedRow && <div title="Completion Date"><span className="font-medium">Done:</span> {fmt(m.completionDate).split(',')[0]}</div>}
                          {paid && <div title="Payment Date"><span className="font-medium">Paid:</span> {fmt((m as any).paymentDate || (src as any).paidAt || (src as any).safeExecutedAt).split(',')[0]}</div>}
                          {!completedRow && !paid && '—'}
                        </td>
                        <td className="px-6 py-4">
                          {((src as any).paymentTxHash || (src as any).safePaymentTxHash) ? (
                            <a href={`https://etherscan.io/tx/${(src as any).paymentTxHash || (src as any).safePaymentTxHash}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-xs"><span>View Tx</span></a>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        {/* 3. Payment Cards List (Restored, but we will hide the manual processor inside it via the other file) */}
        {(acceptedBid || safeBids[0]) && (
          <div className="border rounded-lg bg-white shadow-sm p-6">
             <h4 className="text-sm font-semibold text-gray-900 mb-3">Milestone Payments</h4>
            <MilestonePayments
              bid={acceptedBid || safeBids[0]}
              onUpdate={refreshProofs}
              proposalId={projectIdNum}
            />
          </div>
        )}

        {/* 4. Change Requests */}
        <div className="border rounded-lg bg-white shadow-sm p-6">
          <h3 className="font-semibold mb-2 text-gray-900">Change Requests</h3>
          <p className="text-sm text-gray-500 mb-4">Manage negotiations between admin and vendor.</p>
          <ChangeRequestsPanel proposalId={projectIdNum} />
        </div>
      </>
    ) : (
      <div className="border rounded-lg bg-white shadow-sm p-12 text-center">
          <div className="mx-auto h-12 w-12 text-gray-400">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No milestones defined</h3>
      </div>
    )}
  </section>
)}

{/* Files */}
{tab === 'files' && (
  <section className="space-y-8">
    {(() => {
      // 1. Organize Files
      const projFiles = allFiles.filter(f => f.scope === 'Project');
      const proofFiles = allFiles.filter(f => f.scope.toLowerCase().includes('proof') || f.scope.toLowerCase().includes('milestone'));
      const bidFiles = allFiles.filter(f => !projFiles.includes(f) && !proofFiles.includes(f));

      // 2. Define Sections
      const sections = [
        {
          id: 'project',
          title: 'Project Brief & Specs',
          files: projFiles,
          color: 'bg-blue-100 text-blue-600',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        },
        {
          id: 'proofs',
          title: 'Milestone Proofs',
          files: proofFiles,
          color: 'bg-emerald-100 text-emerald-600',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        },
        {
          id: 'bids',
          title: 'Bid Attachments',
          files: bidFiles,
          color: 'bg-purple-100 text-purple-600',
          icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        }
      ];

      const hasFiles = sections.some(s => s.files.length > 0);

      if (!hasFiles) {
        return (
          <div className="p-12 text-center border rounded-lg bg-white border-dashed">
            <div className="mx-auto h-12 w-12 text-gray-300 mb-2">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <h3 className="text-gray-900 font-medium">No files uploaded</h3>
            <p className="text-gray-500 text-sm">Documents attached to bids or milestones will appear here.</p>
          </div>
        );
      }

      return (
        <>
          {sections.map((section, sectionIdx) => (
            section.files.length > 0 && (
              <div key={section.id} className={sectionIdx > 0 ? 'pt-8 border-t' : ''}>
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className={`flex items-center justify-center w-6 h-6 rounded text-xs ${section.color}`}>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {section.icon}
                    </svg>
                  </span>
                  {section.title}
                </h3>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {section.files.map((file: any, i: number) => {
                    const doc = file.doc;
                    const baseUrl = normalizeIpfsUrl(doc.url, doc.cid);
                    const name = doc.name || (baseUrl ? decodeURIComponent(baseUrl.split('/').pop() || '') : 'file');
                    const href = baseUrl ? withFilename(baseUrl, name) : '#';
                    const isImg = isImageName(name) || isImageName(href);

                    return (
                      <div 
                        key={`${section.id}-${i}`} 
                        className="group relative flex flex-col bg-white border rounded-lg shadow-sm hover:shadow-md transition-all overflow-hidden"
                      >
                        {/* Preview Area - Modified to be taller and borderless if it is an image */}
                        <div 
                          className={`${isImg ? 'h-48' : 'h-32 border-b border-gray-50'} bg-gray-100 flex items-center justify-center overflow-hidden relative ${isImg ? 'cursor-pointer' : ''}`}
                          onClick={() => isImg && setLightbox(href)}
                        >
                          {isImg && baseUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img 
                              src={href} 
                              alt={name} 
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="text-gray-400 group-hover:text-gray-600 transition-colors">
                              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                          )}
                          
                          {/* Overlay Actions */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-start justify-end p-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                            <a 
                              href={href} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="pointer-events-auto p-1.5 bg-white text-gray-700 rounded shadow-sm hover:text-blue-600 hover:shadow transition-all"
                              title="Open in new tab"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </a>
                          </div>
                        </div>

{/* Metadata Area - ONLY MILESTONE (Name hidden) */}
                        <div className="p-3 flex items-center justify-center bg-white border-t border-gray-50">
                          <div className="text-xs text-blue-600 font-semibold uppercase tracking-wide truncate" title={file.scope}>
                            {file.scope}
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ))}
        </>
      );
    })()}
  </section>
)}

      {/* Admin */}
   {tab === 'admin' && me.role === 'admin' && (
  <section className="space-y-8">
    {/* 1. Proofs & Moderation (Existing) */}
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Proofs & Moderation</h3>
      </div>
      <div className="p-6">
        <AdminProofs
          bidIds={safeBids.map(b => Number(b.bidId)).filter(Number.isFinite)}
          proposalId={projectIdNum}
          bids={safeBids}
          onRefresh={refreshProofs}
        />
      </div>
    </div>

    {/* 2. Change Requests (Existing) */}
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b bg-gray-50">
        <h3 className="font-semibold text-gray-900">Change Management</h3>
      </div>
      <div className="p-6">
        <ChangeRequestsPanel proposalId={projectIdNum} />
      </div>
    </div>

    {/* 3. TREASURY DASHBOARD (The Upgrade) */}
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
        <span className="p-1 bg-emerald-100 text-emerald-600 rounded">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </span>
        Treasury & Payments
      </h3>

      {acceptedBid ? (
        <>
          {/* Financial Snapshot Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
             {/* Total Liability */}
             <div className="bg-white border rounded-lg p-4 shadow-sm flex flex-col justify-between">
               <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Commitment</div>
               <div className="text-2xl font-bold text-gray-900 mt-1">
                 {currency.format(Number((acceptedBid.priceUSD ?? acceptedBid.priceUsd) || 0))}
               </div>
             </div>
             
             {/* Disbursed */}
             <div className="bg-white border rounded-lg p-4 shadow-sm flex flex-col justify-between">
               <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Funds Disbursed</div>
               <div className="text-2xl font-bold text-emerald-600 mt-1">
                 {currency.format(
                    acceptedMilestones
                      .filter(msIsPaid)
                      .reduce((acc, m) => acc + Number(m.amount || 0), 0)
                 )}
               </div>
             </div>

             {/* Remaining */}
             <div className="bg-white border rounded-lg p-4 shadow-sm flex flex-col justify-between">
               <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">Pending Release</div>
               <div className="text-2xl font-bold text-amber-600 mt-1">
                 {currency.format(
                    acceptedMilestones
                      .filter(m => !msIsPaid(m))
                      .reduce((acc, m) => acc + Number(m.amount || 0), 0)
                 )}
               </div>
             </div>
          </div>

          {/* The Ledger Table */}
          <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-medium">#</th>
                    <th className="px-6 py-3 font-medium">Milestone</th>
                    <th className="px-6 py-3 font-medium">Amount</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Transaction</th>
                    <th className="px-6 py-3 font-medium text-right">Controls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {acceptedMilestones.map((m, idx) => {
                    const src = (Array.isArray(approvedFull?.milestones) ? approvedFull.milestones[idx] : null) || m;
                    const key = msKey(Number(acceptedBid.bidId), idx);
                    
                    const paid = msIsPaid(src);
                    const pendingLocal = safePending.has(key);
                    const safeInFlight = msHasSafeMarker(src) || !!(src as any)?.paymentPending || pendingLocal;
                    const completedRow = paid || !!(src as any)?.completed;
                    const hasProofNow = !!(src as any)?.proof || !!proofJustSent[key];
                    
                    // Is this row actionable? (Completed, Not Paid, Not Processing)
                    const canRelease = !paid && completedRow && !safeInFlight;

                    return (
                      <tr 
                        key={idx} 
                        className={classNames(
                          'transition-colors',
                          canRelease ? 'bg-amber-50/50' : 'hover:bg-gray-50'
                        )}
                      >
                        <td className="px-6 py-4 text-gray-500">{idx + 1}</td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900">{m.name || 'Untitled'}</div>
                          {canRelease && <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wide mt-0.5">Action Required</div>}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          {m.amount ? currency.format(Number(m.amount)) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          {paid ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Paid
                            </span>
                          ) : safeInFlight ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 animate-pulse">
                              Processing
                            </span>
                          ) : completedRow ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              Awaiting Release
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              Locked
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {((src as any).paymentTxHash || (src as any).safePaymentTxHash) ? (
                             <a href={`https://etherscan.io/tx/${(src as any).paymentTxHash || (src as any).safePaymentTxHash}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                               {`${String((src as any).paymentTxHash || (src as any).safePaymentTxHash).slice(0, 6)}...${String((src as any).paymentTxHash || (src as any).safePaymentTxHash).slice(-4)}`}
                             </a>
                          ) : '—'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {canRelease ? (
                            <div className="flex justify-end items-center gap-2">
                              {/* Manual Release Button */}
                              <button
                                type="button"
                                onClick={() => handleReleasePayment(idx)}
                                disabled={releasingKey === key}
                                className="text-gray-600 hover:text-gray-900 border border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 text-xs font-medium rounded shadow-sm transition-all disabled:opacity-50"
                              >
                                {releasingKey === key ? '...' : 'Release Payment'}
                              </button>

                              {/* Safe / Crypto Button */}
                              <SafePayButton
                                bidId={Number(acceptedBid.bidId)}
                                milestoneIndex={idx}
                                amountUSD={Number(m?.amount || 0)}
                                disabled={!canRelease || releasingKey === key}
                                onQueued={async () => {
                                  const k = msKey(Number(acceptedBid.bidId), idx);
                                  addSafePending(k);
                                  setReleasingKey(k);
                                  try { payChanRef.current?.postMessage({ type: 'mx:pay:queued', bidId: Number(acceptedBid.bidId), milestoneIndex: idx }); } catch {}
                                  startPollUntilPaid(Number(acceptedBid.bidId), idx);
                                  try { (await import('@/lib/api')).invalidateBidsCache?.(); } catch {}
                                  await refreshApproved(acceptedBid.bidId);
                                  await refreshProofs();
                                  requestDebouncedRefresh(async () => {
                                    const next = await getBids(projectIdNum);
                                    setBids(Array.isArray(next) ? next : []);
                                  }, 500);
                                }}
                              />
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-gray-50 border rounded-lg p-8 text-center">
          <div className="text-gray-400 mb-2">No accepted bid active</div>
          <p className="text-sm text-gray-500">Accept a vendor bid to unlock treasury controls.</p>
        </div>
      )}
    </div>
  </section>
)}

      <div className="pt-2">
        <Link href="/projects" className="text-blue-600 hover:underline">← Back to Projects</Link>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="attachment preview"
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
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

// ---------------- UI bits ----------------
function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 bg-gray-200 rounded">
      <div className="h-2 bg-black rounded transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
function TabBtn({ id, label, tab, setTab }: { id: TabKey; label: string; tab: TabKey; setTab: (t: TabKey) => void }) {
  const active = tab === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={classNames(
        'px-3 py-2 text-sm -mb-px border-b-2',
        active ? 'border-black text-black' : 'border-transparent text-slate-600 hover:text-black'
      )}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}