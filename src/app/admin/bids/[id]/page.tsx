// src/app/admin/bids/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as api from '@/lib/api';
import { API_BASE } from '@/lib/api';
import Agent2Inline from '@/components/Agent2Inline';
import BidChatAgent from '@/components/BidChatAgent';

export default function AdminBidDetailPage(props: { params?: { id: string } }) {
  const routeParams = useParams();
  const bidId = Number((props.params as any)?.id ?? (routeParams as any)?.id);

  const [loading, setLoading] = useState(true);
  const [bid, setBid] = useState<any>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [proofs, setProofs] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [actedByIdx, setActedByIdx] = useState<Record<number, 'approved' | 'rejected'>>({});
  const [lockByIdx, setLockByIdx] = useState<Record<number, boolean>>({});

  // who am I (gate admin-only edit controls)
  const [me, setMe] = useState<{ address?: string; role?: 'admin'|'vendor'|'guest' }>({ role: 'guest' });

 // per-proof prompt + busy state
const [promptById, setPromptById] = useState<Record<number, string>>({});
const [busyById, setBusyById] = useState<Record<number, boolean>>({});
const [proofStatusByIdx, setProofStatusByIdx] = useState<Record<number, string>>({});

// latest proof_id per milestone (by max id — single source of truth)
const latestIdByIdx = useMemo(() => {
  const ids: Record<number, number> = {};
  for (const p of proofs) {
    const idx = Number(p.milestoneIndex ?? p.milestone_index);
    const pid = Number(p.proofId ?? p.id ?? 0);
    if (!Number.isFinite(idx) || !Number.isFinite(pid)) continue;
    if (!ids[idx] || pid > ids[idx]) ids[idx] = pid;
  }
  return ids;
}, [proofs]);

// fallback latest *status* per milestone (by max id)
const fallbackLatestByIdx = useMemo(() => {
  const out: Record<number, string> = {};
  const ids: Record<number, number> = {};
  for (const p of proofs) {
    const idx = Number(p.milestoneIndex ?? p.milestone_index);
    const pid = Number(p.proofId ?? p.id ?? 0);
    if (!Number.isFinite(idx) || !Number.isFinite(pid)) continue;
    if (!ids[idx] || pid > ids[idx]) {
      ids[idx] = pid;
      out[idx] = String(p.status || 'pending');
    }
  }
  return out;
}, [proofs]);

// only show the latest proof card per milestone in the UI
const visibleProofs = useMemo(() => {
  const keep = new Set<number>(Object.values(latestIdByIdx));
  return proofs.filter(p => keep.has(Number(p.proofId ?? p.id)));
}, [proofs, latestIdByIdx]);

  // chat modal state (bid-level; opened from header or any proof)
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // load role early to gate UI
        api.getAuthRole().then(setMe).catch(() => {});

        const b = await api.getBid(bidId);
        setBid(b);

        const p = await api.getProposal(b.proposalId);
        setProposal(p);

        const pf = await api.getProofs(bidId); // admin-only
        setProofs(pf);
      } catch (e: any) {
        setErr(e?.message || 'Failed to load bid');
      } finally {
        setLoading(false);
      }
    })();
  }, [bidId]);

  useEffect(() => {
  if (!bidId) return;
  (async () => {
    try {
      const r = await fetch(
        `${API_BASE}/bids/${bidId}/proofs/latest-status`,
        { credentials: 'include', cache: 'no-store' } // prevent stale cache
      );
      const j = await r.json();
      setProofStatusByIdx(j?.byIndex || {});
    } catch (e) {
      console.warn('latest-status fetch failed', e);
      setProofStatusByIdx({});
    }
  })();
}, [bidId]);

// hydrate reject locks from localStorage so buttons stay disabled after refresh/navigation
useEffect(() => {
  if (!bidId) return;
  try {
    const next: Record<number, boolean> = {};
    for (const p of proofs) {
      const idx = Number(p.milestoneIndex ?? p.milestone_index);
      if (typeof window !== 'undefined' &&
          localStorage.getItem(`rej:${bidId}:${idx}`) === '1') {
        next[idx] = true;
      }
    }
    setLockByIdx(next);
  } catch { /* ignore */ }
}, [bidId, proofs]);

  async function runProofAnalysis(proofId: number) {
    try {
      setBusyById((prev) => ({ ...prev, [proofId]: true }));
      const prompt = promptById[proofId] || '';
      const updated = await api.analyzeProof(proofId, prompt || undefined);
      setProofs((prev) =>
        prev.map((p) => (Number(p.proofId ?? p.id) === proofId ? updated : p))
      );
    } catch (e: any) {
      alert(e?.message || 'Failed to run Agent 2 on proof');
    } finally {
      setBusyById((prev) => ({ ...prev, [proofId]: false }));
    }
  }

  // refresh latest map (used after actions)
async function refreshLatest() {
  if (!bidId) return;
  try {
    const r = await fetch(
      `${API_BASE}/bids/${bidId}/proofs/latest-status`,
      { credentials: 'include', cache: 'no-store' }
    );
    const j = await r.json();
    setProofStatusByIdx(j?.byIndex || {});
  } catch { /* ignore */ }
}

// one-shot reject; disables button + persists lock
async function onRejectOnce(idx: number) {
  // Check server status first - if already rejected, just lock locally
  const currentStatus = proofStatusByIdx[idx] ?? fallbackLatestByIdx[idx];
  if (currentStatus === 'rejected') {
    setActedByIdx(prev => ({ ...prev, [idx]: 'rejected' }));
    setLockByIdx(prev => ({ ...prev, [idx]: true }));
    if (typeof window !== 'undefined') {
      localStorage.setItem(`rej:${bidId}:${idx}`, '1');
    }
    return;
  }

  // already locked in this session? bail.
  if (actedByIdx[idx] === 'rejected' || lockByIdx[idx]) return;
  
  try {
    await rejectProof(bidId, idx);
    setActedByIdx(prev => ({ ...prev, [idx]: 'rejected' }));
    setLockByIdx(prev => ({ ...prev, [idx]: true }));
    if (typeof window !== 'undefined') {
      localStorage.setItem(`rej:${bidId}:${idx}`, '1');
    }
    await refreshLatest();
  } catch {
    // even if server says already rejected, lock locally
    setActedByIdx(prev => ({ ...prev, [idx]: 'rejected' }));
    setLockByIdx(prev => ({ ...prev, [idx]: true }));
    if (typeof window !== 'undefined') {
      localStorage.setItem(`rej:${bidId}:${idx}`, '1');
    }
    await refreshLatest();
  }
}

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Bid #{bidId}</h1>
          <Link href="/admin/bids" className="underline">← Back</Link>
        </div>
        <div className="py-20 text-center text-gray-500">Loading…</div>
      </main>
    );
  }

  if (err || !bid) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Bid #{bidId}</h1>
          <Link href="/admin/bids" className="underline">← Back</Link>
        </div>
        <div className="p-4 rounded border bg-rose-50 text-rose-700">{err || 'Bid not found'}</div>
      </main>
    );
  }

  const ms = Array.isArray(bid.milestones) ? bid.milestones : [];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bid #{bidId}</h1>
        <div className="flex items-center gap-2">
          {/* Global bid-level chat button */}
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white"
            title="Ask Agent 2 about this bid"
          >
            Ask Agent 2 (Chat)
          </button>
          <Link href="/admin/bids" className="underline">← Back</Link>
        </div>
      </div>

      {/* Bid summary */}
      <section className="rounded border p-4 bg-white">
        <div className="grid sm:grid-cols-2 gap-4">
          <Info label="Project" value={`#${bid.proposalId}`} />
          <Info label="Vendor" value={bid.vendorName} />
          <Info
            label="Price"
            value={`$${Number(bid.priceUSD).toLocaleString()} ${bid.preferredStablecoin}`}
          />
          <Info label="Timeline" value={`${bid.days} days`} />
          <div className="sm:col-span-2">
            <div className="text-sm text-gray-500">Notes</div>
            <div className="font-medium whitespace-pre-wrap">{bid.notes || '—'}</div>
          </div>
        </div>

        {/* Admin-only quick edits (non-milestone fields) */}
        {me.role === 'admin' && (
          <div className="mt-4 p-3 rounded-lg bg-slate-50 border">
            <div className="text-sm font-semibold mb-3">Admin: Quick Edit</div>
            <AdminBidEditor bid={bid} onUpdated={setBid} />
          </div>
        )}

        {/* Milestones */}
        <MilestonesSection
          bid={bid}
          canEdit={me.role === 'admin'}
          onUpdated={(updatedBid) => setBid(updatedBid)}
        />
      </section>

      {/* Agent 2 — inline analysis + run */}
      {proposal && (
        <section className="rounded border p-4 bg-white">
          <Agent2Inline bid={bid} proposal={proposal as any} />
        </section>
      )}

      {/* Proofs for this bid */}
      <section className="rounded border p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Submitted Proofs</h2>
          <Link
            href={`/proposals/${bid.proposalId}/edit`}
            className="px-3 py-1 rounded bg-indigo-600 text-white text-xs"
          >
            Edit Proposal
          </Link>
        </div>

        {proofs.length === 0 && (
          <div className="text-sm text-slate-500">No proofs submitted yet.</div>
        )}

        {visibleProofs.map((p) => {
  const id = Number(p.proofId ?? p.id);
  const a = p.aiAnalysis ?? p.ai_analysis;
  const idx = Number(p.milestoneIndex ?? p.milestone_index);
  const latestStatus = proofStatusByIdx[idx] ?? fallbackLatestByIdx[idx] ?? p.status;
  const canReview = latestStatus === 'pending';
  const rejectLocked = 
    !!lockByIdx[idx] || 
    actedByIdx[idx] === 'rejected' || 
    latestStatus !== 'pending' || 
    latestStatus === 'rejected';
  const isLatestCard = id === latestIdByIdx[idx]; 

          return (
            <div key={id} className="rounded-lg border border-slate-200 p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {p.title || `Proof #${id}`} · Milestone {Number(p.milestoneIndex ?? p.milestone_index) + 1}
                </div>
                <span
                  className={`text-xs rounded px-2 py-0.5 border ${
                    latestStatus === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : latestStatus === 'rejected'
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  {latestStatus}
                </span>
              </div>

              {p.description && (
                <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{p.description}</p>
              )}

              {Array.isArray(p.files) && p.files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {p.files.map((f: any, i: number) => (
                    <li key={i} className="text-sm">
                      <a className="text-blue-600 hover:underline" href={f.url} target="_blank" rel="noreferrer">
                        {f.name || f.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 rounded-md bg-slate-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Agent 2 Analysis</div>
                  {/* Per-proof chat opens the same bid-level chat modal */}
                  <button
                    type="button"
                    onClick={() => setChatOpen(true)}
                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white"
                    title="Ask Agent 2 about this bid/proof"
                  >
                    Ask Agent 2 (Chat)
                  </button>
                </div>
                {/* Actions — only show on the latest card, when status is pending, and not locally locked */}
{(isLatestCard && canReview && !rejectLocked) ? (
  <div className="mt-3 flex gap-2">
    <button
      className="px-4 py-2 rounded bg-amber-500 text-white"
      onClick={async () => { await approveProof(bidId, idx); await refreshLatest(); }}
    >
      Approve Proof
    </button>
    <button
      className="px-4 py-2 rounded bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
      onClick={() => onRejectOnce(idx)}
      disabled={rejectLocked}
      aria-disabled={rejectLocked}
      title={rejectLocked ? 'Already rejected' : 'Reject'}
    >
      {rejectLocked ? 'Rejected' : 'Reject'}
    </button>
  </div>
) : (
  <div className="mt-2 text-xs text-slate-500">
    Latest proof is <span className="font-medium">{latestStatus}</span>.
    {latestStatus === 'rejected' && ' This proof has been rejected.'}
  </div>
)}


                {a ? <AnalysisView a={a} /> : <div className="text-sm text-slate-600">No analysis yet for this proof.</div>}

                <div className="mt-3">
                  <textarea
                    value={promptById[id] || ''}
                    onChange={(e) => setPromptById((prev) => ({ ...prev, [id]: e.target.value }))}
                    className="w-full p-2 rounded border"
                    rows={3}
                    placeholder="Optional: add a prompt to re-run Agent 2 for this proof"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => runProofAnalysis(id)}
                      disabled={!!busyById[id]}
                      className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
                    >
                      {busyById[id] ? 'Analyzing…' : 'Run Agent 2'}
                    </button>
                    {/* Secondary chat entry point beside the rerun button */}
                    <button
                      type="button"
                      onClick={() => setChatOpen(true)}
                      className="px-3 py-2 rounded-lg bg-blue-600 text-white"
                    >
                      Ask Agent 2 (Chat)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* One chat modal for the whole page */}
      <BidChatAgent
        bidId={bidId}
        proposal={proposal}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function AnalysisView({ a }: { a: any }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {'fit' in a && (
          <span>
            Fit: <b className={fitColor(a.fit)}>{String(a.fit || '').toLowerCase() || '—'}</b>
          </span>
        )}
        {'confidence' in a && (
          <span>Confidence: <b>{Math.round((a.confidence ?? 0) * 100)}%</b></span>
        )}
        {'pdfUsed' in a && (
          <span className="text-slate-500">PDF parsed: <b>{a.pdfUsed ? 'Yes' : 'No'}</b></span>
        )}
      </div>

      {a.summary && (
        <div>
          <div className="text-sm font-semibold mb-1">Summary</div>
          <p className="whitespace-pre-line text-sm leading-relaxed">{a.summary}</p>
        </div>
      )}

      {Array.isArray(a.risks) && a.risks.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1">Risks</div>
          <ul className="list-disc list-inside text-sm space-y-1">
            {a.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {Array.isArray(a.milestoneNotes) && a.milestoneNotes.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1">Milestone Notes</div>
          <ul className="list-disc list-inside text-sm space-y-1">
            {a.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function fitColor(fit?: string) {
  const f = String(fit || '').toLowerCase();
  if (f === 'high') return 'text-emerald-700';
  if (f === 'medium') return 'text-amber-700';
  if (f === 'low') return 'text-rose-700';
  return 'text-slate-600';
}

/** Admin inline editor for stablecoin, price, days, notes (NOT milestones) */
function AdminBidEditor({ bid, onUpdated }: { bid: any; onUpdated: (b:any)=>void }) {
  const [coin, setCoin]   = useState<'USDC'|'USDT'>(bid.preferredStablecoin || 'USDC');
  const [price, setPrice] = useState<string>(String(bid.priceUSD ?? ''));
  const [days, setDays]   = useState<string>(String(bid.days ?? ''));
  const [notes, setNotes] = useState<string>(bid.notes || '');
  const [saving, setSaving] = useState(false);

  const dirty =
    coin !== (bid.preferredStablecoin || 'USDC') ||
    Number(price) !== Number(bid.priceUSD) ||
    Number(days) !== Number(bid.days) ||
    String(notes || '') !== String(bid.notes || '');

  async function save() {
    const parsedPrice = Number(price);
    const parsedDays  = Number(days);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      alert('Price must be a non-negative number'); return;
    }
    if (!Number.isFinite(parsedDays) || parsedDays < 0) {
      alert('Days must be a non-negative number'); return;
    }

    setSaving(true);
    try {
      const patch: any = {
        preferredStablecoin: coin,
        priceUSD: parsedPrice,
        days: parsedDays,
        notes,
      };
      const updated = await api.updateBid(bid.bidId, patch);
      onUpdated((prev:any) => ({
        ...prev,
        preferredStablecoin: updated.preferredStablecoin,
        priceUSD: updated.priceUSD,
        days: updated.days,
        notes: updated.notes,
      }));
    } catch (e:any) {
      alert(e?.message || 'Failed to update bid');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Stablecoin</label>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={coin}
          onChange={(e) => setCoin(e.target.value as 'USDC'|'USDT')}
        >
          <option value="USDC">USDC</option>
          <option value="USDT">USDT</option>
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Price (USD)</label>
        <input
          type="number"
          className="border rounded px-2 py-1 text-sm w-40"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          min={0}
          step="0.01"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Days</label>
        <input
          type="number"
          className="border rounded px-2 py-1 text-sm w-32"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          min={0}
          step="1"
        />
      </div>

      <div className="sm:col-span-2">
        <label className="block text-sm text-gray-600 mb-1">Notes</label>
        <textarea
          className="w-full border rounded px-2 py-1 text-sm"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="sm:col-span-2 flex gap-2">
        <button
          className="px-3 py-1.5 rounded bg-slate-900 text-white disabled:opacity-50"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          className="px-3 py-1.5 rounded bg-slate-200"
          onClick={() => {
            setCoin(bid.preferredStablecoin || 'USDC');
            setPrice(String(bid.priceUSD ?? ''));
            setDays(String(bid.days ?? ''));
            setNotes(bid.notes || '');
          }}
          disabled={saving}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

/** Milestones section with click-to-edit rows */
function MilestonesSection({
  bid,
  canEdit,
  onUpdated,
}: {
  bid: any;
  canEdit: boolean;
  onUpdated: (b:any)=>void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const milestones = useMemo(() => (Array.isArray(bid.milestones) ? bid.milestones : []), [bid?.milestones]);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm text-gray-500">Milestones</div>
        {canEdit && editingIndex !== null && (
          <button
            className="text-xs underline"
            onClick={() => setEditingIndex(null)}
          >
            Cancel edit
          </button>
        )}
      </div>

      {milestones.length === 0 ? (
        <div className="text-sm text-slate-500">No milestones.</div>
      ) : (
        <ul className="space-y-2">
          {milestones.map((m: any, i: number) => (
            <li key={i} className="rounded border p-3">
              {canEdit && editingIndex === i ? (
                <MilestoneRowEditor
                  bidId={bid.bidId}
                  index={i}
                  value={m}
                  all={milestones}
                  onDone={(updated) => { onUpdated(updated); setEditingIndex(null); }}
                  onCancel={() => setEditingIndex(null)}
                />
              ) : (
                <MilestoneRowDisplay
                  m={m}
                  index={i}
                  canEdit={canEdit}
                  onEdit={() => canEdit && setEditingIndex(i)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MilestoneRowDisplay({
  m, index, canEdit, onEdit,
}: {
  m: any; index: number; canEdit: boolean; onEdit: ()=>void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-medium">
          {m.name || `Milestone ${index + 1}`}
          {m.completed ? ' · ✅ Completed' : ''}
        </div>
        <div className="text-sm text-gray-600">
          Amount: ${Number(m.amount).toLocaleString()} · Due: {dateDisplay(m.dueDate)}
        </div>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="text-xs px-2 py-1 rounded bg-slate-900 text-white"
          title="Edit milestone"
        >
          Edit
        </button>
      )}
    </div>
  );
}

function MilestoneRowEditor({
  bidId, index, value, all, onDone, onCancel,
}: {
  bidId: number;
  index: number;
  value: any;
  all: any[];
  onDone: (updatedBid:any)=>void;
  onCancel: ()=>void;
}) {
  const [name, setName] = useState<string>(value?.name || `Milestone ${index + 1}`);
  const [amount, setAmount] = useState<string>(String(value?.amount ?? '0'));
  const [due, setDue] = useState<string>(toDateInput(value?.dueDate));
  const [completed, setCompleted] = useState<boolean>(!!value?.completed);
  const [saving, setSaving] = useState(false);

  async function save() {
    // Validate
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 0) { alert('Amount must be a non-negative number'); return; }
    if (!due) { alert('Due date is required'); return; }

    // Build new milestones array
    const next = all.map((m, i) => i === index
      ? {
          ...m,
          name: name || `Milestone ${index + 1}`,
          amount: amt,
          dueDate: new Date(due).toISOString(),
          completed,
        }
      : m
    );

    setSaving(true);
    try {
      // Persist via dedicated endpoint
      const updated = await api.updateBidMilestones(bidId, next);
      onDone(updated);
    } catch (e:any) {
      alert(e?.message || 'Failed to update milestone');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Name</label>
        <input
          className="border rounded px-2 py-1 text-sm w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Milestone ${index + 1}`}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Amount (USD)</label>
        <input
          type="number"
          className="border rounded px-2 py-1 text-sm w-40"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={0}
          step="0.01"
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Due Date</label>
        <input
          type="date"
          className="border rounded px-2 py-1 text-sm w-48"
          value={due}
          onChange={(e) => setDue(e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600 min-w-24">Completed</label>
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={completed}
          onChange={(e) => setCompleted(e.target.checked)}
        />
      </div>

      <div className="sm:col-span-2 flex gap-2">
        <button
          className="px-3 py-1.5 rounded bg-slate-900 text-white disabled:opacity-50"
          onClick={save}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save milestone'}
        </button>
        <button
          className="px-3 py-1.5 rounded bg-slate-200"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function dateDisplay(d: any) {
  try { return new Date(d).toLocaleDateString(); } catch { return '—'; }
}

function toDateInput(d: any) {
  try {
    const dt = new Date(d);
    if (Number.isNaN(+dt)) return '';
    // yyyy-mm-dd
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return ''; }
}