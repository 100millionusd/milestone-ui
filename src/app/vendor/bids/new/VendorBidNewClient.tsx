// src/app/vendor/bids/new/VendorBidNewClient.tsx
'use client';

import React, { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Agent2ProgressModal from '@/components/Agent2ProgressModal';
import { createBid, getBid, analyzeBid } from '@/lib/api';

type Step = 'submitting' | 'analyzing' | 'done' | 'error';

type LocalMilestone = {
  name: string;
  amount: number;
  dueDate: string; // ISO
};

function coerce(a: any) {
  if (!a) return null;
  if (typeof a === 'string') { try { return JSON.parse(a); } catch { return null; } }
  return a;
}

// ✅ Guard: only allow submit when the clicked button opts in
const allowOnlyExplicitSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
  // @ts-ignore nativeEvent is fine
  const submitter = e.nativeEvent?.submitter as HTMLElement | undefined;
  if (!submitter || submitter.getAttribute('data-allow-submit') !== 'true') {
    e.preventDefault();
  }
};

// --------- NEW: uploader helper ----------
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';
async function uploadIpfsFile(file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API_BASE}/ipfs/upload-file`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`IPFS upload failed (${res.status}) ${t}`);
  }
  // expected: { cid, url, name?, size?, contentType? }
  return res.json();
}
// ----------------------------------------

export default function VendorBidNewClient({ proposalId }: { proposalId: number }) {
  const router = useRouter();

  const [vendorName, setVendorName] = useState('');
  const [priceUSD, setPriceUSD] = useState<number>(0);
  const [days, setDays] = useState<number>(30);
  const [walletAddress, setWalletAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [milestones, setMilestones] = useState<LocalMilestone[]>([
    { name: 'Milestone 1', amount: 0, dueDate: new Date().toISOString() },
  ]);

  // NEW: multi-file state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

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
    setBidIdForModal(undefined);

    try {
      // NEW: upload all selected files first
      let filesPayload: any[] = [];
      if (selectedFiles.length) {
        const uploaded = await Promise.all(selectedFiles.map(uploadIpfsFile));
        filesPayload = uploaded.map((u, i) => ({
          name: u.name ?? selectedFiles[i]?.name ?? `file-${i + 1}`,
          cid: u.cid ?? u.ipfsCid ?? null,
          url: u.url ?? (u.cid ? `https://ipfs.io/ipfs/${u.cid}` : null),
          size: u.size ?? selectedFiles[i]?.size ?? null,
          contentType: u.contentType ?? selectedFiles[i]?.type ?? null,
        }));
      }

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
        doc: null,           // legacy field (kept)
        files: filesPayload, // NEW multi-file field
      };
      if (filesPayload[0]) payload.file = filesPayload[0]; // legacy single-file compatibility

      // 1) Create bid (now includes files)
      const created: any = await createBid(payload);
      const bidId = Number(created?.bidId ?? created?.bid_id);
      if (!bidId) throw new Error('Failed to create bid (no id)');
      setBidIdForModal(bidId);

      // 2) Inline analysis? use immediately
      let found = coerce(created?.aiAnalysis ?? created?.ai_analysis);

      setStep('analyzing');
      setMessage('Agent2 is analyzing your bid…');

      // 3) If not present, trigger analyze then poll
      if (!found) {
        try { await analyzeBid(bidId); } catch {}
        found = await pollAnalysis(bidId);
      }

      if (found) {
        setAnalysis(found);
        setStep('done');
        setMessage('Analysis complete.');
        router.refresh();
      } else {
        setStep('done');
        setMessage('Analysis will appear shortly.');
        router.refresh();
      }
    } catch (err: any) {
      setStep('error');
      setMessage(err?.message || 'Failed to submit bid');
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Submit a Bid</h1>

      <form
        onSubmit={(e) => { allowOnlyExplicitSubmit(e); handleSubmit(e); }} // ✅ guard + handler
        className="space-y-4"
      >
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

        {/* NEW: Attachments (multi-file) */}
        <div className="border rounded-xl p-3">
          <div className="font-medium mb-2">Attachments</div>
          <input
            type="file"
            multiple
            onChange={(e) => {
              const files = Array.from(e.currentTarget.files || []);
              setSelectedFiles(files);
            }}
            className="block w-full rounded border px-3 py-2"
          />
          {selectedFiles.length > 0 && (
            <ul className="mt-2 text-sm text-gray-600 space-y-1">
              {selectedFiles.map((f, i) => (
                <li key={i}>
                  {f.name}{' '}
                  <span className="opacity-60">
                    ({Math.round(f.size / 1024)} KB)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

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

        {/* ✅ Only this button may submit */}
        <button
          type="submit"
          data-allow-submit="true"
          className="px-4 py-2 rounded-lg bg-slate-900 text-white"
        >
          Submit bid
        </button>
      </form>

      <Agent2ProgressModal
        open={open}
        step={step}
        message={message}
        onClose={() => setOpen(false)}
        analysis={analysis}
        bidId={bidIdForModal}  // ✅ critical for polling
      />
    </div>
  );
}
