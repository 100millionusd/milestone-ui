'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createBid } from '@/lib/api'; // ✅ Correct import path

export default function NewBidPage() {
  const searchParams = useSearchParams();
  const proposalId = searchParams.get('proposalId');

  const [vendorName, setVendorName] = useState('');
  const [priceUSD, setPriceUSD] = useState('');
  const [days, setDays] = useState('');
  const [notes, setNotes] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [preferredStablecoin, setPreferredStablecoin] = useState('USDT');
  const [milestones, setMilestones] = useState([{ name: '', amount: '', dueDate: '' }]);

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<any | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const bidPayload = {
        proposalId: Number(proposalId),
        vendorName,
        priceUSD: Number(priceUSD),
        days: Number(days),
        notes,
        walletAddress,
        preferredStablecoin,
        milestones: milestones.map((m) => ({
          name: m.name,
          amount: Number(m.amount),
          dueDate: m.dueDate,
        })),
      };

      const res = await createBid(bidPayload);

      if (res.ok) {
        setSuccess(true);
        setAiAnalysis(res.aiAnalysis || null);
      } else {
        setError('Failed to create bid');
      }
    } catch (err: any) {
      console.error('Error creating bid:', err);
      setError(err.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMilestoneChange = (index: number, field: string, value: string) => {
    const newMilestones = [...milestones];
    newMilestones[index] = { ...newMilestones[index], [field]: value };
    setMilestones(newMilestones);
  };

  const addMilestone = () => {
    setMilestones([...milestones, { name: '', amount: '', dueDate: '' }]);
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Submit a New Bid</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Vendor Name</label>
          <input
            type="text"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Price (USD)</label>
            <input
              type="number"
              value={priceUSD}
              onChange={(e) => setPriceUSD(e.target.value)}
              className="w-full border p-2 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Days</label>
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-full border p-2 rounded"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium">Wallet Address</label>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Preferred Stablecoin</label>
          <select
            value={preferredStablecoin}
            onChange={(e) => setPreferredStablecoin(e.target.value)}
            className="w-full border p-2 rounded"
          >
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <h3 className="font-medium mb-2">Milestones</h3>
          {milestones.map((m, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-2 mb-2">
              <input
                type="text"
                placeholder="Name"
                value={m.name}
                onChange={(e) => handleMilestoneChange(idx, 'name', e.target.value)}
                className="border p-2 rounded"
                required
              />
              <input
                type="number"
                placeholder="Amount"
                value={m.amount}
                onChange={(e) => handleMilestoneChange(idx, 'amount', e.target.value)}
                className="border p-2 rounded"
                required
              />
              <input
                type="date"
                value={m.dueDate}
                onChange={(e) => handleMilestoneChange(idx, 'dueDate', e.target.value)}
                className="border p-2 rounded"
                required
              />
            </div>
          ))}
          <button
            type="button"
            onClick={addMilestone}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            + Add Milestone
          </button>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Bid'}
        </button>
      </form>

      {error && <p className="text-red-600 mt-4">❌ {error}</p>}
      {success && <p className="text-green-600 mt-4">✅ Bid submitted successfully!</p>}

      {aiAnalysis && (
        <div className="mt-6 p-4 border rounded bg-gray-50">
          <h3 className="font-medium mb-3">🤖 AI Analysis Result</h3>

          {aiAnalysis.verdict && (
            <p className="text-lg font-semibold">
              Verdict:{' '}
              <span
                className={
                  aiAnalysis.verdict === 'Fair'
                    ? 'text-green-600'
                    : aiAnalysis.verdict === 'Overpriced'
                    ? 'text-red-600'
                    : 'text-yellow-600'
                }
              >
                {aiAnalysis.verdict}
              </span>
            </p>
          )}

          {aiAnalysis.priceCheck && (
            <p className="mt-2">
              <strong>Price Check:</strong> {aiAnalysis.priceCheck}
            </p>
          )}

          {aiAnalysis.timelineCheck && (
            <p className="mt-2">
              <strong>Timeline Check:</strong> {aiAnalysis.timelineCheck}
            </p>
          )}

          {aiAnalysis.referenceComparison && (
            <div className="mt-2">
              <strong>Reference Comparison:</strong>
              <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-white p-2 rounded mt-1">
                {JSON.stringify(aiAnalysis.referenceComparison, null, 2)}
              </pre>
            </div>
          )}

          {aiAnalysis.issues && aiAnalysis.issues.length > 0 && (
            <div className="mt-3">
              <strong>⚠ Issues:</strong>
              <ul className="list-disc pl-6 mt-1 text-sm text-red-600">
                {aiAnalysis.issues.map((issue: string, idx: number) => (
                  <li key={idx}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer text-blue-600 text-sm">
              Show full AI JSON
            </summary>
            <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-white p-2 rounded mt-1">
              {JSON.stringify(aiAnalysis, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
