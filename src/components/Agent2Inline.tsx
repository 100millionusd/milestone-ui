'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '@/lib/api';

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

  // start from whatever the server already has
  const [analysis, setAnalysis] = useState<any | null>(coerce(bid.aiAnalysis));

  // helper to refresh the bid (polling)
  const poll = useCallback(async (bidId: number, ms = 120000, every = 1500) => {
    const stop = Date.now() + ms;
    while (Date.now() < stop) {
      try {
        const fresh = await api.getBid(bidId);
        const a = coerce(fresh.aiAnalysis);
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
      // kick analysis with optional prompt
      await api.analyzeBid(bid.bidId, prompt || undefined);
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
  const pdfBadge = a?.pdfUsed === true ? 'PDF ✓ used'
                  : a?.pdfUsed === false ? 'PDF ✗ not used'
                  : null;
  const pdfReason = a?.pdfDebug?.reason || (a?.pdfUsed === false ? 'unknown' : null);

  // Render
  return (
    <div className="mt-3 rounded-xl border bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold">Agent2</div>
        {pdfBadge && (
          <span className={`text-xs px-2 py-1 rounded-full ${
            a?.pdfUsed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {pdfBadge}{pdfReason ? ` — ${pdfReason}` : ''}
          </span>
        )}
      </div>

      <div className="mt-3">
        <label className="text-sm font-medium">Prompt (optional)</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Tell Agent2 what to focus on (e.g., verify quantities vs. PDF, check timeline realism, flag missing deliverables)…"
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          rows={3}
        />
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={run}
            disabled={running}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {running ? 'Analyzing…' : 'Run Agent2'}
          </button>
          {error && <div className="text-sm text-rose-700">{error}</div>}
        </div>
      </div>

      {a && (
        <div className="mt-4 rounded-lg border bg-white p-3 text-sm">
          {/* V2 format */}
          {('summary' in a || 'fit' in a) && (
            <>
              <div className="font-medium">Summary</div>
              <p className="mt-1 whitespace-pre-wrap">{a.summary || 'No summary provided.'}</p>
              <div className="mt-2">
                <span className="font-medium">Fit:</span> {String(a.fit ?? '—')}
                <span className="mx-2">·</span>
                <span className="font-medium">Confidence:</span>{' '}
                {typeof a.confidence === 'number' ? `${Math.round(a.confidence * 100)}%` : '—'}
              </div>
              {Array.isArray(a.risks) && a.risks.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Risks</div>
                  <ul className="list-disc pl-5">{a.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
              {Array.isArray(a.milestoneNotes) && a.milestoneNotes.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Milestone Notes</div>
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
    </div>
  );
}
