// src/components/SubmitBidForm.tsx
'use client';

import React, { useState } from 'react';
import { createBid } from '@/lib/api';

interface SubmitBidFormProps {
  proposalId: number;
  onSuccess: () => void;
}

const SubmitBidForm: React.FC<SubmitBidFormProps> = ({ proposalId, onSuccess }) => {
  const [formData, setFormData] = useState({
    vendorName: '',
    priceUSD: '',
    days: '',
    notes: '',
    walletAddress: '',
    preferredStablecoin: 'USDT' as 'USDT' | 'USDC',
  });
  const [milestones, setMilestones] = useState([
    { name: '', amount: '', dueDate: '' }
  ]);
  const [loading, setLoading] = useState(false);

  const addMilestone = () => {
    setMilestones([...milestones, { name: '', amount: '', dueDate: '' }]);
  };

  const updateMilestone = (index: number, field: string, value: string) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const bidData = {
        proposalId,
        vendorName: formData.vendorName,
        priceUSD: parseFloat(formData.priceUSD),
        days: parseInt(formData.days),
        notes: formData.notes,
        walletAddress: formData.walletAddress,
        preferredStablecoin: formData.preferredStablecoin,
        milestones: milestones.map(m => ({
          name: m.name,
          amount: parseFloat(m.amount),
          dueDate: m.dueDate
        }))
      };

      await createBid(bidData);
      onSuccess();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to submit bid');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Company Name</label>
          <input
            type="text"
            required
            value={formData.vendorName}
            onChange={(e) => setFormData({...formData, vendorName: e.target.value})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Total Price (USD)</label>
          <input
            type="number"
            required
            step="0.01"
            value={formData.priceUSD}
            onChange={(e) => setFormData({...formData, priceUSD: e.target.value})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Timeline (Days)</label>
          <input
            type="number"
            required
            value={formData.days}
            onChange={(e) => setFormData({...formData, days: e.target.value})}
            className="w-full p-2 border rounded"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Stablecoin</label>
          <select
            value={formData.preferredStablecoin}
            onChange={(e) => setFormData({...formData, preferredStablecoin: e.target.value as 'USDT' | 'USDC'})}
            className="w-full p-2 border rounded"
          >
            <option value="USDT">USDT</option>
            <option value="USDC">USDC</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Wallet Address</label>
        <input
          type="text"
          required
          placeholder="0x..."
          value={formData.walletAddress}
          onChange={(e) => setFormData({...formData, walletAddress: e.target.value})}
          className="w-full p-2 border rounded font-mono text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">Your {formData.preferredStablecoin} address for payments</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          className="w-full p-2 border rounded"
          rows={3}
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Payment Milestones</h3>
          <button
            type="button"
            onClick={addMilestone}
            className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
          >
            + Add Milestone
          </button>
        </div>

        <div className="space-y-3">
          {milestones.map((milestone, index) => (
            <div key={index} className="border rounded p-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Milestone Name</label>
                  <input
                    type="text"
                    required
                    value={milestone.name}
                    onChange={(e) => updateMilestone(index, 'name', e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Amount ($)</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={milestone.amount}
                    onChange={(e) => updateMilestone(index, 'amount', e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Due Date</label>
                  <input
                    type="date"
                    required
                    value={milestone.dueDate}
                    onChange={(e) => updateMilestone(index, 'dueDate', e.target.value)}
                    className="w-full p-2 border rounded"
                  />
                </div>
              </div>
              {milestones.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMilestone(index)}
                  className="mt-2 text-red-600 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-green-600 text-white px-6 py-2 rounded disabled:bg-gray-400"
      >
        {loading ? 'Submitting...' : 'Submit Bid'}
      </button>
    </form>
  );
};

export default SubmitBidForm;