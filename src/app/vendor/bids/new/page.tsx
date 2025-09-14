'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Agent2ProgressModal from '@/components/Agent2ProgressModal';
import { createBid, getBid, analyzeBid } from '@/lib/api';

export default function Page() {
  const router = useRouter();

  // Read proposalId from the URL (works on client)
  const proposalId = Number(
    new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
      .get('proposalId') || '0'
  );

  const [vendorName, setVendorName] = useState('');
  const [priceUSD, setPriceUSD] = useState<number>(0);
  const [days, setDays] = useState<number>(30);
  const [walletAddress, setWalletAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [milestones, setMilestones] = useState([
    { name: 'Milestone 1', amount: 0, dueDate: new Date().toISOString() },
  ]);

  // Agent2 modal state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'submitting' | 'analyzing' | 'done' | 'error'>('submitting');
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);

  async function pollAnalysis(bidId: number, timeoutMs = 30000, intervalMs = 2000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const b = await getBid(bidId);
      if (b?.aiAnalysis) return b.aiAnalysis;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }

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

      const created: any = await createBid(payload);
      const bidId = created?.bidId || created?.bid_id;

      setStep('analyzing');
      setMessage('Agent2 is analyzing your bid…');

      // Use inline analysis if backend already did it
      let found = created?.aiAnalysis || created?.ai_analysis || null;

      // Otherwise trigger analyze and poll for result
      if (!found && bidId) {
        try { await analyzeBid(Number(bidId)); } catch {/* ignore */}
        found = await pollAnalysis(Number(bidId));
      }

      if (found) {
        setAnalysis(found);
        setStep('done');
        setMessage('Analysis complete.');
      } else {
        setStep('done');
        setMessage('Analysis will appear shortly.');
      }

      // Optional: redirect after a moment
      // setTimeout(() => router.push('/vendor/bids'), 1200);
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
                onChange={e => { const n=[...milestones]; n[i].name=e.target.value; setMilestones(n); }}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Amount"
                type="number"
                min={0}
                value={m.amount}
                onChange={e => { const n=[...milestones]; n[i].amount=Number(e.target.value); setMilestones(n); }}
              />
              <input
                className="border rounded-lg px-3 py-2"
                type="date"
                value={m.dueDate.slice(0,10)}
                onChange={e => { const n=[...milestones]; n[i].dueDate=new Date(e.target.value).toISOString(); setMilestones(n); }}
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
