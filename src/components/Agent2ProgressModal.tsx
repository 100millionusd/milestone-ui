'use client';

import React, { useMemo } from 'react';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

type Props = {
  open: boolean;
  step: Step;
  message?: string | null;
  onClose: () => void;
  analysis?: any | null; // can be object or JSON string
};

export default function Agent2ProgressModal({
  open,
  step,
  message,
  onClose,
  analysis,
}: Props) {
  if (!open) return null;

  // Parse if stringified
  const data = useMemo(() => {
    if (!analysis) return null;
    if (typeof analysis === 'string') {
      try { return JSON.parse(analysis); } catch { return null; }
    }
    return analysis;
  }, [analysis]);

  const statusColor =
    step === 'error' ? 'text-rose-700' :
    step === 'done' ? 'text-emerald-700' :
    'text-slate-700';

  const stepBadge = (active: boolean, label: string) => (
    <div className="flex items-center gap-2">
      <span
        className={[
          "inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold",
          active ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700",
        ].join(' ')}
      >
        {active ? '✓' : '•'}
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );

  const pending = !data;

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
            {stepBadge(!!data || step === 'done', 'Analysis ready')}
          </div>

          <div className={`mt-2 text-sm ${statusColor}`}>
            {message || (step === 'submitting'
              ? 'Sending your bid...'
              : step === 'analyzing'
              ? 'Agent2 is checking your milestones, timeline, and pricing...'
              : step === 'done'
              ? 'Analysis complete.'
              : 'Something went wrong.')}
          </div>

          {(step === 'submitting' || step === 'analyzing') && pending && (
            <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-2 w-1/2 animate-pulse bg-slate-900 rounded-full" />
            </div>
          )}

          {data && (
            <div className="mt-4 border rounded-xl p-4 bg-slate-50 text-sm">
              <div className="font-medium">Agent2 — Summary</div>
              {data.summary ? (
                <p className="mt-1 whitespace-pre-wrap">{data.summary}</p>
              ) : (
                <p className="mt-1 text-slate-500">No summary provided.</p>
              )}

              <div className="mt-2">
                <span className="font-medium">Fit:</span> {String(data.fit ?? '—')}
                <span className="mx-2">·</span>
                <span className="font-medium">Confidence:</span>{' '}
                {typeof data.confidence === 'number'
                  ? `${Math.round(data.confidence * 100)}%`
                  : '—'}
              </div>

              {Array.isArray(data.risks) && data.risks.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Risks</div>
                  <ul className="list-disc pl-5">
                    {data.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}

              {Array.isArray(data.milestoneNotes) && data.milestoneNotes.length > 0 && (
                <div className="mt-2">
                  <div className="font-medium">Milestone Notes</div>
                  <ul className="list-disc pl-5">
                    {data.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {!data && (step === 'analyzing' || step === 'done') && (
            <div className="mt-2 text-sm text-slate-500">⏳ Analysis pending…</div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
            onClick={onClose}
            disabled={step === 'submitting' || (step === 'analyzing' && !data)}
          >
            {(!!data || step === 'done') && step !== 'error' ? 'Close' : (step === 'error' ? 'Dismiss' : 'Running…')}
          </button>
        </div>
      </div>
    </div>
  );
}
