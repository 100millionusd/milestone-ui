// src/app/vendor/VendorBidNewPage.tsx
'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Agent2ProgressModal from '@/components/Agent2ProgressModal';
import { createBid, getBid, analyzeBid } from '@/lib/api';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

export default function VendorBidNewPage() {
  const router = useRouter();
  const params = useSearchParams();
  const proposalId = Number(params.get('proposalId') || '0');

  const [vendorName, setVendorName] = React.useState('');
  const [priceUSD, setPriceUSD] = React.useState<number>(0);
  const [days, setDays] = React.useState<number>(30);
  const [walletAddress, setWalletAddress] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [milestones, setMilestones] = React.useState([
    { name: 'Milestone 1', amount: 0, dueDate: new Date().toISOString() },
  ]);

  // Agent2 modal state
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<Step>('submitting');
  const [message, setMessage] = React.useState<string | null>(null);
  const [analysis, setAnalysis] = React.useState<any | null>(null);

  function isValidEth(addr: string) {
    return /^0x[a-fA-F0-9]{40}$/.test(addr.trim());
  }

  async function pollAnalysis(bidId: number, timeoutMs = 30000, intervalMs = 1500) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const b = await getBid(bidId); // cache-busted in api.ts
      if (b?.aiAnalysis) return b.aiAnalysis;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!Number.isFinite(proposalId) || proposalId <= 0) {
      alert('Missing proposalId. Open this page with ?proposalId=<id>.');
      return;
    }
    if (!isValidEth(walletAddress)) {
      alert('Please enter a valid Ethereum address (0x...).');
      return;
    }

    setOpen(true);
    setStep('submitting');
    setMessage(null);
    setAnalysis(null);

    try {
      const payload: any = {
        proposalId,
        vendorName: vendorName.trim(),
        priceUSD: Number(priceUSD),
        days: Number(days),
        notes: (notes || '').trim(),
        walletAddress: walletAddress.trim(),
        preferredStablecoin: 'USDT',
        milestones: (milestones || []).map((m) => ({
          name: String(m.name || '').trim(),
          amount: Number(m.amount || 0),
          dueDate: new Date(m.dueDate).toISOString(),
        })),
        doc: null, // add file upload later if needed
      };

      const created: any = await createBid(payload);
      const bidId = Number(created?.bidId ?? created?.bid_id);
      let found = created?.aiAnalysis ?? created?.ai_analysis ?? null;

      setStep('analyzing');
      setMessage('Agent2 is analyzing your bid…');

      // If the inline analysis isn't present yet, trigger and poll.
      if (!found && Number.isFinite(bidId)) {
        try {
          await analyzeBid(bidId);
        } catch {
          /* no-op */
        }
        found = await pollAnalysis(bidId);
      }

      if (found) {
        setAnalysis(found);
        setStep('done');
        setMessage('Analysis complete.');
      } else {
        setStep('done');
        setMessage('Analysis will appear shortly.');
      }

      // Optional redirect after a short delay:
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
            onChange={(e) => setVendorName(e.target.value)}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Price (USD)"
            type="number"
            min={0}
            value={priceUSD}
            onChange={(e) => setPriceUSD(Number(e.target.value))}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Days"
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            required
          />
          <input
            className="border rounded-lg px-3 py-2"
            placeholder="Wallet (0x…)"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            required
          />
        </div>

        <textarea
          className="border rounded-lg w-full px-3 py-2"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Milestones</div>
          {milestones.map((m, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-3 mb-2">
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Name"
                value={m.name}
                onChange={(e) => {
                  const n = [...milestones];
                  n[i].name = e.target.value;
                  setMilestones(n);
                }}
              />
              <input
                className="border rounded-lg px-3 py-2"
                placeholder="Amount"
                type="number"
                min={0}
                value={Number(m.amount)}
                onChange={(e) => {
                  const n = [...milestones];
                  n[i].amount = Number(e.target.value);
                  setMilestones(n);
                }}
              />
              <input
                className="border rounded-lg px-3 py-2"
                type="date"
                value={(m.dueDate || '').slice(0, 10)}
                onChange={(e) => {
                  const n = [...milestones];
                  n[i].dueDate = new Date(e.target.value).toISOString();
                  setMilestones(n);
                }}
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
