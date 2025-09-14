'use client';
import React, { useState } from 'react';
import * as api from '@/lib/api';

export default function Agent2PromptBox({
  bidId,
  onAfter,
}: { bidId: number; onAfter?: (updatedBid:any)=>void }) {
  const [prompt, setPrompt] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const updated = await api.analyzeBid(bidId, prompt);
      onAfter?.(updated);
    } catch (e:any) {
      setErr(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border p-4">
      <div className="font-semibold mb-2">Agent2 — Custom prompt</div>
      <textarea
        className="w-full min-h-28 rounded-lg border p-3"
        placeholder={`Optional. Use {{CONTEXT}} to inject bid + proposal + PDF text.\nExample:\n"Rewrite the summary in Spanish. Keep it concise. {{CONTEXT}}"\n`}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={run}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
        >
          {busy ? 'Analyzing…' : 'Run Agent2'}
        </button>
        {err && <span className="text-sm text-rose-700">{err}</span>}
      </div>
      <p className="mt-2 text-xs text-slate-500">Leave blank to use the default prompt.</p>
    </div>
  );
}
