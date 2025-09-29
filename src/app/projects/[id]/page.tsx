'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids, getAuthRole } from '@/lib/api';

// Pinata gateway (hard-wired). You can move to .env later if you prefer.
const GATEWAY = 'https://sapphire-given-snake-741.mypinata.cloud/ipfs';
const VIA_PROXY = false;

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/* ----------------------------- Types / Helpers ----------------------------- */

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
  // (other possible keys exist; we’ll scan generically)
};

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

/* --------------------------- ROBUST IPFS HELPERS --------------------------- */
const CID_RE = /(?:^|\/)(Qm[1-9A-Za-z]{44,}|bafy[1-9A-Za-z]{20,})(?:$|\/)/i;
const CID_ONLY_RE = /^(Qm[1-9A-Za-z]{44,}|bafy[1-9A-Za-z]{20,})$/i;
const CID_WITH_PATH_RE = /^(Qm[1-9A-Za-z]{44,}|bafy[1-9A-Za-z]{20,})(\/[^?#]*)?$/i;
const IPFS_URI_RE = /^ipfs:\/\/(?:ipfs\/)?([^\/?#]+)(\/[^?#]*)?/i;
const HTTP_IPFS_RE = /^https?:\/\/[^\/]+\/ipfs\/([^\/?#]+)(\/[^?#]*)?/i;
const FILE_LIKE_RE = /\.(png|jpe?g|gif|webp|svg|pdf|docx?|xlsx?|pptx?)$/i;

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
function encodeIpfsPath(path: string): string {
  if (!path) return '';
  const clean = path.replace(/^\/*/, '');
  if (!clean) return '';
  return '/' + clean.split('/').map(seg => encodeURIComponent(seg)).join('/');
}
function parseIpfsLike(s: string): { cid: string; path: string } | null {
  let m = s.match(IPFS_URI_RE);
  if (m) {
    const cid = m[1]; const path = m[2] || '';
    return CID_ONLY_RE.test(cid) ? { cid, path } : null;
  }
  m = s.match(HTTP_IPFS_RE);
  if (m) {
    const cid = m[1]; const path = m[2] || '';
    return CID_ONLY_RE.test(cid) ? { cid, path } : null;
  }
  m = s.match(CID_WITH_PATH_RE);
  if (m) {
    const cid = m[1]; const path = m[2] || '';
    return CID_ONLY_RE.test(cid) ? { cid, path } : null;
  }
  return null;
}
function hrefForDoc(doc: any): string | null {
  if (!doc) return null;

  if (doc.cid && CID_ONLY_RE.test(doc.cid)) {
    const suffix = encodeIpfsPath(doc.ipfsPath || '');
    return VIA_PROXY
      ? `/api/ipfs?cid=${encodeURIComponent(doc.cid)}${suffix ? `&path=${encodeURIComponent(suffix)}` : ''}`
      : `${GATEWAY}/${encodeURIComponent(doc.cid)}${suffix}`;
  }
  if (doc.url && isHttpUrl(doc.url)) return doc.url;

  return null;
}
function pickName(doc: any, fallbackHref?: string): string {
  if (!doc) return fallbackHref?.split('/').pop() || 'file';
  if (typeof doc === 'string') return doc.split('/').pop() || doc;
  return (
    doc.name ||
    doc.filename ||
    doc.fileName ||
    doc.file ||
    (typeof doc.path === 'string' ? doc.path.split('/').pop() : '') ||
    (fallbackHref ? fallbackHref.split('/').pop() : '') ||
    'file'
  );
}

/** Normalize any doc-like value to a standard shape */
function normalizeDoc(raw: any) {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const s = raw.trim();

    if (isHttpUrl(s)) {
      const m = s.match(HTTP_IPFS_RE);
      if (m && CID_ONLY_RE.test(m[1])) {
        return { cid: m[1], ipfsPath: m[2] || '', name: pickName(null, s) };
      }
      return { url: s, name: pickName(null, s) };
    }
    const ref = parseIpfsLike(s);
    if (ref) {
      const baseName = ref.path ? decodeURIComponent(ref.path.split('/').pop() || '') : '';
      return { cid: ref.cid, ipfsPath: ref.path, name: baseName || `${ref.cid.slice(0, 8)}…` };
    }
    if (CID_ONLY_RE.test(s)) return { cid: s, ipfsPath: '', name: `${s.slice(0, 8)}…` };

    // Not a URL/CID — treat as plain label (may be stitched later)
    return { name: s };
  }

  const doc: any = { ...raw };
  const urlLike = doc.url || doc.gatewayUrl || doc.ipfsUrl || doc.href;
  if (typeof urlLike === 'string') {
    const s = urlLike.trim();
    if (isHttpUrl(s)) {
      const m = s.match(HTTP_IPFS_RE);
      if (m && CID_ONLY_RE.test(m[1])) {
        return { cid: m[1], ipfsPath: m[2] || '', name: doc.name || pickName(null, s) };
      }
      return { url: s, name: doc.name || pickName(null, s) };
    }
    const ref = parseIpfsLike(s);
    if (ref) return { cid: ref.cid, ipfsPath: ref.path || '', name: doc.name || pickName(null, s) };
  }

  if (typeof doc.path === 'string' && !doc.ipfsPath) {
    doc.ipfsPath = doc.path;
  }
  if (typeof doc.cid === 'string') {
    const ref = parseIpfsLike(`ipfs://${doc.cid}${doc.ipfsPath || ''}`);
    if (ref) return { ...doc, cid: ref.cid, ipfsPath: ref.path || '', name: pickName(doc) };
  }
  if (doc.name || doc.filename || doc.fileName || doc.file || doc.path) {
    return { name: pickName(doc) };
  }
  return null;
}

/* -------------------------- Deep scanning for CIDs/files -------------------------- */

// Prefer keys which likely hold a folder CID:
const PREFERRED_CID_KEYS = ['proofCid', 'folderCid', 'cid', 'proof', 'ipfs', 'ipfsCid', 'folder', 'baseCid', 'rootCid'];

function findCidsInAny(value: any, depth = 0, preferOnly = false): string[] {
  const out: string[] = [];
  if (!value || depth > 3) return out;

  if (typeof value === 'string') {
    const m1 = value.match(IPFS_URI_RE) || value.match(HTTP_IPFS_RE);
    if (m1 && CID_ONLY_RE.test(m1[1])) out.push(m1[1]);
    const m2 = value.match(CID_RE);
    if (m2 && CID_ONLY_RE.test(m2[1])) out.push(m2[1]);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) out.push(...findCidsInAny(v, depth + 1, preferOnly));
    return out;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    // Prefer “cid-like” keys first (so we use the right folder)
    const preferred = entries
      .filter(([k]) => PREFERRED_CID_KEYS.includes(k))
      .flatMap(([, v]) => findCidsInAny(v, depth + 1, false));
    const rest = preferOnly ? [] : entries.flatMap(([, v]) => findCidsInAny(v, depth + 1, false));
    return [...preferred, ...rest];
  }
  return out;
}

const FILE_KEYS = [
  'files', 'images', 'pics', 'pictures', 'attachments', 'attachment', 'docs', 'documents',
  'proofs', 'proofFiles', 'uploads', 'assets', 'paths', 'pathList', 'items'
];

function gatherFileCandidates(obj: any, depth = 0): any[] {
  const out: any[] = [];
  if (!obj || depth > 2) return out;

  if (typeof obj === 'string') {
    if (FILE_LIKE_RE.test(obj) || isHttpUrl(obj) || parseIpfsLike(obj) || CID_ONLY_RE.test(obj)) out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const v of obj) out.push(...gatherFileCandidates(v, depth + 1));
    return out;
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (FILE_KEYS.includes(k)) out.push(...gatherFileCandidates(v, depth + 1));
      // also pick obvious single-file objects
      if (['file', 'filename', 'fileName', 'href', 'url', 'path'].includes(k)) out.push(v as any);
      // strings with file-like endings anywhere:
      if (typeof v === 'string' && FILE_LIKE_RE.test(v)) out.push(v);
      // Recurse
      out.push(...gatherFileCandidates(v, depth + 1));
    }
    return out;
  }
  return out;
}

/* -------------------- Milestone → files (scan + stitch smartly) -------------------- */
function collectMilestoneFiles(bid: any) {
  const arr = parseMilestones(bid?.milestones);
  const out: Array<{ scope: string; doc: any }> = [];

  arr.forEach((m: Milestone, idx: number) => {
    const scope = `Milestone M${idx + 1} — Bid #${bid?.bidId}${(bid as any)?.vendorName ? ` (${(bid as any).vendorName})` : ''}`;

    // 1) Find best base CID (folder) inside milestone first, then fall back to bid
    const preferredCids = [
      ...(typeof m.proof === 'string' ? findCidsInAny(m.proof) : []),
      ...(m.proofCid ? [m.proofCid] : []),
      ...(m.folderCid ? [m.folderCid] : []),
      ...(m.cid ? [m.cid] : []),
      ...findCidsInAny(m, 0, true),
    ].filter(c => CID_ONLY_RE.test(String(c)));

    let baseCid = preferredCids[0];
    if (!baseCid) {
      const bidCidsPreferred = findCidsInAny(bid, 0, true).filter(c => CID_ONLY_RE.test(String(c)));
      const bidCidsAny = findCidsInAny(bid).filter(c => CID_ONLY_RE.test(String(c)));
      baseCid = bidCidsPreferred[0] || bidCidsAny[0] || undefined;
    }

    // 2) Gather candidates for files from any likely field
    const candidates = [
      ...gatherFileCandidates(m),
    ];

    // 3) Convert candidates into docs/links
    for (const c of candidates) {
      const doc = normalizeDoc(c);
      const directHref = doc && hrefForDoc(doc);

      if (directHref) {
        out.push({ scope, doc: { ...doc, name: pickName(doc, directHref) } });
        continue;
      }

      // If it looks like a filename and we have a base CID, stitch it
      const maybeName =
        typeof c === 'string' ? c :
        (c && (c.path || c.filename || c.fileName || c.file || c.name)) ? (c.path || c.filename || c.fileName || c.file || c.name) : '';

      if (maybeName && baseCid) {
        const stitched = {
          cid: baseCid,
          ipfsPath: String(maybeName).startsWith('/') ? String(maybeName) : `/${String(maybeName)}`,
          name: pickName({ name: maybeName }),
        };
        const stitchedHref = hrefForDoc(stitched);
        if (stitchedHref) {
          out.push({ scope, doc: stitched });
          continue;
        }
      }
    }

    // 4) Also add single proof/proofCid reference if present (useful when it’s a file, not a folder)
    const proofRef = (typeof m.proof === 'string' && parseIpfsLike(m.proof)) || null;
    const singleCid = m.proofCid || m.folderCid || m.cid || (proofRef ? proofRef.cid : null);
    const singlePath = proofRef ? proofRef.path : '';
    if (singleCid) {
      const doc = { cid: singleCid, ipfsPath: singlePath, name: m.name ? `${m.name}` : `milestone-${idx + 1}` };
      const href = hrefForDoc(doc);
      if (href) out.push({ scope, doc });
    }
  });

  return out;
}

/* ------------------------------ UI mini helpers ------------------------------ */

function fmt(dt?: string | null) {
  if (!dt) return '';
  const d = new Date(dt);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
}
function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

type TabKey = 'overview' | 'milestones' | 'bids' | 'files';

/* -------------------------------- Component -------------------------------- */

export default function ProjectDetailPage() {
  const params = useParams();
  const projectIdNum = useMemo(() => Number((params as any)?.id), [params]);

  const [project, setProject] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ address?: string; role?: 'admin'|'vendor'|'guest' }>({ role: 'guest' });
  const [tab, setTab] = useState<TabKey>('overview');

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };

  // Fetch
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

  // Me
  useEffect(() => {
    getAuthRole().then(setMe).catch(() => {});
  }, []);

  // Poll while analyses run
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

  // Expose for quick console debugging
  useEffect(() => {
    if (typeof window !== 'undefined') (window as any).__BIDS = bids;
  }, [bids]);

  /* ---------------------------- Derived values ---------------------------- */

  const acceptedBid = bids.find((b) => b.status === 'approved') || null;
  const acceptedMs = parseMilestones(acceptedBid?.milestones);

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

  const projectDocs = parseDocs(project?.docs);

  // Files roll-up: proposal docs + bid docs + milestone files (deep-scan)
  const allFiles = useMemo(() => {
    const raw: Array<{ scope: string; doc: any }> = [
      ...(projectDocs || []).map((d: any) => ({ scope: 'Project', doc: d })),
      ...bids.flatMap((b: any) => {
        const docsArr = parseDocs(b.docs);
        const single = b.doc ? [b.doc] : [];
        const ds = [...docsArr, ...single].filter(Boolean);
        return ds.map((d: any) => ({
          scope: `Bid #${b.bidId}${b.vendorName ? ` — ${b.vendorName}` : ''}`,
          doc: d
        }));
      }),
      ...bids.flatMap((b: any) => collectMilestoneFiles(b)),
    ];

    const seen = new Set<string>();
    const out: Array<{ scope: string; doc: any; href: string }> = [];
    for (const item of raw) {
      const doc = normalizeDoc(item.doc);
      if (!doc) continue;
      const href = hrefForDoc(doc);
      if (!href) continue;
      const name = pickName(doc, href);
      const key = `${href}|${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ scope: item.scope, doc: { ...doc, name }, href });
    }

    if (typeof window !== 'undefined') (window as any).__FILES = out;
    return out;
  }, [projectDocs, bids]);

  // Quick stats
  const msTotal = acceptedMs.length;
  const msCompleted = acceptedMs.filter(m => m?.completed || m?.paymentTxHash).length;
  const msPaid = acceptedMs.filter(m => m?.paymentTxHash).length;

  const lastActivity = (() => {
    const dates: (string | undefined | null)[] = [project?.updatedAt, project?.createdAt];
    for (const b of bids) {
      dates.push(b?.createdAt, b?.updatedAt);
      const arr = parseMilestones(b?.milestones);
      for (const m of arr) { dates.push(m?.paymentDate, m?.completionDate, m?.dueDate); }
    }
    const valid = dates
      .filter(Boolean)
      .map((s) => new Date(String(s)))
      .filter((d) => !isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    return valid[0] ? valid[0].toLocaleString() : '—';
  })();

  /* --------------------------------- Render --------------------------------- */

  if (loading) return <div className="p-6">Loading project...</div>;
  if (!project) return <div className="p-6">Project not found</div>;

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
          <TabBtn id="milestones" label={`Milestones${acceptedMs.length ? ` (${msPaid}/${msTotal} paid)` : ''}`} tab={tab} setTab={setTab} />
          <TabBtn id="bids" label={`Bids (${bids.length})`} tab={tab} setTab={setTab} />
          <TabBtn id="files" label={`Files (${allFiles.length})`} tab={tab} setTab={setTab} />
        </div>
      </div>

      {/* Overview (minimal) */}
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
                <div key={`${f.scope}-${i}`}>
                  <div className="text-xs text-gray-600 mb-1">{f.scope}</div>
                  {renderAttachmentButton(f.doc, f.href)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No files yet.</p>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-gray-500">debug: show file URLs</summary>
            <ul className="mt-2 text-xs break-all space-y-1">
              {allFiles.map((f, i) => (<li key={i}>{f.href}</li>))}
            </ul>
          </details>
        </section>
      )}

      <div className="pt-2">
        <Link href="/projects" className="text-blue-600 hover:underline">← Back to Projects</Link>
      </div>
    </div>
  );
}

/* ---------------------------- Small UI components ---------------------------- */

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
      className={classNames('px-3 py-2 text-sm -mb-px border-b-2',
        active ? 'border-black text-black' : 'border-transparent text-slate-600 hover:text-black')}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

/* ----------------------------- File render helper ---------------------------- */

function renderAttachmentButton(docIn: any, hrefPre?: string) {
  const href = hrefPre || hrefForDoc(normalizeDoc(docIn));
  const name = pickName(docIn, href || undefined);

  if (!href) {
    return (
      <div className="p-2 rounded border bg-gray-50 text-xs text-gray-500">
        <p className="truncate">{name}</p>
        <p className="italic">No file link</p>
      </div>
    );
  }

  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(name) || /\.(png|jpe?g|gif|webp|svg)$/i.test(href);

  const open = () => {
    try { window.open(href, '_blank', 'noopener,noreferrer'); } catch {}
  };

  if (isImage) {
    return (
      <button type="button" onClick={open} title={name} className="group block overflow-hidden rounded border w-[96px] h-[96px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={name} className="h-24 w-24 object-cover group-hover:scale-105 transition" />
      </button>
    );
  }

  return (
    <div className="p-2 rounded border bg-gray-50 text-xs text-gray-700">
      <p className="truncate" title={name}>{name}</p>
      <button type="button" onClick={open} className="text-blue-600 hover:underline">Open</button>
    </div>
  );
}
