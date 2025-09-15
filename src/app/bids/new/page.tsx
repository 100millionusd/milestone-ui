// src/app/bids/new/page.tsx
'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createBid,
  uploadFileToIPFS,
  getProposal,
  analyzeBid,
  getBid,
  type Bid,
} from '@/lib/api';

function NewBidPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proposalIdParam = searchParams.get('proposalId');
  const proposalId = proposalIdParam ? Number(proposalIdParam) : NaN;

  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<any | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    proposalId: proposalId,
    vendorName: '',
    priceUSD: '',
    days: '',
    notes: '',
    walletAddress: '',
    preferredStablecoin: 'USDC',
    milestones: [{ name: 'Milestone 1', amount: '', dueDate: '' }],
  });

  // After-create state
  const [newBidId, setNewBidId] = useState<number | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any | null>(null);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  // Load proposal header
  useEffect(() => {
    if (Number.isFinite(proposalId)) {
      getProposal(proposalId)
        .then(setProposal)
        .catch(console.error);
    }
  }, [proposalId]);

  const pollAnalysis = useCallback(async (bidId: number, timeoutMs = 120_000, everyMs = 1500) => {
    const stop = Date.now() + timeoutMs;
    while (Date.now() < stop) {
      try {
        const b: Bid = await getBid(bidId);
        const a = (b as any)?.aiAnalysis ?? (b as any)?.ai_analysis ?? null;
        if (a) return a;
      } catch {}
      await new Promise(r => setTimeout(r, everyMs));
    }
    return null;
  }, []);

  const runAgent2 = useCallback(async () => {
    if (!newBidId) return;
    setAgentError(null);
    setAgentRunning(true);
    try {
      await analyzeBid(newBidId, agentPrompt || undefined);
      const a = await pollAnalysis(newBidId);
      if (a) setAiAnalysis(a);
      else setAgentError('Analysis did not complete in time. Try again.');
    } catch (e: any) {
      setAgentError(String(e?.message ?? e));
    } finally {
      setAgentRunning(false);
    }
  }, [newBidId, agentPrompt, pollAnalysis]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(proposalId)) {
      alert('Missing proposalId. Open this page with ?proposalId=<id>.');
      return;
    }
    setLoading(true);
    setAiAnalysis(null);
    setAgentError(null);
    setNewBidId(null);

    try {
      let doc = null;
      if (docFile) {
        const uploaded = await uploadFileToIPFS(docFile);
        doc = {
          cid: uploaded.cid,
          url: uploaded.url, // use server/gateway URL directly
          name: docFile.name,
          size: docFile.size,
        };
      }

      const body = {
        proposalId,
        vendorName: formData.vendorName.trim(),
        priceUSD: Number(formData.priceUSD),
        days: Number(formData.days),
        notes: formData.notes,
        walletAddress: formData.walletAddress.trim(),
        preferredStablecoin: formData.preferredStablecoin as 'USDC' | 'USDT',
        milestones: formData.milestones.map(m => ({
          name: m.name,
          amount: Number(m.amount),
          dueDate: new Date(m.dueDate).toISOString(),
        })),
        doc,
      };

      const created = await createBid(body as any);
      const bidId = Number((created as any)?.bidId ?? (created as any)?.bid_id);
      setNewBidId(bidId || null);

      // if server already attached analysis, show it
      const initial = (created as any)?.aiAnalysis ?? (created as any)?.ai_analysis ?? null;
      if (initial) {
        setAiAnalysis(initial);
      } else if (bidId) {
        // kick an initial analysis (no prompt) but keep prompt box visible
        try { await analyzeBid(bidId); } catch {}
        const a = await pollAnalysis(bidId, 30_000);
        if (a) setAiAnalysis(a);
      }
      // NOTE: do NOT redirect automatically; we show Agent2 panel here first.
    } catch (error: any) {
      console.error('Error creating bid:', error);
      alert('Failed to create bid: ' + (error?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const addMilestone = () => {
    setFormData(prev => ({
      ...prev,
      milestones: [...prev.milestones, { name: `Milestone ${prev.milestones.length + 1}`, amount: '', dueDate: '' }],
    }));
  };
  const removeMilestone = (index: number) => {
    setFormData(prev => ({ ...prev, milestones: prev.milestones.filter((_, i) => i !== index) }));
  };
  const updateMilestone = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    }));
  };

  if (!Number.isFinite(proposalId)) {
    return <div className="max-w-4xl mx-auto p-6">No project selected. Open this page with <code>?proposalId=...</code>.</div>;
  }

  // Helpers for PDF badge
  const analysisObj = typeof aiAnalysis === 'string' ? (() => { try { return JSON.parse(aiAnalysis); } catch { return null; } })() : aiAnalysis;
  const pdfUsed = analysisObj?.pdfUsed;
  const pdfReason = analysisObj?.pdfDebug?.reason || (pdfUsed === false ? 'unknown' : null);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Submit Bid</h1>

      {proposal && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <h2 className="font-semibold mb-2">Project: {proposal.title}</h2>
          <p className="text-gray-600">Organization: {proposal.orgName}</p>
          <p className="text-green-600 font-medium">Budget: ${proposal.amountUSD}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Vendor Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Vendor Name *</label>
            <input
              type="text"
              required
              value={formData.vendorName}
              onChange={e => setFormData({ ...formData, vendorName: e.target.value })}
              className="w-full p-2 border rounded"
              placeholder="Your company name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Wallet Address *</label>
            <input
              type="text"
              required
              value={formData.walletAddress}
              onChange={e => setFormData({ ...formData, walletAddress: e.target.value })}
              className="w-full p-2 border rounded"
              placeholder="0x..."
            />
          </div>
        </div>

        {/* Bid Details */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Bid Price (USD) *</label>
            <input
              type="number" step="0.01" required
              value={formData.priceUSD}
              onChange={e => setFormData({ ...formData, priceUSD: e.target.value })}
              className="w-full p-2 border rounded" placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Completion Days *</label>
            <input
              type="number" required
              value={formData.days}
              onChange={e => setFormData({ ...formData, days: e.target.value })}
              className="w-full p-2 border rounded" placeholder="30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Preferred Stablecoin *</label>
            <select
              required
              value={formData.preferredStablecoin}
              onChange={e => setFormData({ ...formData, preferredStablecoin: e.target.value })}
              className="w-full p-2 border rounded"
            >
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
            </select>
          </div>
        </div>

        {/* Bid Notes */}
        <div>
          <label className="block text-sm font-medium mb-1">Bid Proposal Details *</label>
          <textarea
            required
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            className="w-full p-2 border rounded"
            rows={4}
            placeholder="Describe your approach, timeline, experience..."
          />
        </div>

        {/* Milestones */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <label className="block text-sm font-medium">Project Milestones *</label>
            <button type="button" onClick={addMilestone} className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700">
              + Add Milestone
            </button>
          </div>
          <div className="space-y-4">
            {formData.milestones.map((m, i) => (
              <div key={i} className="border p-4 rounded-lg bg-gray-50">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">Milestone {i + 1}</h4>
                  {formData.milestones.length > 1 && (
                    <button type="button" onClick={() => removeMilestone(i)} className="text-red-600 text-sm hover:text-red-800">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Milestone Name *</label>
                    <input
                      type="text" required value={m.name}
                      onChange={e => updateMilestone(i, 'name', e.target.value)}
                      className="w-full p-2 border rounded text-sm" placeholder="Design completion"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Amount ($) *</label>
                    <input
                      type="number" step="0.01" required value={m.amount}
                      onChange={e => updateMilestone(i, 'amount', e.target.value)}
                      className="w-full p-2 border rounded text-sm" placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Due Date *</label>
                    <input
                      type="date" required value={m.dueDate}
                      onChange={e => updateMilestone(i, 'dueDate', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Supporting Documents */}
        <div>
          <label className="block text-sm font-medium mb-1">Supporting Documents</label>
          <input
            type="file"
            onChange={e => setDocFile(e.target.files?.[0] || null)}
            className="w-full p-2 border rounded"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          />
          <p className="text-sm text-gray-500 mt-1">
            Upload portfolio, previous work examples, certifications, or other supporting documents
          </p>
        </div>

        {/* Submit */}
        <div className="flex gap-4 pt-4">
          <button type="submit" disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded-lg disabled:bg-gray-400 font-medium">
            {loading ? 'Submitting Bid...' : 'Submit Bid'}
          </button>
          <button type="button" onClick={() => router.back()} className="bg-gray-500 text-white px-6 py-3 rounded-lg">
            Cancel
          </button>
        </div>
      </form>

      {/* Agent2 panel (shown AFTER bid is created) */}
      {newBidId && (
        <div className="mt-8 rounded-xl border p-5 bg-slate-50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Agent2</h2>
            {aiAnalysis && (
              <span className={`text-xs px-2 py-1 rounded-full ${
                pdfUsed ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {pdfUsed ? 'PDF ✓ used' : 'PDF ✗ not used'}{pdfReason ? ` — ${pdfReason}` : ''}
              </span>
            )}
          </div>

          <label className="mt-3 block text-sm font-medium">Prompt (optional)</label>
          <textarea
            value={agentPrompt}
            onChange={e => setAgentPrompt(e.target.value)}
            placeholder="Tell Agent2 what to focus on (e.g., verify quantities vs. the PDF, check timeline realism, flag missing deliverables)…"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            rows={3}
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={runAgent2}
              disabled={agentRunning}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {agentRunning ? 'Analyzing…' : 'Run Agent2'}
            </button>
            <button
              onClick={() => router.push(`/projects/${proposalId}`)}
              className="rounded-lg bg-gray-600 px-3 py-1.5 text-sm text-white"
              title="Go to project page"
            >
              Go to Project
            </button>
            {agentError && <div className="text-sm text-rose-700">{agentError}</div>}
          </div>

          {aiAnalysis && (
            <div className="mt-4 rounded-lg border bg-white p-3 text-sm">
              {/* V2 format */}
              {('summary' in (aiAnalysis || {})) && (
                <>
                  <div className="font-medium">Summary</div>
                  <p className="mt-1 whitespace-pre-wrap">{aiAnalysis.summary || 'No summary provided.'}</p>
                  <div className="mt-2">
                    <span className="font-medium">Fit:</span> {String(aiAnalysis.fit ?? '—')}
                    <span className="mx-2">·</span>
                    <span className="font-medium">Confidence:</span>{' '}
                    {typeof aiAnalysis.confidence === 'number' ? `${Math.round(aiAnalysis.confidence * 100)}%` : '—'}
                  </div>
                  {Array.isArray(aiAnalysis.risks) && aiAnalysis.risks.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium">Risks</div>
                      <ul className="list-disc pl-5">{aiAnalysis.risks.map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
                    </div>
                  )}
                  {Array.isArray(aiAnalysis.milestoneNotes) && aiAnalysis.milestoneNotes.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium">Milestone Notes</div>
                      <ul className="list-disc pl-5">{aiAnalysis.milestoneNotes.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
                    </div>
                  )}
                </>
              )}

              {/* V1 fallback */}
              {('verdict' in (aiAnalysis || {})) && (
                <div className="mt-3 border-t pt-3">
                  <div className="font-medium">Legacy format</div>
                  {'verdict' in (aiAnalysis || {}) && <div className="mt-1"><span className="font-medium">Verdict:</span> {aiAnalysis.verdict}</div>}
                  {'reasoning' in (aiAnalysis || {}) && <p className="mt-1 whitespace-pre-wrap">{aiAnalysis.reasoning}</p>}
                  {Array.isArray(aiAnalysis.suggestions) && aiAnalysis.suggestions.length > 0 && (
                    <div className="mt-2">
                      <div className="font-medium">Suggestions</div>
                      <ul className="list-disc pl-5">{aiAnalysis.suggestions.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NewBidPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-6">Loading bid form...</div>}>
      <NewBidPageContent />
    </Suspense>
  );
}
