// src/app/projects/[id]/page.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids, getAuthRoleOnce, getProofs, payMilestone } from '@/lib/api';
import AdminProofs from '@/components/AdminProofs';
import MilestonePayments from '@/components/MilestonePayments';
import ChangeRequestsPanel from '@/components/ChangeRequestsPanel';
import useMilestonesUpdated from '@/hooks/useMilestonesUpdated';
import SafePayButton from '@/components/SafePayButton';

// 🔗 Payment sync
import {
  openPaymentsChannel,
  onPaymentsMessage,
  postQueued,
  postDone,
  mkKey2,
  addPendingLS,
  removePendingLS,
  listPendingLS,
  isPaidLite,
  hasSafeMarkerLite,
} from '@/lib/paymentsSync';

// ---------------- Consts ----------------
const PINATA_GATEWAY = (() => {
  const raw1 = (process.env.NEXT_PUBLIC_PINATA_GATEWAY || '').trim();
  if (raw1) {
    const host = raw1.replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/(?:\/ipfs)+$/i, '');
    return `https://${host}/ipfs`;
  }
  const raw2 = (process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud').trim();
  const base = raw2.replace(/\/+$/, '').replace(/(?:\/ipfs)+$/i, '');
  return `${base}/ipfs`;
})();

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
  if (!dt) return '—';
  const d = new Date(dt);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
function coerceAnalysis(a: any): (AnalysisV2 & AnalysisV1) | null {
  if (a == null) return null;
  if (typeof a === 'string') {
    try { return JSON.parse(a) as any; } catch { return null; }
  }
  if (typeof a === 'object') return a as any;
  return null;
}
// ✅ Centralized, null-safe status getter
function analysisStatus(row: any): string {
  const a = coerceAnalysis(row?.aiAnalysis ?? row?.ai_analysis);
  return String(a?.status ?? '').toLowerCase();
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
  const isBad = (u?: string) => !u || u.includes('<gw>') || u.includes('<CID') || u.includes('>') || /^\s*$/.test(u);
  const fixProtocol = (u: string) => /^https?:\/\//i.test(u) ? u : `https://${u.replace(/^https?:\/\//, '')}`;
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
      if (typeof raw === 'string') url = raw;
      else if (raw && typeof raw === 'object') url = (raw as any).url || ((raw as any).cid ? `${PINATA_GATEWAY}/${(raw as any).cid}` : undefined);
      if (!url || isBad(url)) continue;
      url = fixProtocol(url);
      const nameFromUrl = decodeURIComponent((url.split('/').pop() || '').trim());
      const explicitName = typeof raw === 'object' && raw && (raw as any).name ? String((raw as any).name) : undefined;
      const name = explicitName && explicitName.toLowerCase() !== 'file' ? explicitName : nameFromUrl || 'file';
      rows.push({ scope, doc: { url, name } });
    }
  }
  return rows;
}
function withFilename(url: string, name?: string) {
  if (!url || !name) return url;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url.replace(/^https?:\/\//, '')}`);
    if (/\/ipfs\/[^/?#]+$/.test(u.pathname) && !u.search) u.search = `?filename=${encodeURIComponent(name)}`;
    return u.toString();
  } catch { return url; }
}
function isImageName(n?: string) { return !!n && /\.(png|jpe?g|gif|webp|svg)$/i.test(n); }
const msKey = (bidId: number, idx: number) => `${bidId}:${idx}`;

// Remove any pending chips for milestones already paid/SAFE
function sweepPendingAgainst(rows: any[], setPending: (fn: (s: Set<string>) => Set<string>) => void) {
  const paidKeys = new Set<string>();
  for (const b of Array.isArray(rows) ? rows : []) {
    const bidId = Number(b?.bidId);
    if (!Number.isFinite(bidId)) continue;
    const ms = parseMilestones(b?.milestones);
    ms.forEach((m, i) => {
      if (isPaidLite(m) || hasSafeMarkerLite(m)) paidKeys.add(mkKey2(bidId, i));
    });
  }
  setPending(prev => {
    const next = new Set(prev);
    paidKeys.forEach(k => next.delete(k));
    return next;
  });
}

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

  const [pendingPay, setPendingPay] = useState<Set<string>>(new Set());
  const payBcRef = useRef<BroadcastChannel | null>(null);

  const safeBids = Array.isArray(bids) ? bids.filter((b): b is any => !!b && typeof b === 'object') : [];

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };

  // Initial fetch: project + bids
  useEffect(() => {
    let alive = true;
    (async () => {
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
    })();
    return () => { alive = false; };
  }, [projectIdNum]);

  useEffect(() => { getAuthRoleOnce().then(setMe).catch(() => {}); }, []);

  // hydrate pending from LS
  useEffect(() => { try { setPendingPay(new Set(listPendingLS())); } catch {} }, []);

  // open channel + listen
  useEffect(() => {
    if (!payBcRef.current) payBcRef.current = openPaymentsChannel();
    const ch = payBcRef.current;
    if (!ch) return;

    const off = onPaymentsMessage(ch, async (msg) => {
      const k = mkKey2(msg.bidId, msg.milestoneIndex);
      if (msg.type === 'mx:pay:queued') { setPendingPay(prev => new Set(prev).add(k)); addPendingLS(k); }
      if (msg.type === 'mx:pay:done')  { setPendingPay(prev => { const n = new Set(prev); n.delete(k); return n; }); removePendingLS(k); }
      try {
        const next = await getBids(projectIdNum);
        setBids(Array.isArray(next) ? next : []);
        sweepPendingAgainst(Array.isArray(next) ? next : [], setPendingPay);
      } catch {}
    });

    return () => { try { off?.(); } catch {}; try { ch?.close(); } catch {}; payBcRef.current = null; };
  }, [projectIdNum]);

  // proofs (merge local + admin)
  const refreshProofs = async () => {
    if (!Number.isFinite(projectIdNum)) return;
    setLoadingProofs(true);
    try {
      const localUrl = `${PROOFS_ENDPOINT}?proposalId=${encodeURIComponent(projectIdNum)}&_t=${Date.now()}`;
      const localReq = fetch(localUrl, { credentials: 'include', cache: 'no-store' })
        .then(r => (r.ok ? r.json() : []))
        .catch(() => []);
      const accepted = safeBids.find(b => String(b?.status || '').toLowerCase() === 'approved') || safeBids[0] || null;
      const adminReq = accepted
        ? getProofs(Number(accepted.bidId)).then((rows: any[]) =>
            (Array.isArray(rows) ? rows : []).map((p: any) => ({
              proposalId: projectIdNum,
              milestoneIndex: Number(p?.milestoneIndex ?? p?.milestone_index),
              note: p?.description || p?.title || '',
              files: Array.isArray(p?.files) ? p.files.map((f: any) => ({
                url: f?.url || '',
                name: f?.name || (f?.url ? decodeURIComponent(String(f.url).split('/').pop() || 'file') : 'file'),
              })) : [],
            }))
          ).catch(() => [])
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
          merged.push({ proposalId: projectIdNum, milestoneIndex: Number(r.milestoneIndex), note: r.note || '', files: [{ url: String(f.url), name: String(f.name || 'file') }] });
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
    } catch {
      setProofs([]);
    } finally {
      setLoadingProofs(false);
    }
  };

  useEffect(() => { if (Number.isFinite(projectIdNum)) { refreshProofs().catch(() => {}); } }, [projectIdNum]);

  useMilestonesUpdated(async () => {
    await refreshProofs();
    try { const next = await getBids(projectIdNum); setBids(Array.isArray(next) ? next : []); } catch {}
  });

  useEffect(() => { if (tab === 'files') { refreshProofs(); } }, [tab]); // eslint-disable-line

  useEffect(() => {
    const onJustSent = (ev: any) => {
      const bidId = Number(ev?.detail?.bidId);
      const idx   = Number(ev?.detail?.milestoneIndex);
      if (!Number.isFinite(bidId) || !Number.isFinite(idx)) return;
      setProofJustSent(prev => ({ ...prev, [msKey(bidId, idx)]: true }));
      setBids(prev => prev.map(b => Number(b?.bidId) !== bidId ? b : {
        ...b,
        milestones: parseMilestones(b.milestones).map((m: any, i: number) =>
          i === idx ? { ...m, proof: m.proof || '{}' } : m
        ),
      }));
    };
    window.addEventListener('proofs:just-sent', onJustSent);
    return () => window.removeEventListener('proofs:just-sent', onJustSent);
  }, []);

  // Poll bids while AI analysis runs
  useEffect(() => {
    if (!Number.isFinite(projectIdNum)) return;
    const start = Date.now();

    const needsMore = (rows: any[]) =>
      rows.some((row) => {
        const st = analysisStatus(row);
        return st !== '' && st !== 'ready' && st !== 'error';
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
        if (Date.now() - start < 90_000) pollTimer.current = setTimeout(tick, 2000);
        else clearPoll();
      }
    };

    if (needsMore(safeBids)) { clearPoll(); pollTimer.current = setTimeout(tick, 1500); }

    const onFocus = () => { if (needsMore(safeBids)) { clearPoll(); pollTimer.current = setTimeout(tick, 0); } };
    window.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    return () => {
      clearPoll();
      window.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [projectIdNum, safeBids]);

  // -------- Derived -----------
  const acceptedBid = safeBids.find((b) => String(b?.status || '').toLowerCase() === 'approved') || null;
  const acceptedMilestones = parseMilestones(acceptedBid?.milestones);

  // Files (compute ONCE, reuse everywhere)
  const projectDocs = parseDocs(project?.docs) || [];
  const projectFiles = projectDocs.map((d: any) => ({ scope: 'Project', doc: d }));
  const bidFiles = safeBids.flatMap((b) => {
    const ds = (b.docs || (b.doc ? [b.doc] : [])).filter(Boolean);
    return ds.map((d: any) => ({ scope: `Bid #${b.bidId} — ${b.vendorName || 'Vendor'}`, doc: d }));
  });
  const proofFiles = filesFromProofRecords(proofs);
  const allFiles = [...projectFiles, ...bidFiles, ...proofFiles];

  // ===== Manual (EOA) payment — OPTIMISTIC "Paid" =====
  async function handleReleasePayment(idx: number) {
    if (!acceptedBid) return;
    const bidIdNum = Number(acceptedBid.bidId);
    if (!Number.isFinite(bidIdNum)) return;
    if (!confirm(`Release payment for milestone #${idx + 1}?`)) return;

    const key = mkKey2(bidIdNum, idx);

    try {
      setReleasingKey(`${bidIdNum}:${idx}`);

      // queue + local pending
      postQueued(bidIdNum, idx);
      setPendingPay(prev => new Set(prev).add(key));
      addPendingLS(key);

      // call API
      await payMilestone(bidIdNum, idx);

      // ✅ OPTIMISTIC: mark as paid immediately
      setBids(prev => prev.map(b =>
        Number(b?.bidId) !== bidIdNum ? b : {
          ...b,
          milestones: parseMilestones(b.milestones).map((m: any, i: number) =>
            i === idx
              ? {
                  ...m,
                  completed: true,
                  paymentTxHash: m.paymentTxHash || 'local-paid',
                  paymentDate: m.paymentDate || new Date().toISOString(),
                }
              : m
          ),
        }
      ));

      // clear "pending" chip now and broadcast done
      setPendingPay(prev => { const n = new Set(prev); n.delete(key); return n; });
      removePendingLS(key);
      postDone(bidIdNum, idx);

      alert('Payment released.');
    } catch (e: any) {
      setPendingPay(prev => { const n = new Set(prev); n.delete(key); return n; });
      removePendingLS(key);
      alert(e?.message || 'Failed to release payment.');
    } finally {
      setReleasingKey(null);
      try {
        const next = await getBids(projectIdNum);
        setBids(Array.isArray(next) ? next : []);
        sweepPendingAgainst(Array.isArray(next) ? next : [], setPendingPay);
      } catch {}
    }
  }

  const canEdit =
    me?.role === 'admin' ||
    (!!project?.ownerWallet && !!me?.address &&
      String(project.ownerWallet).toLowerCase() === String(me.address).toLowerCase());

  const isCompleted = (() => {
    if (project?.status === 'completed') return true;
    if (!acceptedBid) return false;
    if (acceptedMilestones.length === 0) return false;
    return acceptedMilestones.every((m) => m?.completed === true || !!m?.paymentTxHash);
  })();

  const msTotal = acceptedMilestones.length;
  const msCompleted = acceptedMilestones.filter((m) => m?.completed || m?.paymentTxHash).length;
  const msPaid = acceptedMilestones.filter((m) => m?.paymentTxHash).length;

  const lastActivity = (() => {
    const dates: (string | undefined | null)[] = [project?.updatedAt, project?.createdAt];
    for (const b of safeBids) {
      dates.push(b?.createdAt, b?.updatedAt);
      const arr = parseMilestones(b?.milestones);
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
  if (project?.createdAt) timeline.push({ at: project.createdAt, type: 'proposal_created', label: 'Proposal created' });
  if (project?.updatedAt && project.updatedAt !== project.createdAt) timeline.push({ at: project.updatedAt, type: 'proposal_updated', label: 'Proposal updated' });
  for (const b of safeBids) {
    if (b?.createdAt) timeline.push({ at: b.createdAt, type: 'bid_submitted', label: `Bid submitted by ${b.vendorName}`, meta: `${currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}` });
    if (String(b?.status || '').toLowerCase() === 'approved' && b?.updatedAt) timeline.push({ at: b.updatedAt, type: 'bid_approved', label: `Bid approved (${b.vendorName})` });
    const arr = parseMilestones(b?.milestones);
    arr.forEach((m, idx) => {
      if (m.completionDate) timeline.push({ at: m.completionDate, type: 'milestone_completed', label: `Milestone ${idx + 1} completed (${m.name || 'Untitled'})` });
      if (m.paymentDate) timeline.push({ at: m.paymentDate, type: 'milestone_paid', label: `Milestone ${idx + 1} paid`, meta: m.paymentTxHash ? `tx ${String(m.paymentTxHash).slice(0, 10)}…` : undefined });
    });
  }
  timeline.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());

  // Debug expose
  useEffect(() => { if (typeof window !== 'undefined') (window as any).__PROOFS = proofs; }, [proofs]);

  // Clear local "pending" keys for milestones now paid or SAFE-marked
  useEffect(() => {
    if (!safeBids.length) return;
    setPendingPay(prev => {
      const next = new Set(prev);
      for (const b of safeBids) {
        const bidId = Number(b?.bidId);
        if (!Number.isFinite(bidId)) continue;
        const ms = parseMilestones(b?.milestones);
        ms.forEach((m, idx) => {
          if (isPaidLite(m) || hasSafeMarkerLite(m)) {
            const k = mkKey2(bidId, idx);
            if (next.has(k)) {
              next.delete(k);
              try { removePendingLS(k); } catch {}
              try { postDone(bidId, idx); } catch {}
            }
          }
        });
      }
      return next;
    });
  }, [safeBids]);

  // ----------------- Render -----------------
  if (loadingProject) return <div className="p-6">Loading project...</div>;
  if (!project) return <div className="p-6">Project not found{errorMsg ? ` — ${errorMsg}` : ''}</div>;

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
          <Link href={`/bids/new?proposalId=${projectIdNum}`} className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
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
          <TabBtn id="milestones" label={`Milestones${msTotal ? ` (${msPaid}/${msTotal} paid)` : ''}`} tab={tab} setTab={setTab} />
          <TabBtn id="files" label={`Files (${allFiles.length})`} tab={tab} setTab={setTab} />
          {me.role === 'admin' && <TabBtn id="admin" label="Admin" tab={tab} setTab={setTab} />}
        </div>
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 border rounded p-4">
            <h3 className="font-semibold mb-3">Project Description</h3>
            <p className="text-gray-700">{project.summary || '—'}</p>

            <div className="mt-6">
              <h4 className="text-sm text-gray-600 mb-1">Milestone progress</h4>
              <Progress value={msTotal ? Math.round((msCompleted / msTotal) * 100) : 0} />
              <p className="text-xs text-gray-600 mt-1">
                {msCompleted}/{msTotal} completed • {msPaid}/{msTotal} paid
              </p>
            </div>

            <div className="mt-6">
              <h4 className="font-semibold mb-2">Latest activity</h4>
              {timeline.length ? (
                <ul className="text-sm space-y-1">
                  {timeline.slice(-5).reverse().map((e, i) => (
                    <li key={i}>
                      <b>{e.label}</b> • {fmt(e.at)} {e.meta ? <>• <span className="opacity-70">{e.meta}</span></> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No activity yet.</p>
              )}
            </div>
          </div>

          <div className="border rounded p-4">
            <h3 className="font-semibold mb-3">Bids snapshot</h3>
            {safeBids.length ? (
              <ul className="space-y-2 text-sm">
                {safeBids.slice(0, 5).map((b) => (
                  <li key={b.bidId} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{b.vendorName}</div>
                      <div className="opacity-70">{currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}</div>
                    </div>
                    <span className={classNames(
                      'px-2 py-1 rounded text-xs',
                      String(b?.status || '').toLowerCase() === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : String(b?.status || '').toLowerCase() === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    )}>
                      {b?.status || '—'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-gray-500">No bids yet.</p>}
          </div>
        </section>
      )}

      {/* Timeline */}
      {tab === 'timeline' && (
        <section className="border rounded p-4">
          <h3 className="font-semibold mb-3">Activity Timeline</h3>
          {timeline.length ? (
            <ol className="relative border-l pl-4">
              {timeline.map((e, i) => (
                <li key={i} className="mb-4">
                  <div className="absolute -left-2.5 w-2 h-2 rounded-full bg-slate-400 mt-1.5" />
                  <div className="text-sm">
                    <div className="font-medium">{e.label}</div>
                    <div className="opacity-70">{fmt(e.at)} {e.meta ? `• ${e.meta}` : ''}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-gray-500">No activity yet.</p>}
        </section>
      )}

      {/* Bids */}
      {tab === 'bids' && (
        <section className="border rounded p-4 overflow-x-auto">
          <h3 className="font-semibold mb-3">All Bids</h3>
          {safeBids.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-2 pr-4">Vendor</th>
                  <th className="py-2 pr-4">Amount</th>
                  <th className="py-2 pr-4">Days</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Submitted</th>
                  <th className="py-2 pr-4">Updated</th>
                </tr>
              </thead>
              <tbody>
                {safeBids.map((b) => (
                  <tr key={b.bidId} className="border-t">
                    <td className="py-2 pr-4">{b.vendorName}</td>
                    <td className="py-2 pr-4">{currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}</td>
                    <td className="py-2 pr-4">{b.days ?? '—'}</td>
                    <td className="py-2 pr-4">{b?.status || '—'}</td>
                    <td className="py-2 pr-4">{fmt(b?.createdAt)}</td>
                    <td className="py-2 pr-4">{fmt(b?.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-sm text-gray-500">No bids yet.</p>}
        </section>
      )}

      {/* Milestones */}
      {tab === 'milestones' && (
        <section className="border rounded p-4">
          <h3 className="font-semibold mb-3">
            Milestones {acceptedBid ? `— ${acceptedBid.vendorName}` : ''}
          </h3>

          {acceptedMilestones.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Completed</th>
                      <th className="py-2 pr-4">Paid</th>
                      <th className="py-2 pr-4">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptedMilestones.map((m, idx) => {
                      const paid = !!m.paymentTxHash;
                      const completedRow = paid || !!m.completed;

                      const k = acceptedBid ? msKey(Number(acceptedBid.bidId), idx) : null;
                      const hasProofNow = !!m.proof || (k ? !!proofJustSent[k] : false);
                      const status = paid ? 'paid' : completedRow ? 'completed' : hasProofNow ? 'submitted' : 'pending';

                      return (
                        <tr key={idx} className="border-t">
                          <td className="py-2 pr-4">M{idx + 1}</td>
                          <td className="py-2 pr-4">{m.name || '—'}</td>
                          <td className="py-2 pr-4">{m.amount ? currency.format(Number(m.amount)) : '—'}</td>
                          <td className="py-2 pr-4">{status}</td>
                          <td className="py-2 pr-4">{fmt(m.completionDate)}</td>
                          <td className="py-2 pr-4">{fmt(m.paymentDate)}</td>
                          <td className="py-2 pr-4">{m.paymentTxHash ? `${String(m.paymentTxHash).slice(0, 10)}…` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(acceptedBid || safeBids[0]) && (
                <div className="mt-6">
                  <MilestonePayments
                    bid={acceptedBid || safeBids[0]}
                    onUpdate={refreshProofs}
                    proposalId={projectIdNum}
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">No milestones defined yet.</p>
          )}
        </section>
      )}

      {/* Files */}
      {tab === 'files' && (
        <section className="border rounded p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Files</h3>
            <button
              onClick={refreshProofs}
              disabled={loadingProofs}
              className="text-sm px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-60"
              title="Refresh milestone proofs"
            >
              {loadingProofs ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {allFiles.length ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {allFiles.map((f, i) => {
                const doc = f.doc;
                if (!doc) return null;
                const baseUrl = normalizeIpfsUrl(doc.url, doc.cid);
                if (!baseUrl) return null;
                const nameFromUrl = decodeURIComponent((baseUrl.split('/').pop() || '').trim());
                const name = (doc.name && String(doc.name)) || nameFromUrl || 'file';
                const href = withFilename(baseUrl, name);
                const looksImage = isImageName(name) || isImageName(href);

                return (
                  <div key={i}>
                    <div className="text-xs text-gray-600 mb-1">{f.scope}</div>
                    {looksImage ? (
                      <button
                        onClick={() => setLightbox(href)}
                        className="group relative overflow-hidden rounded border"
                        title={name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={href} alt={name} className="h-24 w-24 object-cover group-hover:scale-105 transition" />
                      </button>
                    ) : (
                      <div className="p-2 rounded border bg-gray-50 text-xs text-gray-700">
                        <p className="truncate" title={name}>{name}</p>
                        <a href={href.startsWith('http') ? href : `https://${href}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          Open
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No files yet.</p>
          )}
        </section>
      )}

      {/* Admin */}
      {tab === 'admin' && me.role === 'admin' && (
        <section className="border rounded p-4">
          <h3 className="font-semibold mb-3">Admin — Proofs & Moderation</h3>

          <AdminProofs
            bidIds={safeBids.map(b => Number(b.bidId)).filter(Number.isFinite)}
            proposalId={projectIdNum}
            bids={safeBids}
            onRefresh={refreshProofs}
          />

          <div className="mt-6">
            <ChangeRequestsPanel proposalId={projectIdNum} />
          </div>

          <div className="mt-8">
            <h4 className="font-semibold mb-2">Admin — Payments</h4>
            {acceptedBid ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="py-2 pr-4">#</th>
                      <th className="py-2 pr-4">Title</th>
                      <th className="py-2 pr-4">Amount</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Tx</th>
                      <th className="py-2 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptedMilestones.map((m, idx) => {
                      const paid = !!m.paymentTxHash;
                      const completedRow = paid || !!m.completed;
                      const hasProofNow = !!m.proof;
                      const status = paid ? 'paid' : completedRow ? 'completed' : hasProofNow ? 'submitted' : 'pending';
                      const canRelease = !paid && completedRow;

                      const pendKey = mkKey2(Number(acceptedBid.bidId), idx);
                      const payIsPending = pendingPay.has(pendKey) && !hasSafeMarkerLite(m) && !isPaidLite(m);

                      return (
                        <tr key={idx} className="border-t">
                          <td className="py-2 pr-4">M{idx + 1}</td>
                          <td className="py-2 pr-4">{m.name || '—'}</td>
                          <td className="py-2 pr-4">{m.amount ? currency.format(Number(m.amount)) : '—'}</td>
                          <td className="py-2 pr-4">{status}</td>
                          <td className="py-2 pr-4">{m.paymentTxHash ? `${String(m.paymentTxHash).slice(0, 10)}…` : '—'}</td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleReleasePayment(idx)}
                                disabled={!canRelease || releasingKey === `${Number(acceptedBid.bidId)}:${idx}` || payIsPending}
                                className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                title={canRelease ? 'Release payment' : 'Not ready for payment'}
                              >
                                {releasingKey === `${Number(acceptedBid.bidId)}:${idx}` ? 'Releasing…' : (payIsPending ? 'Payment Pending…' : 'RELEASE PAYMENT')}
                              </button>

                              {/* SAFE button — OPTIMISTIC onQueued */}
                              <SafePayButton
                                bidId={Number(acceptedBid.bidId)}
                                milestoneIndex={idx}
                                amountUSD={Number(m?.amount || 0)}
                                disabled={!canRelease || releasingKey === `${Number(acceptedBid.bidId)}:${idx}` || payIsPending}
                                onQueued={async () => {
                                  const bidIdNum = Number(acceptedBid.bidId);
                                  const key = mkKey2(bidIdNum, idx);

                                  // queue + pending
                                  setPendingPay(prev => new Set(prev).add(key));
                                  addPendingLS(key);
                                  postQueued(bidIdNum, idx);

                                  // ✅ OPTIMISTIC: mark paid now
                                  setBids(prev => prev.map(b =>
                                    Number(b?.bidId) !== bidIdNum ? b : {
                                      ...b,
                                      milestones: parseMilestones(b.milestones).map((mm: any, i: number) =>
                                        i === idx
                                          ? {
                                              ...mm,
                                              completed: true,
                                              paymentTxHash: mm.paymentTxHash || 'local-paid',
                                              paymentDate: mm.paymentDate || new Date().toISOString(),
                                            }
                                          : mm
                                      ),
                                    }
                                  ));

                                  // clear pending chip and broadcast
                                  setPendingPay(prev => { const n = new Set(prev); n.delete(key); return n; });
                                  removePendingLS(key);
                                  postDone(bidIdNum, idx);

                                  // light refresh
                                  try { const next = await getBids(projectIdNum); setBids(Array.isArray(next) ? next : []); } catch {}
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No approved bid yet.</p>
            )}
          </div>
        </section>
      )}

      <div className="pt-2">
        <Link href="/projects" className="text-blue-600 hover:underline">← Back to Projects</Link>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="attachment preview" className="max-h-full max-w-full rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-4 right-4 text-white text-2xl" onClick={() => setLightbox(null)}>✕</button>
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
      className={classNames('px-3 py-2 text-sm -mb-px border-b-2', active ? 'border-black text-black' : 'border-transparent text-slate-600 hover:text-black')}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}
