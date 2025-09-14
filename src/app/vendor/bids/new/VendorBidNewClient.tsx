'use client';

import React, { useCallback, useState } from 'react';
import Agent2ProgressModal from '@/components/Agent2ProgressModal';
import { createBid, getBid, analyzeBid, uploadFileToIPFS } from '@/lib/api';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

type LocalMilestone = {
  name: string;
  amount: number;
  dueDate: string; // ISO
};

function coerce(a: any) {
  if (!a) return null;
  if (typeof a === 'string') {
    try { return JSON.parse(a); } catch { return null; }
  }
  return a;
}

export default function VendorBidNewClient({ proposalId }: { proposalId: number }) {
  const [vendorName, setVendorName] = useState('');
  const [priceUSD, setPriceUSD] = useState<number>(0);
  const [days, setDays] = useState<number>(30);
  const [walletAddress, setWalletAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [milestones, setMilestones] = useState<LocalMilestone[]>([
    { name: 'Milestone 1', amount: 0, dueDate: new Date().toISOString() },
  ]);

  // Optional: PDF file for Agent2
  const [docFile, setDocFile] = useState<File | null>(null);

  // NEW: Custom prompt for Agent2
  const [agentPrompt, setAgentPrompt] = useState('');

  // Agent2 modal state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('submitting');
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [bidIdForModal, setBidIdForModal] = useState<number | undefined>(undefined);

  const [busy, setBusy] = useState(false);

  const pollAnalysis = useCallback(async (bidId: number, timeoutMs = 60000, intervalMs = 1500) => {
    const stopAt = Date.now() + timeoutMs;
    while (Date.now() < stopAt) {
      try {
        const b = await getBid(bidId);
        const ai = coerce((b as any)?.aiAnalysis ?? (b as any)?.ai_analysis);
        if (ai) return ai;
      } catch {}
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (!Number.isFinite(proposalId) || proposalId <= 0) {
      alert('Missing proposalId. Open this page with ?proposalId=<id>.');
      return;
    }

    setBusy(true);
    setOpen(true);
    setStep('submitting');
    setMessage('Sending your bid…');
    setAnalysis(null);
    setBidIdForModal(undefined);

    try {
      // 0) Upload file first (if provided)
      let doc: any = null;
      if (docFile) {
        const res = await uploadFileToIPFS(docFile); // {cid, url, name, size}
        doc = {
          cid: res.cid,
          url: res.url,
          name: res.name || docFile.name,
          size: res.size ?? docFile.size,
          mimetype: docFile.type || 'application/pdf',
        };
      }

      // 1) Create bid
      const payload: any = {
        proposalId,
        vendorName,
        priceUSD: Number(priceUSD),
        days: Number(days),
        notes,
        walletAddress,
        preferredStablecoin: 'USDT',
        milestones: milestones.map(m => ({
          name: m.name,
          amount: Number(m.amount),
          dueDate: new Date(m.dueDate).toISOString(),
        })),
        doc,
      };

      const created: any = await createBid(payload);
      const bidId = Number(created?.bidId ?? created?.bid_id);
      if (!bidId) throw new Error('Failed to create bid (no id)');
      setBidIdForModal(bidId);

      // 2) If API already attached analysis inline, use it immediately
      let found = coerce(created?.aiAnalysis ?? created?.ai_analysis);

      if (found) {
        setStep('done');
        setMessage('Analysis complete.');
        setAnalysis(found);
        setBusy(false);
        return;
      }

      // 3) Otherwise trigger analyze WITH PROMPT, then poll
      setStep('analyzing');
      setMessage('Agent2 is analyzing your bid…');
      try {
        await analyzeBid(bidId, agentPrompt || undefined);
      } catch {
        // non-fatal, we’ll poll anyway
      }

      found = await pollAnalysis(bidId, 60000, 1500);

      if (found) {
        setAnalysis(found);
        setStep('done');
        setMessage('Analysis complete.');
      } else {
        setStep('done');
        setMessage('Analysis will appear shortly.');
      }
    } catch (err: any) {
      setStep('error');
      setMessage(err?.message || 'Failed to submit bid');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Submit a Bid</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Vendor name"
            value={vendorName}
            onChange={e => setVendorName(e.target.value)}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Price (USD)"
            type="number"
            min={0}
            value={priceUSD}
            onChange={e => setPriceUSD(Number(e.target.value))}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Days"
            type="number"
            min={1}
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Wallet (0x…)"
            value={walletAddress}
            onChange={e => setWalletAddress(e.target.value)}
            required
          />
        </div>

        <textarea
          className="border rounded-lg w-full px-3 py-2"
          placeholder="Notes (optional)"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />

        {/* Optional PDF */}
        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Attach PDF (optional)</div>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
            className="block"
          />
          {docFile && <div className="text-xs text-slate-600 mt-1">Selected: {docFile.name}</div>}
        </div>

        {/* NEW: Custom Agent2 prompt */}
        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Agent2 custom prompt (optional)</div>
          <textarea
            className="w-full min-h-24 rounded-lg border p-3"
            placeholder={`Optional instructions for Agent2.\nExamples:\n- Focus on pricing realism and vendor credibility.\n- Summarize in Spanish.\n- Compare against the proposal scope.\n(Leave blank to use default prompt.)`}
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">This prompt is sent with the first analysis run.</p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white disabled:opacity-50"
          >
            {busy ? 'Submitting…' : 'Submit bid'}
          </button>
        </div>
      </form>

      <Agent2ProgressModal
        open={open}
        step={step}
        message={message}
        onClose={() => setOpen(false)}
        analysis={analysis}
        bidId={bidIdForModal}
      />
    </div>
  );
}
