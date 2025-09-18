'use client';
import React, { useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

type Role = 'admin' | 'vendor' | 'guest';

interface Props {
  bidId: number;
  analysis?: any;
  role?: Role;
  /** Optional explicit override. If omitted, we allow admin or vendor (owner) by default. */
  canRun?: boolean;
  onAfter?: (updatedBid: any) => void;
}

export default function Agent2PromptBox({ bidId, analysis, role, canRun, onAfter }: Props) {
  const { role: ctxRole } = useWeb3Auth();
  const effectiveRole: Role = (role ?? ctxRole ?? 'guest') as Role;

  const [prompt, setPrompt] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [localAnalysis, setLocalAnalysis] = useState<any>(analysis ?? null);
  useEffect(() => setLocalAnalysis(analysis ?? null), [analysis]);

  // Default permission: admins and vendors can run; allow override via prop
  const allowRun = (typeof canRun === 'boolean')
    ? canRun
    : (effectiveRole === 'admin' || effectiveRole === 'vendor');

  const prettyConfidence = useMemo(() => {
    const c = Number(localAnalysis?.confidence);
    if (!Number.isFinite(c)) return null;
    const pct = Math.round(Math.max(0, Math.min(1, c)) * 100);
    return `${pct}%`;
  }, [localAnalysis]);

  async function run() {
    if (!bidId) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await api.analyzeBid(bidId, prompt?.trim() || undefined);
      setLocalAnalysis(updated?.aiAnalysis ?? null);
      onAfter?.(updated);
    } catch (e: any) {
      setErr(String(e?.message ?? e ?? 'Failed to run Agent2'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 p-4 bg-white shadow-sm">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-slate-900 text-white grid place-items-center text-xs font-bold">A2</div>
          <h3 className="font-semibold">Agent 2 Analysis</h3>
        </div>
        <RoleBadge role={effectiveRole} />
      </header>

      {localAnalysis ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              Fit:{' '}
              <b className={fitColor(localAnalysis?.fit)}>
                {String(localAnalysis?.fit ?? '').toLowerCase() || '—'}
              </b>
            </span>
            <span>Confidence: <b>{prettyConfidence ?? '—'}</b></span>
            {localAnalysis?.pdfUsed !== undefined && (
              <span className="text-slate-500">
                PDF parsed: <b>{localAnalysis.pdfUsed ? 'Yes' : 'No'}</b>
              </span>
            )}
          </div>

          {localAnalysis?.summary && (
            <div>
              <div className="text-sm font-semibold mb-1">Summary</div>
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {localAnalysis.summary}
              </p>
            </div>
          )}

          {Array.isArray(localAnalysis?.risks) && localAnalysis.risks.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-1">Risks</div>
              <ul className="list-disc list-inside text-sm space-y-1">
                {localAnalysis.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          {Array.isArray(localAnalysis?.milestoneNotes) && localAnalysis.milestoneNotes.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-1">Milestone Notes</div>
              <ul className="list-disc list-inside text-sm space-y-1">
                {localAnalysis.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">
          No Agent 2 analysis available yet for this bid.
        </p>
      )}

      {/* Prompt UI — visible if allowRun */}
      {allowRun && (
        <div className="mt-5">
          <div className="font-semibold mb-2">Custom Prompt</div>
          <textarea
            className="w-full min-h-28 rounded-lg border p-3 text-sm"
            placeholder={`Optional. Use {{CONTEXT}} to inject bid + proposal + PDF text.\nExample:\n"Rewrite the summary in Spanish. Keep it concise. {{CONTEXT}}"\n(Leave blank for the default prompt)`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={run}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
            >
              {busy ? 'Analyzing…' : 'Run Agent 2'}
            </button>
            {err && <span className="text-sm text-rose-700">{err}</span>}
          </div>
        </div>
      )}
    </section>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const theme =
    role === 'admin'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : role === 'vendor'
      ? 'bg-cyan-100 text-cyan-800 border-cyan-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';
  return <span className={`text-xs px-2 py-1 rounded-md border ${theme}`}>{role.toUpperCase()}</span>;
}

function fitColor(fit?: string) {
  const f = String(fit || '').toLowerCase();
  if (f === 'high') return 'text-emerald-700';
  if (f === 'medium') return 'text-amber-700';
  if (f === 'low') return 'text-rose-700';
  return 'text-slate-600';
}
