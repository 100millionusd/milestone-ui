'use client';

import React, { useMemo, useEffect, useRef, useState, useCallback } from 'react';
import * as api from '@/lib/api';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

type Props = {
  open: boolean;
  step: Step;
  message?: string | null;
  onClose: () => void;
  analysis?: any | null;   // may be object or JSON string
  bidId?: number;          // when provided, modal will poll /bids/:id until analysis exists
};

function coerce(a: any) {
  if (!a) return null;
  if (typeof a === 'string') { try { return JSON.parse(a); } catch { return null; } }
  return a;
}

export default function Agent2ProgressModal({ open, step, message, onClose, analysis, bidId }: Props) {
  const [fetched, setFetched] = useState<any | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fromProp = useMemo(() => coerce(analysis), [analysis]);
  const data = fromProp ?? fetched ?? null;
  const ready = !!data; // any defined object means “stop spinning”

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clearTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const fetchOnce = useCallback(async () => {
    if (!bidId) return;
    try {
      const b = await api.getBid(bidId);
      const a = coerce((b as any)?.aiAnalysis ?? (b as any)?.ai_analysis);
      if (a) setFetched(a);
      setErrMsg(null);
    } catch (e: any) {
      setErrMsg(String(e?.message ?? e));
    }
  }, [bidId]);

  useEffect(() => {
    if (!open) { clearTimer(); return; }
    if (!ready && bidId && !timerRef.current) {
      fetchOnce(); // immediate
      timerRef.current = setInterval(fetchOnce, 1500);
    }
    return () => { clearTimer(); };
  }, [open, ready, bidId, fetchOnce]);

  useEffect(() => { if (ready) clearTimer(); }, [ready]);

  const retryAnalysis = useCallback(async () => {
    if (!bidId) return;
    try {
      setRetrying(true);
      await api.analyzeBid(bidId); // fire-and-forget; modal keeps polling
      await fetchOnce();
      if (!ready && !timerRef.current) timerRef.current = setInterval(fetchOnce, 1500);
    } catch (e: any) {
      setErrMsg(`Retry failed: ${String(e?.message ?? e)}`);
    } finally {
      setRetrying(false);
    }
  }, [bidId, fetchOnce, ready]);

  if (!open) return null;

  const statusColor =
    step === 'error' ? 'text-rose-700' :
    step === 'done' ? 'text-emerald-700' :
    'text-slate-700';

  const stepBadge = (active: boolean, label: string) => (
    <div className="flex items-center gap-2">
      <span className={[
        "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
        active ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700",
      ].join(' ')}>{active ? '✓' : '•'}</span>
      <span className="text-sm">{label}</span>
    </div>
  );

  const AnalysisBlock = ({ a }: { a: any }) => {
    if (!a) return null;
    const isV2 = 'fit' in a || 'summary' in a || 'risks' in a || 'confidence' in a || 'milestoneNotes' in a;
    const isV1 = 'verdict' in a || 'reasoning' in a || 'suggestions' in a;

    return (
      <div className="mt-4 border rounded-xl p-4 bg-slate-50 text-sm">
        <div className="font-medium">Agent2 — Summary</div>

        {isV2 && (
          <>
            {a.summary ? <p className="mt-1 whitespace-pre-wrap">{a.summary}</p>
                        : <p className="mt-1 text-slate-500">No summary provided.</p>}
            <div className="mt-2">
              <span className="font-medium">Fit:</span> {String(a.fit ?? '—')}
              <span className="mx-2">·</span>
              <span className="font-medium">Confidence:</span>{typeof a.confidence === 'number' ? `${Math.round(a.confidence * 100)}%` : '—'}
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

        {isV1 && (
          <div className="mt-4 border-t pt-3">
            <div className="text-sm opacity-70">Agent2 (V1)</div>
            {'verdict' in a && <div className="text-base font-semibold">Verdict: {a.verdict}</div>}
            {'reasoning' in a && <p className="mt-1 whitespace-pre-wrap">{a.reasoning}</p>}
            {Array.isArray(a.suggestions) && a.suggestions.length > 0 && (
              <div className="mt-2">
                <div className="font-medium">Suggestions</div>
                <ul className="list-disc pl-5">{a.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {!isV1 && !isV2 && <p className="mt-1 text-slate-500">Analysis format not recognized.</p>}

        {/* ✅ PDF Debug Info */}
        {a?.pdfUsed !== undefined && (
          <div className="mt-3 text-xs text-slate-600 border-t pt-2">
            <div>
              <span className="font-medium">PDF parsed:</span> {a.pdfUsed ? "Yes" : "No"}
            </div>
            {a?.pdfDebug && (
              <ul className="mt-1 space-y-1 list-disc pl-5">
                {a.pdfDebug.url && (
                  <li>
                    <span className="font-medium">URL:</span>{" "}
                    <a href={a.pdfDebug.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      {a.pdfDebug.url}
                    </a>
                  </li>
                )}
                {a.pdfDebug.name && (
                  <li><span className="font-medium">File:</span> {a.pdfDebug.name}</li>
                )}
                {a.pdfDebug.bytes !== undefined && (
                  <li><span className="font-medium">Size:</span> {a.pdfDebug.bytes} bytes</li>
                )}
                {a.pdfDebug.first5 && (
                  <li><span className="font-medium">Header:</span> “{a.pdfDebug.first5}”</li>
                )}
                {a.pdfDebug.reason && (
                  <li><span className="font-medium">Reason:</span> {a.pdfDebug.reason}</li>
                )}
                {a.pdfDebug.error && (
                  <li><span className="font-medium">Error:</span> {a.pdfDebug.error}</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  const showProgressBar = (step === 'submitting' || step === 'analyzing') && !ready;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">Submitting Bid · Agent2 Checking</h3>
          <button className="text-slate-500 hover:text-slate-900" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3">
            {stepBadge(step !== 'submitting', 'Submitting your bid')}
            {stepBadge(step === 'done' || step === 'error' || step === 'analyzing', 'Agent2 analyzing')}
            {stepBadge(ready || step === 'done', 'Analysis ready')}
          </div>

          <div className={`mt-2 text-sm ${statusColor}`}>
            {message || (step === 'submitting' ? 'Sending your bid…'
                    : step === 'analyzing' ? 'Agent2 is checking your bid…'
                    : step === 'done' ? (ready ? 'Analysis complete.' : 'Finalizing analysis…')
                    : 'Something went wrong.')}
          </div>

          {showProgressBar && (
            <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-2 w-1/2 animate-pulse bg-slate-900 rounded-full" />
            </div>
          )}

          {ready && <AnalysisBlock a={data} />}

          {!ready && (step === 'analyzing' || step === 'done') && (
            <div className="flex items-center justify-between">
              <div className="mt-2 text-sm text-slate-500">⏳ Analysis pending…</div>
              {bidId && (
                <button
                  onClick={retryAnalysis}
                  className="text-sm px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-50"
                  disabled={retrying}
                >
                  {retrying ? 'Re-checking…' : 'Retry analysis'}
                </button>
              )}
            </div>
          )}

          {errMsg && <div className="text-sm text-rose-700">{errMsg}</div>}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
            onClick={onClose}
            disabled={step === 'submitting' || (step === 'analyzing' && !ready)}
          >
            {(ready || step === 'done') && step !== 'error' ? 'Close' : (step === 'error' ? 'Dismiss' : 'Running…')}
          </button>
        </div>
      </div>
    </div>
  );
}
