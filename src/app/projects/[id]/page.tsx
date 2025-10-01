'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids, getAuthRole, getProofs } from '@/lib/api';
import AdminProofs from '@/components/AdminProofs';
import MilestonePayments from '@/components/MilestonePayments';

// ---------------- Consts ----------------
// Pinata gateway base
const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')
        : 'https://gateway.pinata.cloud/ipfs');

// ⚠️ Proofs endpoint: force local API unless you explicitly override with NEXT_PUBLIC_PROOFS_ENDPOINT
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
  milestoneIndex?: number; // zero-based
  note?: string;
  files?: ProofFile[];
  urls?: string[];
  cids?: string[];
};

type TabKey = 'overview' | 'timeline' | 'bids' | 'milestones' | 'files' | 'admin';

// -------------- Helpers (no hooks here) --------------
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

function filesFromProofRecords(items: ProofRecord[]) {
  const isBad = (u?: string) =>
    !u ||
    u.includes('<gw>') ||
    u.includes('<CID') ||
    u.includes('>') ||
    /^\s*$/.test(u);

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

// ----------- NEW: image/filename helpers -----------
function withFilename(url: string, name?: string) {
  if (!url) return url;
  if (!name) return url;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url.replace(/^https?:\/\//, '')}`);
    // only add ?filename when path is exactly /ipfs/<cid> and there is no existing query
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

// -------------- Component ----------------
export default function ProjectDetailPage() {
  // ---- route param (plain) ----
  const params = useParams();
  const projectIdParam = (params as any)?.id;
  const projectIdNum = Number(Array.isArray(projectIdParam) ? projectIdParam[0] : projectIdParam);

  // ---- hooks (fixed order; nothing conditional) ----
  const [project, setProject] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [proofs, setProofs] = useState<ProofRecord[]>([]);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingProofs, setLoadingProofs] = useState(true);
  const [me, setMe] = useState<{ address?: string; role?: 'admin'|'vendor'|'guest' }>({ role: 'guest' });
  const [tab, setTab] = useState<TabKey>('overview');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };

  // Initial fetch: project + bids
  useEffect(() => {
    let alive = true;
    async function run() {
      if (!Number.isFinite(projectIdNum)) return;
      try {
        const [p, b] = await Promise.all([ getProposal(projectIdNum), getBids(projectIdNum) ]);
        if (!alive) return;
        setProject(p);
        setBids(b);
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

  // Auth (for Admin tab & Edit btn)
  useEffect(() => {
    getAuthRole().then(setMe).catch(() => {});
  }, []);

  // Fetch proofs (always from local /api/proofs unless explicitly overridden)
  // Fetch proofs from BOTH sources and merge so Files tab matches Admin
const refreshProofs = async () => {
  if (!Number.isFinite(projectIdNum)) return;
  setLoadingProofs(true);

  try {
    // 1) Local DB: /api/proofs?proposalId=...
    const localUrl = `${PROOFS_ENDPOINT}?proposalId=${encodeURIComponent(projectIdNum)}&_t=${Date.now()}`;
    const localReq = fetch(localUrl, { credentials: 'include', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : []))
      .catch(() => []);

    // 2) External API (same source Admin tab uses): get proofs for the accepted bid
    //    If no accepted bid yet, we’ll still try the first bid as a fallback so vendors can see their uploads.
    const accepted = (bids || []).find(b => b.status === 'approved') || (bids || [])[0] || null;

    const adminReq = accepted
      ? getProofs(Number(accepted.bidId))
          .then(rows => {
            // Normalize to the local ProofRecord shape the Files tab expects
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

    // 3) Merge + de-dupe by milestone+url
    const key = (r: any, f: any) => `${Number(r.milestoneIndex)}|${String((f?.url || '').trim()).toLowerCase()}`;
    const seen = new Set<string>();
    const merged: any[] = [];

    function pushRecord(r: any) {
      // split into 1-file entries for simpler de-dupe
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

    // Group back by milestoneIndex to keep your Files tab logic happy
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

  // Load proofs once on mount
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

  // Refresh proofs when opening Files tab
  useEffect(() => {
    if (tab === 'files') { refreshProofs(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // 🔔 Live-refresh Files tab when proofs are saved (supports both event names)
  useEffect(() => {
    const onAnyProofUpdate = (ev: any) => {
      const pid = Number(ev?.detail?.proposalId);
      // If no detail provided: refresh anyway. If provided: only refresh when it matches this project.
      if (!Number.isFinite(pid) || pid === projectIdNum) {
        refreshProofs();
      }
    };
    window.addEventListener('proofs:updated', onAnyProofUpdate);
    window.addEventListener('proofs:changed', onAnyProofUpdate); // backward-compat
    return () => {
      window.removeEventListener('proofs:updated', onAnyProofUpdate);
      window.removeEventListener('proofs:changed', onAnyProofUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIdNum]);

  // Poll bids while AI analysis runs
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
        setBids(next);
        if (Date.now() - start < 90_000 && needsMore(next)) {
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

    if (needsMore(bids)) {
      clearPoll();
      pollTimer.current = setTimeout(tick, 1500);
    }

    const onFocus = () => {
      if (needsMore(bids)) {
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
  }, [projectIdNum, bids]);

  // Expose for console debug
  useEffect(() => {
    if (typeof window !== 'undefined') (window as any).__PROOFS = proofs;
  }, [proofs]);

  // -------- Early returns ----------
  if (loadingProject) return <div className="p-6">Loading project...</div>;
  if (!project) return <div className="p-6">Project not found{errorMsg ? ` — ${errorMsg}` : ''}</div>;

  // -------- Derived -----------
  const acceptedBid = bids.find((b) => b.status === 'approved') || null;
  const acceptedMilestones = parseMilestones(acceptedBid?.milestones);
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
  const msPaid = acceptedMilestones.filter((m) => m?.paymentTxHash).length;

  const lastActivity = (() => {
    const dates: (string | undefined | null)[] = [project.updatedAt, project.createdAt];
    for (const b of bids) {
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
  for (const b of bids) {
    if (b.createdAt) timeline.push({ at: b.createdAt, type: 'bid_submitted', label: `Bid submitted by ${b.vendorName}`, meta: `${currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}` });
    if (b.status === 'approved' && b.updatedAt) timeline.push({ at: b.updatedAt, type: 'bid_approved', label: `Bid approved (${b.vendorName})` });
    const arr = parseMilestones(b.milestones);
    arr.forEach((m, idx) => {
      if (m.completionDate) timeline.push({ at: m.completionDate, type: 'milestone_completed', label: `Milestone ${idx + 1} completed (${m.name || 'Untitled'})` });
      if (m.paymentDate) timeline.push({ at: m.paymentDate, type: 'milestone_paid', label: `Milestone ${idx + 1} paid`, meta: m.paymentTxHash ? `tx ${String(m.paymentTxHash).slice(0, 10)}…` : undefined });
    });
  }
  timeline.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());

  // Files (Project + Bid + Proofs)
  const projectFiles = projectDocs.map((d: any) => ({ scope: 'Project', doc: d }));
  const bidFiles = bids.flatMap((b) => {
    const ds = (b.docs || (b.doc ? [b.doc] : [])).filter(Boolean);
    return ds.map((d: any) => ({ scope: `Bid #${b.bidId} — ${b.vendorName || 'Vendor'}`, doc: d }));
  });
  const proofFiles = filesFromProofRecords(proofs);
  const allFiles = [...projectFiles, ...bidFiles, ...proofFiles];

  if (typeof window !== 'undefined') {
    (window as any).__FILES = allFiles.map((x) => {
      const rawHref = x.doc?.url || (x.doc?.cid ? `${PINATA_GATEWAY}/${x.doc.cid}` : null);
      const name = x.doc?.name || null;
      return {
        scope: x.scope,
        href: rawHref ? withFilename(rawHref, name || undefined) : null,
        name,
      };
    });
  }

  // -------------- small render helpers (no hooks) --------------
  function renderAttachment(doc: any, key: number) {
    if (!doc) return null;

    const rawUrl = doc.url || (doc.cid ? `${PINATA_GATEWAY}/${doc.cid}` : '');
    if (!rawUrl) return null;

    const nameFromUrl = decodeURIComponent((rawUrl.split('/').pop() || '').trim());
    const name = (doc.name && String(doc.name)) || nameFromUrl || 'file';

    // ensure IPFS URLs carry a filename so content-type/preview behaves nicely
    const displayUrl = withFilename(rawUrl, name);

    // detect images by NAME (preferred) or fallback to the URL
    const looksImage = isImageName(name) || isImageName(displayUrl);

    if (looksImage) {
      return (
        <button
          key={key}
          onClick={() => setLightbox(displayUrl)}
          className="group relative overflow-hidden rounded border"
          title={name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl}
            alt={name}
            className="h-24 w-24 object-cover group-hover:scale-105 transition"
          />
        </button>
      );
    }

    // non-image: show as an "Open" link
    const href = displayUrl.startsWith('http') ? displayUrl : `https://${displayUrl}`;
    return (
      <div key={key} className="p-2 rounded border bg-gray-50 text-xs text-gray-700">
        <p className="truncate" title={name}>{name}</p>
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open</a>
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
          <TabBtn id="bids" label={`Bids (${bids.length})`} tab={tab} setTab={setTab} />
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
            {bids.length ? (
              <ul className="space-y-2 text-sm">
                {bids.slice(0, 5).map((b) => (
                  <li key={b.bidId} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{b.vendorName}</div>
                      <div className="opacity-70">{currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}</div>
                    </div>
                    <span className={classNames(
                      'px-2 py-1 rounded text-xs',
                      b.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : b.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    )}>
                      {b.status}
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
          {bids.length ? (
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
                {bids.map((b) => (
                  <tr key={b.bidId} className="border-t">
                    <td className="py-2 pr-4">{b.vendorName}</td>
                    <td className="py-2 pr-4">{currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}</td>
                    <td className="py-2 pr-4">{b.days}</td>
                    <td className="py-2 pr-4">{b.status}</td>
                    <td className="py-2 pr-4">{fmt(b.createdAt)}</td>
                    <td className="py-2 pr-4">{fmt(b.updatedAt)}</td>
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
                      return (
                        <tr key={idx} className="border-t">
                          <td className="py-2 pr-4">M{idx + 1}</td>
                          <td className="py-2 pr-4">{m.name || '—'}</td>
                          <td className="py-2 pr-4">
                            {m.amount ? currency.format(Number(m.amount)) : '—'}
                          </td>
                          <td className="py-2 pr-4">
                            {paid ? 'paid' : completedRow ? 'completed' : 'pending'}
                          </td>
                          <td className="py-2 pr-4">{fmt(m.completionDate) || '—'}</td>
                          <td className="py-2 pr-4">{fmt(m.paymentDate) || '—'}</td>
                          <td className="py-2 pr-4">
                            {m.paymentTxHash ? `${String(m.paymentTxHash).slice(0, 10)}…` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ✅ Render the proof submission widget here */}
              {(acceptedBid || (bids && bids[0])) && (
                <div className="mt-6">
                  <MilestonePayments
                    bid={acceptedBid || bids[0]}      // show the widget even if the bid isn’t approved yet
                    onUpdate={refreshProofs}
                    proposalId={projectIdNum}         // ← REQUIRED so /api/proofs writes to the correct project
                  />
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">
              No milestones defined yet.
            </p>
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
              {allFiles.map((f, i) => (
                <div key={i}>
                  <div className="text-xs text-gray-600 mb-1">{f.scope}</div>
                  {renderAttachment(f.doc, i)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No files yet.</p>
          )}
        </section>
      )}

      {/* Admin (only for admins) */}
{tab === 'admin' && me.role === 'admin' && (
  <section className="border rounded p-4">
    <h3 className="font-semibold mb-3">Admin — Proofs & Moderation</h3>
    <p className="text-sm text-gray-600 mb-3">
      Review vendor proofs per milestone, approve or reject, and refresh the list after actions.
    </p>
    <div className="mb-4">
      <button
        onClick={refreshProofs}
        disabled={loadingProofs}
        className="text-sm px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-60"
      >
        {loadingProofs ? 'Refreshing…' : 'Refresh Proofs'}
      </button>
    </div>

    {/* ✅ Use backend proofs, filtered to this project's bids */}
    <AdminProofs bidIds={bids.map(b => b.bidId)} />
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
