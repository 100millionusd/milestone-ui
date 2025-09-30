// src/app/projects/[id]/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids, getAuthRole } from '@/lib/api';
import AdminProofs from '@/components/AdminProofs';

/** ----------------------------- Config ----------------------------- */
const PINATA_GATEWAY =
  (process as any)?.env?.NEXT_PUBLIC_PINATA_GATEWAY ||
  (process as any)?.env?.NEXT_PUBLIC_IPFS_GATEWAY ||
  'https://gateway.pinata.cloud/ipfs';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** -------------------------- Helper Types -------------------------- */
type TabKey = 'overview' | 'timeline' | 'bids' | 'milestones' | 'files' | 'admin';

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
};

type ProofRow = {
  proposalId: number;
  milestoneIndex: number; // zero-based
  note?: string | null;
  files?: Array<{ url?: string | null; cid?: string | null; name?: string | null; path?: string | null }> | null;
};

/** --------------------------- Pure Helpers ------------------------- */
function coerceAnalysis(a: any): (AnalysisV2 & AnalysisV1) | null {
  if (!a) return null;
  if (typeof a === 'string') {
    try {
      return JSON.parse(a);
    } catch {
      return null;
    }
  }
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
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return [];
}

function fmt(dt?: string | null) {
  if (!dt) return '';
  const d = new Date(dt);
  return isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

const normalizeRole = (role: unknown): 'admin' | 'vendor' | 'guest' => {
  const r = String(role ?? '').toLowerCase();
  if (r.includes('admin')) return 'admin';
  if (r.includes('vendor')) return 'vendor';
  return 'guest';
};

const isAdminUser = (u: any): boolean => {
  if (!u) return false;
  if (u.isAdmin === true) return true;
  if (typeof u.role === 'string' && u.role.toLowerCase().includes('admin')) return true;
  if (typeof u.roleName === 'string' && u.roleName.toLowerCase().includes('admin')) return true;
  if (u.roleId === 1) return true;
  return false;
};

function buildHrefFromDoc(doc: any): string {
  const url = doc?.url;
  const cid = doc?.cid;
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
  if (typeof cid === 'string' && cid) return `${PINATA_GATEWAY}/${cid}`;
  return '#';
}

function isImageLikeName(nameOrUrl: string | undefined): boolean {
  if (!nameOrUrl) return false;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(nameOrUrl);
}

/** ----------------------------- Page ------------------------------- */
export default function ProjectDetailPage() {
  const params = useParams();
  const projectIdNum = Number((params as any)?.id);

  const [project, setProject] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<{ address?: string; role?: 'admin' | 'vendor' | 'guest' } | any>({ role: 'guest' });
  const [tab, setTab] = useState<TabKey>('overview');
  const [lightbox, setLightbox] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPoll = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  /** -------------------------- Initial fetch -------------------------- */
  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(projectIdNum)) return;
    (async () => {
      try {
        const [projectData, bidsData] = await Promise.all([
          getProposal(projectIdNum),
          getBids(projectIdNum),
        ]);
        if (!alive) return;
        setProject(projectData);
        setBids(bidsData);
      } catch (e) {
        console.error('Error fetching project/bids:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectIdNum]);

  /** --------------------------- Auth (role) --------------------------- */
  useEffect(() => {
    (async () => {
      try {
        const u = await getAuthRole();
        const asAdmin = isAdminUser(u);
        const normalized = { ...u, role: asAdmin ? 'admin' : normalizeRole(u?.role) };
        setMe(normalized);
        if (typeof window !== 'undefined') (window as any).__ME = { raw: u, normalized };
      } catch {
        // guest
      }
    })();
  }, []);

  /** ----------------------- Fetch proofs for project ------------------ */
  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(projectIdNum)) return;
    (async () => {
      try {
        const res = await fetch(`/api/proofs?proposalId=${encodeURIComponent(String(projectIdNum))}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`proofs ${res.status}`);
        const data = (await res.json()) as ProofRow[];
        if (!alive) return;
        setProofs(Array.isArray(data) ? data : []);
        if (typeof window !== 'undefined') (window as any).__PROOFS = data;
      } catch (e) {
        console.warn('/api/proofs failed', e);
        if (alive) setProofs([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [projectIdNum]);

  /** -------- Poll bids while analyses run (no conditional hooks) ------ */
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

  /** ---------------------- Derived values (variables) ------------------ */
  if (loading) return <div className="p-6">Loading project...</div>;
  if (!project) return <div className="p-6">Project not found</div>;

  const acceptedBid = bids.find((b) => b.status === 'approved') || null;
  const acceptedMs = parseMilestones(acceptedBid?.milestones);

  const isProjectCompleted = (proj: any): boolean => {
    if (!proj) return false;
    if (proj.status === 'completed') return true;
    if (!acceptedBid) return false;
    if (acceptedMs.length === 0) return false;
    return acceptedMs.every((m) => m?.completed === true || !!m?.paymentTxHash);
  };
  const completed = isProjectCompleted(project);

  const canEdit =
    isAdminUser(me) ||
    (!!project?.ownerWallet &&
      !!me?.address &&
      String(project.ownerWallet).toLowerCase() === String(me.address).toLowerCase());

  const projectDocs = parseDocs(project?.docs);

  const msTotal = acceptedMs.length;
  const msCompleted = acceptedMs.filter((m) => m?.completed || m?.paymentTxHash).length;
  const msPaid = acceptedMs.filter((m) => m?.paymentTxHash).length;

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
  if (project.updatedAt && project.updatedAt !== project.createdAt)
    timeline.push({ at: project.updatedAt, type: 'proposal_updated', label: 'Proposal updated' });
  for (const b of bids) {
    if (b.createdAt)
      timeline.push({
        at: b.createdAt,
        type: 'bid_submitted',
        label: `Bid submitted by ${b.vendorName}`,
        meta: `${currency.format(Number((b.priceUSD ?? b.priceUsd) || 0))}`,
      });
    if (b.status === 'approved' && b.updatedAt)
      timeline.push({ at: b.updatedAt, type: 'bid_approved', label: `Bid approved (${b.vendorName})` });
    const arr = parseMilestones(b.milestones);
    arr.forEach((m, idx) => {
      if (m.completionDate)
        timeline.push({
          at: m.completionDate,
          type: 'milestone_completed',
          label: `Milestone ${idx + 1} completed (${m.name || 'Untitled'})`,
        });
      if (m.paymentDate)
        timeline.push({
          at: m.paymentDate,
          type: 'milestone_paid',
          label: `Milestone ${idx + 1} paid`,
          meta: m.paymentTxHash ? `tx ${String(m.paymentTxHash).slice(0, 10)}…` : undefined,
        });
    });
  }
  timeline.sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());

  // From proofs API (per milestone)
  const proofFiles = proofs.flatMap((p) =>
    (p.files || []).map((f) => ({
      scope: `Milestone ${p.milestoneIndex + 1} proof`,
      doc: { url: f?.url ?? (f?.cid ? `${PINATA_GATEWAY}/${f.cid}` : null), name: f?.name || f?.path || undefined },
    })),
  );

  // Compose all files: Project docs + Bid docs + Proofs
  const allFiles =
    [
      ...(projectDocs || []).map((d) => ({ scope: 'Project', doc: d })),
      ...bids.flatMap((b) => {
        const ds = (b.docs || (b.doc ? [b.doc] : [])).filter(Boolean);
        return ds.map((d: any) => ({ scope: `Bid #${b.bidId} — ${b.vendorName || 'Vendor'}`, doc: d }));
      }),
      ...proofFiles,
    ].filter((f) => !!buildHrefFromDoc(f.doc) && buildHrefFromDoc(f.doc) !== '#') || [];

  if (typeof window !== 'undefined') {
    (window as any).__BIDS = bids;
    (window as any).__FILES = allFiles.map((f) => ({ scope: f.scope, href: buildHrefFromDoc(f.doc) }));
  }

  /** ------------------------------ Render ----------------------------- */
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
            <span
              className={cx(
                'px-2 py-0.5 text-xs font-medium rounded-full',
                completed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800',
              )}
            >
              {completed ? 'Completed' : 'Active'}
            </span>
          </div>
          <p className="text-gray-600">{project.orgName}</p>
          <div className="flex flex-wrap gap-4 mt-2 text-sm">
            <span>
              Budget: <b>{currency.format(Number(project.amountUSD || 0))}</b>
            </span>
            <span>
              Last activity: <b>{lastActivity}</b>
            </span>
            {acceptedBid && (
              <span>
                Awarded: <b>{currency.format(Number((acceptedBid.priceUSD ?? acceptedBid.priceUsd) || 0))}</b>
              </span>
            )}
          </div>
        </div>
        {!completed && (
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
          <TabBtn id="bids" label={`Bids (${bids.length})`} tab={tab} setTab={setTab} />
          <TabBtn id="milestones" label={`Milestones${msTotal ? ` (${msPaid}/${msTotal} paid)` : ''}`} tab={tab} setTab={setTab} />
          <TabBtn id="files" label={`Files (${allFiles.length})`} tab={tab} setTab={setTab} />
          {isAdminUser(me) && <TabBtn id="admin" label="Admin" tab={tab} setTab={setTab} />}
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
                  {timeline
                    .slice(-5)
                    .reverse()
                    .map((e, i) => (
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
                    <span
                      className={cx(
                        'px-2 py-1 rounded text-xs',
                        b.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : b.status === 'rejected'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800',
                      )}
                    >
                      {b.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No bids yet.</p>
            )}
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
                    <div className="opacity-70">
                      {fmt(e.at)} {e.meta ? `• ${e.meta}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500">No activity yet.</p>
          )}
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
          ) : (
            <p className="text-sm text-gray-500">No bids yet.</p>
          )}
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
                      <td className="py-2 pr-4">M{idx + 1}</td>
                      <td className="py-2 pr-4">{m.name || '—'}</td>
                      <td className="py-2 pr-4">{m.amount ? currency.format(Number(m.amount)) : '—'}</td>
                      <td className="py-2 pr-4">{paid ? 'paid' : completedRow ? 'completed' : 'pending'}</td>
                      <td className="py-2 pr-4">{fmt(m.completionDate) || '—'}</td>
                      <td className="py-2 pr-4">{fmt(m.paymentDate) || '—'}</td>
                      <td className="py-2 pr-4">{m.paymentTxHash ? `${String(m.paymentTxHash).slice(0, 10)}…` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">{acceptedBid ? 'No milestones defined for the accepted bid.' : 'No accepted bid yet.'}</p>
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
                <div key={`${f.scope}-${i}`} className="border rounded p-2">
                  <div className="text-xs text-gray-600 mb-1 truncate" title={f.scope}>
                    {f.scope}
                  </div>
                  {renderAttachment(f.doc, i, setLightbox)}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No files yet.</p>
          )}
        </section>
      )}

      {/* Admin */}
      {tab === 'admin' && isAdminUser(me) && (
        <section className="border rounded p-4">
          <h3 className="font-semibold mb-3">Admin — Proofs & Moderation</h3>
          <p className="text-sm text-gray-600 mb-4">Review vendor proofs per milestone, approve/reject, then refresh.</p>
          {/* Adjust props based on your AdminProofs component signature */}
          <AdminProofs proposalId={projectIdNum} />
        </section>
      )}

      {/* Back link */}
      <div className="pt-2">
        <Link href="/projects" className="text-blue-600 hover:underline">
          ← Back to Projects
        </Link>
      </div>

      {/* Lightbox */}
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
          <button className="absolute top-4 right-4 text-white text-2xl" onClick={() => setLightbox(null)}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

/** ------------------------- Small components ------------------------ */
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
      className={cx('px-3 py-2 text-sm -mb-px border-b-2', active ? 'border-black text-black' : 'border-transparent text-slate-600 hover:text-black')}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function renderAttachment(doc: any, idx: number, setLightbox: (url: string | null) => void) {
  if (!doc) return null;
  const href = buildHrefFromDoc(doc);
  const label = doc?.name || doc?.path || href;
  const isImage = isImageLikeName(doc?.name) || isImageLikeName(href);

  if (isImage) {
    return (
      <div className="group">
        <button
          onClick={() => setLightbox(href)}
          className="relative overflow-hidden rounded border block w-full"
          title={label}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={href} alt={label} className="h-28 w-full object-cover group-hover:scale-105 transition" />
        </button>
        <div className="mt-1 flex items-center justify-between">
          <span className="truncate text-xs" title={label}>
            {label}
          </span>
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
            Open
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 rounded border bg-gray-50 text-xs text-gray-700">
      <p className="truncate" title={label}>
        {label}
      </p>
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
        Open
      </a>
    </div>
  );
}
