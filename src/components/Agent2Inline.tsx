// src/components/Agent2Inline.tsx
'use client';

import React, { useCallback, useMemo, useState } from 'react';
import * as api from '@/lib/api';
import BidChatAgent from '@/components/BidChatAgent';

type Bid = api.Bid;

function coerce(a: any) {
  if (!a) return null;
  if (typeof a === 'string') { try { return JSON.parse(a); } catch { return null; } }
  return a;
}

export default function Agent2Inline({ bid }: { bid: Bid }) {
  const [prompt, setPrompt] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // start from whatever the server already has (support both shapes)
  const [analysis, setAnalysis] = useState<any | null>(
    coerce((bid as any)?.aiAnalysis ?? (bid as any)?.ai_analysis)
  );

  // helper to refresh the bid (polling)
  const poll = useCallback(async (bidId: number, ms = 120000, every = 1500) => {
    const stop = Date.now() + ms;
    while (Date.now() < stop) {
      try {
        const fresh = await api.getBid(bidId);
        const a = coerce((fresh as any)?.aiAnalysis ?? (fresh as any)?.ai_analysis);
        if (a) return a;
      } catch {}
      await new Promise(r => setTimeout(r, every));
    }
    return null;
  }, []);

  const run = useCallback(async () => {
    setError(null);
    setRunning(true);
    try {
      const trimmed = prompt.trim();
      await api.analyzeBid(bid.bidId, trimmed || undefined);
      const a = await poll(bid.bidId);
      if (a) setAnalysis(a);
      else setError('Analysis did not complete in time — try again.');
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setRunning(false);
    }
  }, [bid.bidId, prompt, poll]);

  const a = useMemo(() => coerce(analysis), [analysis]);

  const pdfBadge =
    a?.pdfUsed === true ? 'PDF ✓ used'
    : a?.pdfUsed === false ? 'PDF ✗ not used'
    : null;

  const pdfReason = a?.pdfDebug?.reason || (a?.pdfUsed === false ? 'unknown' : null);
  const promptOverrideBadge = a?.promptSource === 'override';

  return (
    <div className="mt-3 rounded-xl border bg-slate-50 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-slate-900 text-white grid place-items-center text-xs font-bold">A2</div>
          <div className="font-semibold">Agent 2 Analysis</div>
          {promptOverrideBadge && (
            <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              Using your custom prompt
            </span>
          )}
          <span className="ml-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            ADMIN
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pdfBadge && (
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                a?.pdfUsed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {pdfBadge}{pdfReason ? `: ${pdfReason}` : ''}
            </span>
          )}
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm text-white"
            title="Open real-time chat with Agent 2 about this bid"
          >
            Ask Agent 2
          </button>
        </div>
      </div>

      {/* Analysis body */}
      {a && (
        <div className="mt-4 rounded-lg border bg-white p-3 text-sm">
          {/* V2 format */}
          {('summary' in a || 'fit' in a) && (
            <>
              <div className="text-sm">
                <span className="font-medium">Fit:</span>{' '}
                <span className="text-sky-700">{String(a.fit ?? '—')}</span>
                <span className="mx-2">·</span>
                <span className="font-medium">Confidence:</span>{' '}
                {typeof a.confidence === 'number' ? `${Math.round(a.confidence * 100)}%` : '—'}
                {typeof a.pdfUsed === 'boolean' && (
                  <>
                    <span className="mx-2">·</span>
                    <span className="font-medium">PDF parsed:</span>{' '}
                    {a.pdfUsed ? 'Yes' : 'No'}
                  </>
                )}
              </div>

              <div className="mt-3">
                <div className="font-semibold">Summary</div>
                <p className="mt-1 whitespace-pre-wrap">{a.summary || 'No summary provided.'}</p>
              </div>

              {Array.isArray(a.risks) && a.risks.length > 0 && (
                <div className="mt-3">
                  <div className="font-semibold">Risks</div>
                  <ul className="list-disc pl-5">{a.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
              {Array.isArray(a.milestoneNotes) && a.milestoneNotes.length > 0 && (
                <div className="mt-3">
                  <div className="font-semibold">Milestone Notes</div>
                  <ul className="list-disc pl-5">{a.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
                </div>
              )}
            </>
          )}

          {/* V1 fallback */}
          {('verdict' in a || 'reasoning' in a) && (
            <div className="mt-3 border-t pt-3">
              <div className="font-medium">Legacy format</div>
              {'verdict' in a && <div className="mt-1"><span className="font-medium">Verdict:</span> {a.verdict}</div>}
              {'reasoning' in a && <p className="mt-1 whitespace-pre-wrap">{a.reasoning}</p>}
              {Array.isArray(a.suggestions) && a.suggestions.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Suggestions</div>
                  <ul className="list-disc pl-5">{a.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Prompt box */}
      <div className="mt-4">
        <label className="text-sm font-medium">Custom Prompt</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder={`Optional. Use {{CONTEXT}} to inject bid + proposal + PDF text.\nExample:\n"Rewrite the summary in Spanish. Keep it concise. {{CONTEXT}}"\n(Leave blank for the default prompt)`}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          rows={3}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); run(); }}
            disabled={running}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {running ? 'Analyzing…' : 'Run Agent 2'}
          </button>
          {error && <div className="text-sm text-rose-700">{error}</div>}
        </div>
      </div>

      {/* Chat modal */}
      {chatOpen && (
        <BidChatAgent
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          bidId={bid.bidId}
          // proposal optional; backend uses bidId to hydrate context
        />
      )}
    </div>
  );
}
