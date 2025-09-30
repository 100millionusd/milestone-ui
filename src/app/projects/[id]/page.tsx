// src/app/projects/[id]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids, getAuthRole } from '@/lib/api';

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
  'https://gateway.pinata.cloud/ipfs';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

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
function coerceAnalysis(a: any): (AnalysisV2 & AnalysisV1) | null {
  if (!a) return null;
  if (typeof a === 'string') { try { return JSON.parse(a); } catch { return null; } }
  return a;
}

type Milestone = {
  name?: string;
  amount?: number;
  dueDate?: string;
  completed?: boolean;
  completionDate?: string | null;
  paymentTxHash?: string | null;
  paymentDate?: string | null;
  proof?: string;
  proofCid?: string;
  folderCid?: string;
  cid?: string;
  files?: any[] | string;
  attachments?: any;
  images?: any;
  docs?: any;
  [k: string]: any;
};

function parseMilestones(raw: unknown): Milestone[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as Milestone[];
  try { const arr = JSON.parse(String(raw)); return Array.isArray(arr) ? (arr as Milestone[]) : []; }
  catch { return []; }
}
function parseDocs(raw: unknown): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : []; } catch { return []; }
  }
  return [];
}
function fmt(dt?: string | null) {
  if (!dt) return '';
  const d = new Date(dt);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
}
function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

/* ------------------------- Robust IPFS/URL helpers ------------------------- */

const CID_ONLY_RE = /^(Qm[1-9A-Za-z]{44,}|bafy[1-9A-Za-z]{20,})$/i;
const IPFS_URI_RE = /^ipfs:\/\/(?:ipfs\/)?([^\/?#]+)(\/[^?#]*)?/i;
const HTTP_IPFS_RE = /^https?:\/\/[^\/]+\/ipfs\/([^\/?#]+)(\/[^?#]*)?/i;
const IMG_EXT_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
const FILE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|pdf|docx?|xlsx?|pptx?)$/i;

function isHttpUrl(s: string): boolean {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
}
function safePathnameFromHref(href: string): string {
  try { return new URL(href).pathname || ''; } catch { return ''; }
}
function encodeIpfsPath(path: string): string {
  if (!path) return '';
  const clean = path.replace(/^\/*/, '');
  if (!clean) return '';
  return '/' + clean.split('/').map(seg => encodeURIComponent(seg)).join('/');
}
function parseIpfsLike(s: string): { cid: string; path: string } | null {
  let m = s.match(IPFS_URI_RE);
  if (m) { const cid = m[1]; const path = m[2] || ''; return CID_ONLY_RE.test(cid) ? { cid, path } : null; }
  m = s.match(HTTP_IPFS_RE);
  if (m) { const cid = m[1]; const path = m[2] || ''; return CID_ONLY_RE.test(cid) ? { cid, path } : null; }
  if (CID_ONLY_RE.test(s)) return { cid: s, path: '' };
  return null;
}
function pickName(doc: any, fallbackHref?: string): string {
  if (!doc) return fallbackHref?.split('/').pop() || 'file';
  if (typeof doc === 'string') return doc.split('/').pop() || doc;
  return (
    doc.name || doc.filename || doc.fileName || doc.file ||
    (typeof doc.path === 'string' ? doc.path.split('/').pop() : '') ||
    (fallbackHref ? fallbackHref.split('/').pop() : '') ||
    'file'
  );
}
function normalizeDoc(raw: any) {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const s = raw.trim();

    if (isHttpUrl(s)) {
      const m = s.match(HTTP_IPFS_RE);
      if (m && CID_ONLY_RE.test(m[1])) return { cid: m[1], ipfsPath: m[2] || '', name: pickName(null, s) };
      return { url: s, name: pickName(null, s) };
    }
    const ref = parseIpfsLike(s);
    if (ref) {
      const baseName = ref.path ? decodeURIComponent(ref.path.split('/').pop() || '') : '';
      return { cid: ref.cid, ipfsPath: ref.path, name: baseName || `${ref.cid.slice(0, 8)}…` };
    }
    return { name: s };
  }

  const doc: any = { ...raw };

  if (typeof doc.name === 'string') {
    const n = doc.name.trim();
    if (isHttpUrl(n)) {
      const m = n.match(HTTP_IPFS_RE);
      if (m && CID_ONLY_RE.test(m[1])) return { cid: m[1], ipfsPath: m[2] || '', name: pickName(null, n) };
      return { url: n, name: pickName(null, n) };
    }
    const ref = parseIpfsLike(n);
    if (ref) return { cid: ref.cid, ipfsPath: ref.path || '', name: pickName(null, n) };
  }

  const urlLike = doc.url || doc.gatewayUrl || doc.ipfsUrl || doc.href;
  if (typeof urlLike === 'string') {
    const s = urlLike.trim();
    if (isHttpUrl(s)) {
      const m = s.match(HTTP_IPFS_RE);
      if (m && CID_ONLY_RE.test(m[1])) return { cid: m[1], ipfsPath: m[2] || '', name: doc.name || pickName(null, s) };
      return { url: s, name: doc.name || pickName(null, s) };
    }
    const ref = parseIpfsLike(s);
    if (ref) return { cid: ref.cid, ipfsPath: ref.path || '', name: doc.name || pickName(null, s) };
  }

  if (typeof doc.path === 'string' && !doc.ipfsPath) doc.ipfsPath = doc.path;

  if (typeof doc.cid === 'string') {
    const ref = parseIpfsLike(`ipfs://${doc.cid}${doc.ipfsPath || ''}`);
    if (ref) return { ...doc, cid: ref.cid, ipfsPath: ref.path || '', name: pickName(doc) };
  }

  if (doc.name || doc.filename || doc.fileName || doc.file || doc.path) return { name: pickName(doc) };

  return null;
}
function hrefForDoc(doc: any): string | null {
  if (!doc) return null;
  if (doc.cid && CID_ONLY_RE.test(doc.cid)) {
    const suffix = encodeIpfsPath(doc.ipfsPath || '');
    return `${GATEWAY}/${encodeURIComponent(doc.cid)}${suffix}`;
  }
  if (doc.url && isHttpUrl(doc.url)) return doc.url;
  return null;
}

/* ------------------------ Milestone file collection ------------------------ */

const BASE_CID_KEYS = [
  'proofCid', 'proof_cid', 'proofCID',
  'folderCid', 'folder_cid',
  'imagesCid', 'filesCid', 'uploadsCid', 'rootCid',
  'cid'
];

function gatherFileCandidates(obj: any, depth = 0): any[] {
  const out: any[] = [];
  if (!obj || depth > 3) return out;

  if (typeof obj === 'string') { out.push(obj); return out; }
  if (Array.isArray(obj)) { for (const v of obj) out.push(...gatherFileCandidates(v, depth + 1)); return out; }
  if (typeof obj === 'object') {
    for (const [, v] of Object.entries(obj)) out.push(...gatherFileCandidates(v, depth + 1));
    return out;
  }
  return out;
}

function findBaseCidRef(m: any): { cid: string; path: string } | null {
  for (const key of BASE_CID_KEYS) {
    const v = m?.[key];
    if (typeof v === 'string') {
      const ref = parseIpfsLike(v);
      if (ref) return { cid: ref.cid, path: ref.path || '' };
      if (CID_ONLY_RE.test(v)) return { cid: v, path: '' };
    }
  }
  if (typeof m?.proof === 'string') {
    const ref = parseIpfsLike(m.proof);
    if (ref) return { cid: ref.cid, path: ref.path || '' };
  }
  for (const v of Object.values(m || {})) {
    if (typeof v === 'string') {
      const ref = parseIpfsLike(v);
      if (ref) return { cid: ref.cid, path: ref.path || '' };
    }
  }
  return null;
}

function collectMilestoneFiles(bid: any) {
  const arr = parseMilestones(bid?.milestones);
  const out: Array<{ scope: string; doc: any }> = [];

  arr.forEach((m: any, idx: number) => {
    const scope = `Milestone M${idx + 1}${m?.name ? ` — ${m.name}` : ''}`;
    const baseRef = findBaseCidRef(m);
    const candidates = gatherFileCandidates(m);

    for (const c of candidates) {
      const doc = normalizeDoc(c);
      const direct = doc && hrefForDoc(doc);
      if (direct) {
        out.push({ scope, doc: { ...doc, name: pickName(doc, direct) } });
        continue;
      }

      const maybeName =
        typeof c === 'string'
          ? c
          : (c && (c as any).path) || (c as any)?.filename || (c as any)?.fileName || (c as any)?.file || (c as any)?.name;

      if (maybeName && baseRef) {
        const stitchedDoc = {
          cid: baseRef.cid,
          ipfsPath: String(maybeName).startsWith('/') ? String(maybeName) : `/${String(maybeName)}`,
          name: pickName({ name: String(maybeName) })
        };
        const stitchedHref = hrefForDoc(stitchedDoc);
        if (stitchedHref) {
          out.push({ scope, doc: stitchedDoc });
        }
      }
    }

    if (typeof m.proof === 'string') {
      const pr = normalizeDoc(m.proof);
      const prHref = pr && hrefForDoc(pr);
      if (prHref) out.push({ scope, doc: { ...pr, name: pickName(pr, prHref) } });
    }
  });

  return out;
}

/* -------------------------------- Component -------------------------------- */

type TabKey = 'overview' | 'timeline' | 'bids' | 'milestones' | 'files';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectIdNum = Number((params as any)?.id);

  const [project, setProject] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [me, setMe] = useState<{ address?: string; role?: 'admin'|'vendor'|'guest' }>({ role: 'guest' });
  const [tab, setTab] = useState<TabKey>('overview');

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };

  useEffect(() => {
    let active = true;
    if (!Number.isFinite(projectIdNum)) return;
    (async () => {
      try {
        const [projectData, bidsData] = await Promise.all([
          getProposal(projectIdNum),
          getBids(projectIdNum),
        ]);
        if (!active) return;
        setProject(projectData);
        setBids(bidsData);
      } catch (e) {
        console.error('Error fetching project:', e);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [projectIdNum]);

  useEffect(() => {
    getAuthRole().then(setMe).catch(() => {});
  }, []);

  useEffect(() => {
    (window as any).__BIDS = bids;
  }, [bids]);

  useEffect(() => {
    if (!Number.isFinite(projectIdNum)) return;
    let stopped = false;
    const start = Date.now();

    const needsMore = (rows: any[]) =>
      rows.some((row) => {
        const a = coerceAnalysis(row?.aiAnalysis ?? row?.ai_analysis);
        return !a || (a.status && a.status !== 'ready' && a.status !== 'error');
      });

    const tick = async () => {
      try {
        const next = await getBids(projectIdNum);
        if (stopped) return;
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
      stopped = true;
      clearPoll();
      window.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
    };
  }, [projectIdNum, bids]);

  /* ---------- helpers used in render (no hooks below this line!) ---------- */
  const acceptedBid = bids.find((b) => b.status === 'approved') || null;
  const acceptedMs = parseMilestones(acceptedBid?.milestones); // ← declared ONCE

  const isProjectCompleted = (proj: any) => {
    if (!proj) return false;
    if (proj.status === 'completed') return true;
    if (!acceptedBid) return false;
    if (acceptedMs.length === 0) return false;
    return acceptedMs.every((m) => m?.completed === true || !!m?.paymentTxHash);
  };
  const completed = isProjectCompleted(project);

  const canEdit =
    me?.role === 'admin' ||
    (!!project?.ownerWallet &&
      !!me?.address &&
      String(project.ownerWallet).toLowerCase() === String(me.address).toLowerCase());

  const renderAttachment = (docIn: any, idx: number) => {
    const doc = normalizeDoc(docIn);
    if (!doc) return null;
    const href = hrefForDoc(doc);
    const name = pickName(doc, href || undefined);
    const isImageByName = IMG_EXT_RE.test(name);
    const pathFromHref = href ? safePathnameFromHref(href) : '';
    const isImageByHrefPath = IMG_EXT_RE.test(pathFromHref);
    const isImage = (isImageByName || isImageByHrefPath) && !!href;

    if (!href) {
      return (
        <div key={idx} className="p-2 rounded border bg-gray-50 text-xs text-gray-500">
          <p className="truncate">{name}</p>
          <p className="italic">No file link</p>
        </div>
      );
    }

    if (isImage) {
      return (
        <button
          key={idx}
          onClick={() => setLightbox(href)}
          className="group relative overflow-hidden rounded border w-[96px] h-[96px]"
          title={name}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={name} className="h-24 w-24 object-cover group-hover:scale-105 transition" />
        </button>
      );
    }

    return (
      <div key={idx} className="p-2 rounded border bg-gray-50 text-xs text-gray-700">
        <p className="truncate" title={name}>{name}</p>
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Open</a>
      </div>
    );
  };

  const renderAnalysis = (raw: any) => {
    const analysis = coerceAnalysis(raw);
    const isPending = !analysis || (analysis.status && analysis.status !== 'ready' && analysis.status !== 'error');

    if (isPending) return <p className="mt-2 text-xs text-gray-400 italic">⏳ Analysis pending…</p>;
    if (!analysis) return <p className="mt-2 text-xs text-gray-400 italic">No analysis.</p>;

    const isV2 = analysis.summary || analysis.fit || analysis.risks || analysis.confidence || analysis.milestoneNotes;
    const isV1 = analysis.verdict || analysis.reasoning || analysis.suggestions;

    return (
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <h4 className="font-semibold text-sm mb-1">Agent 2 Analysis</h4>

        {isV2 && (
          <>
            {analysis.summary && <p className="text-sm mb-1">{analysis.summary}</p>}
            <div className="text-sm">
              {analysis.fit && (<><span className="font-medium">Fit:</span> {String(analysis.fit)} </>)}
              {typeof analysis.confidence === 'number' && (
                <>
                  <span className="mx-1">·</span>
                  <span className="font-medium">Confidence:</span> {Math.round(analysis.confidence * 100)}%
                </>
              )}
            </div>
            {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
              <div className="mt-2">
                <div className="font-medium text-sm">Risks</div>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {analysis.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {Array.isArray(analysis.milestoneNotes) && analysis.milestoneNotes.length > 0 && (
              <div className="mt-2">
                <div className="font-medium text-sm">Milestone Notes</div>
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {analysis.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
                </ul>
              </div>
            )}
            {typeof analysis.pdfUsed === 'boolean' && (
              <div className="mt-3 text-[11px] text-gray-600 space-y-1">
                <div>PDF parsed: {analysis.pdfUsed ? 'Yes' : 'No'}</div>
                {analysis.pdfDebug?.url && (
                  <div>
                    File:{' '}
                    <a href={analysis.pdfDebug.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      {analysis.pdfDebug.name || 'open'}
                    </a>
                  </div>
                )}
                {analysis.pdfDebug?.bytes !== undefined && <div>Bytes: {analysis.pdfDebug.bytes}</div>}
                {analysis.pdfDebug?.first5 && <div>First bytes: {analysis.pdfDebug.first5}</div>}
                {analysis.pdfDebug?.reason && <div>Reason: {analysis.pdfDebug.reason}</div>}
                {analysis.pdfDebug?.error && <div className="text-rose-600">Error: {analysis.pdfDebug.error}</div>}
              </div>
            )}
          </>
        )}

        {isV1 && (
          <div className={isV2 ? 'mt-3 pt-3 border-t border-blue-100' : ''}>
            {analysis.verdict && (<p className="text-sm"><span className="font-medium">Verdict:</span> {analysis.verdict}</p>)}
            {analysis.reasoning && (<p className="text-sm"><span className="font-medium">Reasoning:</span> {analysis.reasoning}</p>)}
            {Array.isArray(analysis.suggestions) && analysis.suggestions.length > 0 && (
              <ul className="list-disc list-inside mt-1 text-sm text-gray-700">
                {analysis.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </div>
        )}

        {!isV1 && !isV2 && <p className="text-xs text-gray-500 italic">Unknown analysis format.</p>}
      </div>
    );
  };

  // ---- EARLY RETURNS (no hooks below) ----
  if (loading) return <div className="p-6">Loading project...</div>;
  if (!project) return <div className="p-6">Project not found</div>;

  // Derived values
  const msTotal = acceptedMs.length;
  const msCompleted = acceptedMs.filter(m => m?.completed || m?.paymentTxHash).length;
  const msPaid = acceptedMs.filter(m => m?.paymentTxHash).length;

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

  // Build Timeline
  type EventItem = { at?: string | null; type: string; label: string; meta?: string };
  const timeline: EventItem[] = [];
  if (project.createdAt) timeline.push({ at: project.createdAt, type: 'proposal_created', label: 'Proposal created' });
  if (project.updatedAt && project.updatedAt !== project.createdAt) timeline.push({ at: project.updatedAt, type: 'proposal_updated', label: 'Proposal updated' });
  for (const b of bids) {
    if (b.createdAt) timeline.push({ at: b.createdAt, type: 'bid_submitted', label: `Bid submitted by ${b.vendorName}`, meta: `${currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}` });
    if (b.status === 'approved' && b.updatedAt) timeline.push({ at: b.updatedAt, type: 'bid_approved', label: `Bid approved (${b.vendorName})` });
    const arr = parseMilestones(b.milestones);
    arr.forEach((m, idx) => {
      if (m.completionDate) timeline.push({ at: m.completionDate, type: 'milestone_completed', label: `Milestone ${idx+1} completed (${m.name || 'Untitled'})` });
      if (m.paymentDate) timeline.push({ at: m.paymentDate, type: 'milestone_paid', label: `Milestone ${idx+1} paid`, meta: m.paymentTxHash ? `tx ${String(m.paymentTxHash).slice(0,10)}…` : undefined });
    });
  }
  timeline.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());

  // Files roll-up = Project docs + Bid docs + Milestone files
  const projectDocs = parseDocs(project?.docs);
  const allFiles: Array<{ scope: string; doc: any }> = [
    ...(projectDocs || []).map((d) => ({ scope: 'Project', doc: d })),
    ...bids.flatMap((b) => {
      const ds = (parseDocs(b.docs) || []).concat(b.doc ? [b.doc] : []);
      return ds.map((d: any) => ({ scope: `Bid #${b.bidId} — ${b.vendorName || 'Vendor'}`, doc: d }));
    }),
    ...bids.flatMap((b) => collectMilestoneFiles(b)),
  ];

  if (typeof window !== 'undefined') {
    (window as any).__FILES = allFiles
      .map(({ doc }) => hrefForDoc(normalizeDoc(doc)))
      .filter(Boolean);
  }

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
              completed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            )}>
              {completed ? 'Completed' : 'Active'}
            </span>
          </div>
          <p className="text-gray-600">{project.orgName}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            <span>Budget: <b>{currency.format(Number(project.amountUSD || 0))}</b></span>
            <span>Last activity: <b>{lastActivity}</b></span>
            {acceptedBid && (
              <span>Awarded: <b>{currency.format(Number((acceptedBid.priceUSD ?? acceptedBid.priceUsd) || 0))}</b></span>
            )}
          </div>
        </div>
        {!completed && (
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
          <TabBtn id="milestones" label={`Milestones${acceptedMs.length ? ` (${msPaid}/${msTotal} paid)` : ''}`} tab={tab} setTab={setTab} />
          <TabBtn id="files" label={`Files (${allFiles.length})`} tab={tab} setTab={setTab} />
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
              <Progress value={acceptedMs.length ? Math.round((msCompleted / msTotal) * 100) : 0} />
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
                {bids.slice(0,5).map((b) => (
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
        <section className="border rounded p-4 overflow-x-auto">
          <h3 className="font-semibold mb-3">Milestones {acceptedBid ? `— ${acceptedBid.vendorName}` : ''}</h3>
          {acceptedBid && acceptedMs.length ? (
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
                {acceptedMs.map((m, idx) => {
                  const paid = !!m.paymentTxHash;
                  const completedRow = paid || !!m.completed;
                  return (
                    <tr key={idx} className="border-t">
                      <td className="py-2 pr-4">M{idx+1}</td>
                      <td className="py-2 pr-4">{m.name || '—'}</td>
                      <td className="py-2 pr-4">{m.amount ? currency.format(Number(m.amount)) : '—'}</td>
                      <td className="py-2 pr-4">{paid ? 'paid' : completedRow ? 'completed' : 'pending'}</td>
                      <td className="py-2 pr-4">{fmt(m.completionDate) || '—'}</td>
                      <td className="py-2 pr-4">{fmt(m.paymentDate) || '—'}</td>
                      <td className="py-2 pr-4">{m.paymentTxHash ? `${String(m.paymentTxHash).slice(0,10)}…` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">
              {acceptedBid ? 'No milestones defined for the accepted bid.' : 'No accepted bid yet.'}
            </p>
          )}
        </section>
      )}

      {/* Files */}
      {tab === 'files' && (
        <section className="border rounded p-4">
          <h3 className="font-semibold mb-3">Files</h3>
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
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-500">debug: show file URLs</summary>
            <ul className="mt-2 text-xs break-all space-y-1">
              {allFiles.map((f, i) => {
                const href = hrefForDoc(normalizeDoc(f.doc));
                return <li key={i}>{href || '(no link)'}</li>;
              })}
            </ul>
          </details>
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

// Simple progress bar
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
