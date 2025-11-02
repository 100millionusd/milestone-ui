// src/app/templates/[id]/TemplateBidClient.tsx
'use client';

import React, { useCallback, useState } from 'react';
import Agent2ProgressModal from '@/components/Agent2ProgressModal';
import { analyzeBid, createBidFromTemplate, getBid } from '@/lib/api';
import TemplateRenovationHorizontal from '@/components/TemplateRenovationHorizontal';
import FileUploader from './FileUploader'; // ← THIS FIXES "Can't find variable: FileUploader"

type TemplateBidClientProps = {
  slugOrId: string;                 // slug or numeric id as string
  initialProposalId?: number;       // auto-filled from ?proposalId
  initialVendorName?: string;
  initialWallet?: string;
};

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

function coerce(a: any) {
  if (!a) return null;
  if (typeof a === 'string') { try { return JSON.parse(a); } catch { return null; } }
  return a;
}

export default function TemplateBidClient(props: TemplateBidClientProps) {
  const { slugOrId, initialProposalId = 0, initialVendorName = '', initialWallet = '' } = props;

  const [proposalId, setProposalId] = useState(initialProposalId || 0);
  const [vendorName, setVendorName] = useState(initialVendorName);
  const [walletAddress, setWalletAddress] = useState(initialWallet);
  const [preferredStablecoin, setPreferredStablecoin] = useState<'USDT' | 'USDC'>('USDT');

  // Agent2 modal state
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('submitting');
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [bidIdForModal, setBidIdForModal] = useState<number | undefined>(undefined);

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!Number.isFinite(proposalId) || proposalId <= 0) {
      alert('Missing proposalId. Open with ?proposalId=<id> or fill the input.');
      return;
    }

    // Read serialized inputs from the form (hidden inputs produced by child widgets)
    const fd = new FormData(e.currentTarget);

    // milestonesJson (from TemplateRenovationHorizontal)
    let milestones: any[] = [];
    try {
      const raw = String(fd.get('milestonesJson') || '[]');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) milestones = arr;
    } catch {}

    // filesJson (from FileUploader)
    let files: Array<string | { url: string; name?: string }> = [];
    try {
      const raw = String(fd.get('filesJson') || '[]');
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) files = arr;
    } catch {}

    // Show Agent2 modal immediately (match normal-bid UX)
    setOpen(true);
    setStep('submitting');
    setMessage(null);
    setAnalysis(null);
    setBidIdForModal(undefined);

    try {
      const base = /^\d+$/.test(slugOrId) ? { templateId: Number(slugOrId) } : { slug: slugOrId };

      // 1) Create bid from template
      const res = await createBidFromTemplate({
        ...base,
        proposalId,
        vendorName,
        walletAddress,
        preferredStablecoin,
        milestones,
        files,
      });

      const bidId = Number(res?.bidId);
      if (!bidId) throw new Error('Failed to create bid (no id)');
      setBidIdForModal(bidId);

      // 2) Trigger + poll Agent2 analysis
      setStep('analyzing');
      setMessage('Agent2 is analyzing your bid…');
      try { await analyzeBid(bidId); } catch {}

      const found = await pollAnalysis(bidId);
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
      setMessage(err?.message || 'Failed to submit bid from template');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-2xl border bg-white p-4 shadow-sm">
      {/* Vendor basics — horizontal row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <label className="text-sm">
          <span className="block">Proposal ID</span>
          <input
            name="proposalId"
            type="number"
            required
            defaultValue={proposalId ? String(proposalId) : ''}
            onChange={(e) => setProposalId(Number(e.target.value || 0))}
            className="mt-1 w-full border rounded-md px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <span className="block">Stablecoin</span>
          <select
            name="preferredStablecoin"
            className="mt-1 w-full border rounded-md px-3 py-2"
            value={preferredStablecoin}
            onChange={(e) => setPreferredStablecoin(e.target.value as 'USDT' | 'USDC')}
          >
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
          </select>
        </label>

        <label className="text-sm">
          <span className="block">Vendor Name</span>
          <input
            name="vendorName"
            required
            defaultValue={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            className="mt-1 w-full border rounded-md px-3 py-2"
          />
        </label>

        <label className="text-sm">
          <span className="block">Wallet (0x…)</span>
          <input
            name="walletAddress"
            required
            defaultValue={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            pattern="^0x[a-fA-F0-9]{40}$"
            className="mt-1 w-full border rounded-md px-3 py-2"
          />
        </label>
      </div>

      {/* Horizontal scopes + milestones (no scrolling) 
         MUST render <input type="hidden" name="milestonesJson" ... />
      */}
      <TemplateRenovationHorizontal milestonesInputName="milestonesJson" />

      {/* File uploader MUST render <input type="hidden" name="filesJson" ... /> */}
      <div className="pt-1">
        <FileUploader apiBase={process.env.NEXT_PUBLIC_API_BASE || ''} />
      </div>

      {/* Submit under milestones */}
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm hover:bg-cyan-700"
        >
          Use this template → Create bid
        </button>
      </div>

      {/* Agent2 modal (same UX as normal bids) */}
      <Agent2ProgressModal
        open={open}
        step={step}
        message={message}
        onClose={() => setOpen(false)}
        analysis={analysis}
        bidId={bidIdForModal}
      />
    </form>
  );
}
