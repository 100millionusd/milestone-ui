// src/app/admin/bids/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as api from '@/lib/api';
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

  // who am I (gate admin-only edit controls)
  const [me, setMe] = useState<{ address?: string; role?: 'admin'|'vendor'|'guest' }>({ role: 'guest' });

  // per-proof prompt + busy state
  const [promptById, setPromptById] = useState<Record<number, string>>({});
  const [busyById, setBusyById] = useState<Record<number, boolean>>({});

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

  // SAVE milestones to API and refresh local state
  async function saveMilestones(next: any[]) {
    try {
      const updated = await api.updateBid(bidId, { milestones: next });
      setBid(updated); // replace entire bid from server to stay in sync
    } catch (e: any) {
      alert(e?.message || 'Failed to save milestones');
      try { const fresh = await api.getBid(bidId); setBid(fresh); } catch {}
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

        {/* Admin-only quick edits */}
        {me.role === 'admin' && (
          <div className="mt-4 p-3 rounded-lg bg-slate-50 border">
            <div className="text-sm font-semibold mb-3">Admin: Quick Edit</div>
            <AdminBidEditor bid={bid} onUpdated={setBid} />
          </div>
        )}

        {/* Milestones (click to edit) */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm text-gray-500">Milestones</div>
            {me.role === 'admin' && (
              <button
                className="text-xs px-2 py-1 rounded bg-slate-200"
                onClick={() => {
                  const next = [
                    ...ms,
                    { name: `Milestone ${ms.length + 1}`, amount: 0, dueDate: '', completed: false, proof: '' },
                  ];
                  saveMilestones(next);
                }}
              >
                + Add
              </button>
            )}
          </div>

          <ul className="space-y-2">
            {ms.length === 0 && <li className="text-sm text-slate-500">No milestones.</li>}

            {ms.map((m: any, i: number) => (
              <MilestoneController
                key={i}
                m={m}
                index={i}
                canEdit={me.role === 'admin'}
                all={ms}
                saveMilestones={saveMilestones}
              />
            ))}
          </ul>
        </div>
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

        {proofs.map((p) => {
          const id = Number(p.proofId ?? p.id);
          const a = p.aiAnalysis ?? p.ai_analysis;

          return (
            <div key={id} className="rounded-lg border border-slate-200 p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {p.title || `Proof #${id}`} · Milestone {Number(p.milestoneIndex ?? p.milestone_index) + 1}
                </div>
                <span
                  className={`text-xs rounded px-2 py-0.5 border ${
                    p.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : p.status === 'rejected'
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                  }`}
                >
                  {p.status}
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

/** Admin inline editor for stablecoin, price, days, notes */
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
      onUpdated(updated);
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

/** A single milestone row that toggles into edit mode when clicked */
function MilestoneRow({
  m,
  i,
  canEdit,
  onChange,
  onSave,
  onCancel,
  isEditing,
  setEditing,
}: {
  m: any;
  i: number;
  canEdit: boolean;
  isEditing: boolean;
  setEditing: (v: boolean) => void;
  onChange: (next: any) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState<any>(m);

  // keep local in sync if prop changes while not editing
  useEffect(() => { if (!isEditing) setLocal(m); }, [m, isEditing]);

  if (!canEdit || !isEditing) {
    return (
      <li
        className={`rounded border p-3 ${canEdit ? 'cursor-pointer hover:bg-slate-50' : ''}`}
        onClick={() => canEdit && setEditing(true)}
        title={canEdit ? 'Click to edit' : ''}
      >
        <div className="flex items-center justify-between">
          <div className="font-medium">{m.name || `Milestone ${i + 1}`}</div>
          <span className="text-xs text-gray-500">#{i + 1}</span>
        </div>
        <div className="text-sm text-gray-600">
          Amount: ${m.amount} · Due: {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : '—'}
          {m.completed ? ' · Completed' : ''}
        </div>
        {m.proof && <div className="mt-1 text-xs text-gray-500 line-clamp-2">Proof: {m.proof}</div>}
      </li>
    );
  }

  // edit mode
  return (
    <li className="rounded border p-3 bg-slate-50">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <label className="min-w-24 text-sm text-gray-600">Name</label>
          <input
            className="border rounded px-2 py-1 text-sm w-full"
            value={local.name || ''}
            onChange={(e) => setLocal((p: any) => ({ ...p, name: e.target.value }))}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="min-w-24 text-sm text-gray-600">Amount (USD)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className="border rounded px-2 py-1 text-sm w-40"
            value={local.amount ?? ''}
            onChange={(e) => setLocal((p: any) => ({ ...p, amount: e.target.value === '' ? '' : Number(e.target.value) }))}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="min-w-24 text-sm text-gray-600">Due date</label>
          <input
            type="date"
            className="border rounded px-2 py-1 text-sm"
            value={local.dueDate ? toDateInput(local.dueDate) : ''}
            onChange={(e) => setLocal((p: any) => ({ ...p, dueDate: e.target.value ? `${e.target.value}T00:00:00.000Z` : '' }))}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!local.completed}
            onChange={(e) => setLocal((p: any) => ({ ...p, completed: e.target.checked }))}
          />
          Completed
        </label>

        <div className="sm:col-span-2">
          <label className="block text-sm text-gray-600 mb-1">Proof (optional)</label>
          <textarea
            rows={2}
            className="w-full border rounded px-2 py-1 text-sm"
            value={local.proof || ''}
            onChange={(e) => setLocal((p: any) => ({ ...p, proof: e.target.value }))}
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          className="px-3 py-1.5 rounded bg-slate-900 text-white"
          onClick={() => { onChange(local); onSave(); }}
        >
          Save
        </button>
        <button className="px-3 py-1.5 rounded bg-slate-200" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </li>
  );
}

function toDateInput(val: string | Date) {
  try {
    const d = new Date(val);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch { return ''; }
}

function MilestoneController({
  m, index, canEdit, all, saveMilestones,
}: {
  m: any;
  index: number;
  canEdit: boolean;
  all: any[];
  saveMilestones: (next: any[]) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(m);

  useEffect(() => { if (!editing) setDraft(m); }, [m, editing]);

  const onChange = (nextOne: any) => setDraft(nextOne);

  const onSave = async () => {
    const amt = Number(draft.amount);
    if (!Number.isFinite(amt) || amt < 0) { alert('Amount must be a non-negative number'); return; }

    const copy = all.map((x, idx) => (idx === index ? { ...draft, amount: amt } : x));
    await saveMilestones(copy);
    setEditing(false);
  };

  const onCancel = () => { setDraft(m); setEditing(false); };

  return (
    <MilestoneRow
      m={m}
      i={index}
      canEdit={canEdit}
      isEditing={editing}
      setEditing={setEditing}
      onChange={onChange}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}
