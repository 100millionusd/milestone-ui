'use client';

import React, { useCallback, useState } from 'react';
import Agent2ProgressModal from '@/components/Agent2ProgressModal';
import { createBid, getBid, analyzeBid } from '@/lib/api';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

type LocalMilestone = {
  name: string;
  amount: number;
  dueDate: string; // ISO
};

export default function VendorBidNewClient({ proposalId }: { proposalId: number }) {
  const [vendorName, setVendorName] = useState('');
  const [priceUSD, setPriceUSD] = useState<number>(0);
  const [days, setDays] = useState<number>(30);
  const [walletAddress, setWalletAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [milestones, setMilestones] = useState<LocalMilestone[]>([
    { name: 'Milestone 1', amount: 0, dueDate: new Date().toISOString() },
  ]);

  // Agent2 modal state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('submitting');
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);

  const pollAnalysis = useCallback(async (bidId: number, timeoutMs = 60000, intervalMs = 1500) => {
    const stopAt = Date.now() + timeoutMs;
    while (Date.now() < stopAt) {
      try {
        const b = await getBid(bidId); // api.ts already no-store + cache-busts
        const ai = b?.aiAnalysis ?? null;
        if (ai) return ai;
      } catch {}
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!Number.isFinite(proposalId) || proposalId <= 0) {
      alert('Missing proposalId. Open this page with ?proposalId=<id>.');
      return;
    }

    setOpen(true);
    setStep('submitting');
    setMessage(null);
    setAnalysis(null);

    try {
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
        doc: null,
      };

      // 1) Create bid
      const created: any = await createBid(payload);
      const bidId = Number(created?.bidId ?? created?.bid_id);
      if (!bidId) throw new Error('Failed to create bid (no id)');

      // 2) Inline analysis if backend already attached it
      let found = created?.aiAnalysis ?? created?.ai_analysis ?? null;

      setStep('analyzing');
      setMessage('Agent2 is analyzing your bid…');

      // 3) Otherwise trigger analyze and then poll
      if (!found) {
        try { await analyzeBid(bidId); } catch {}
        found = await pollAnalysis(bidId);
      }

      if (found) {
        setAnalysis(found); // ✅ show immediately in the modal
        setStep('done');
        setMessage('Analysis complete.');
      } else {
        setStep('done');
        setMessage('Analysis will appear shortly.');
      }
    } catch (err: any) {
      setStep('error');
      setMessage(err?.message || 'Failed to submit bid');
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

        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Milestones</div>
          {milestones.map((m, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-3 mb-2">
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Name"
                value={m.name}
                onChange={e => { const n = [...milestones]; n[i].name = e.target.value; setMilestones(n); }}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Amount"
                type="number"
                min={0}
                value={m.amount}
                onChange={e => { const n = [...milestones]; n[i].amount = Number(e.target.value); setMilestones(n); }}
              />
              <input
                className="border rounded-lg px-3 py-2"
                type="date"
                value={m.dueDate.slice(0,10)}
                onChange={e => { const n = [...milestones]; n[i].dueDate = new Date(e.target.value).toISOString(); setMilestones(n); }}
              />
            </div>
          ))}
        </div>

        <button type="submit" className="px-4 py-2 rounded-lg bg-slate-900 text-white">
          Submit bid
        </button>
      </form>

      <Agent2ProgressModal
        open={open}
        step={step}
        message={message}
        onClose={() => setOpen(false)}
        analysis={analysis}
      />
    </div>
  );
}
