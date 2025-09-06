// src/app/bids/new/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBid, uploadFileToIPFS, getProposal } from '@/lib/api';

// Wrap the main component with Suspense
function NewBidPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proposalId = searchParams.get('proposalId');
  
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [formData, setFormData] = useState({
    proposalId: proposalId ? parseInt(proposalId) : '',
    vendorName: '',
    priceUSD: '',
    days: '',
    notes: '',
    walletAddress: '',
    preferredStablecoin: 'USDC',
    milestones: [
      { name: 'Milestone 1', amount: '', dueDate: '', proof: '' }
    ]
  });
  const [docFile, setDocFile] = useState(null);

  useEffect(() => {
    if (proposalId) {
      getProposal(proposalId)
        .then(setProposal)
        .catch(console.error);
    }
  }, [proposalId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let doc = null;
      if (docFile) {
        const uploadResult = await uploadFileToIPFS(docFile);
        doc = {
          cid: uploadResult.cid,
          url: uploadResult.url,
          name: docFile.name,
          size: docFile.size
        };
      }

      const body = {
        ...formData,
        priceUSD: parseFloat(formData.priceUSD),
        days: parseInt(formData.days),
        milestones: formData.milestones.map(m => ({
          ...m,
          amount: parseFloat(m.amount),
          dueDate: new Date(m.dueDate).toISOString()
        })),
        doc
      };

      const res = await createBid(body);
      
      if (res.bidId) {
        router.push(`/projects/${proposalId}`);
      }
    } catch (error) {
      console.error('Error creating bid:', error);
      alert('Failed to create bid: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const addMilestone = () => {
    setFormData(prev => ({
      ...prev,
      milestones: [...prev.milestones, { name: `Milestone ${prev.milestones.length + 1}`, amount: '', dueDate: '', proof: '' }]
    }));
  };

  const removeMilestone = (index: number) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.filter((_, i) => i !== index)
    }));
  };

  const updateMilestone = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      milestones: prev.milestones.map((milestone, i) =>
        i === index ? { ...milestone, [field]: value } : milestone
      )
    }));
  };

  if (!proposalId) {
    return <div className="max-w-4xl mx-auto p-6">No project selected. Please go back to projects and click "Submit Bid".</div>;
  }

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
              onChange={(e) => setFormData({...formData, vendorName: e.target.value})}
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
              onChange={(e) => setFormData({...formData, walletAddress: e.target.value})}
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
              type="number"
              step="0.01"
              required
              value={formData.priceUSD}
              onChange={(e) => setFormData({...formData, priceUSD: e.target.value})}
              className="w-full p-2 border rounded"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Completion Days *</label>
            <input
              type="number"
              required
              value={formData.days}
              onChange={(e) => setFormData({...formData, days: e.target.value})}
              className="w-full p-2 border rounded"
              placeholder="30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Preferred Stablecoin *</label>
            <select
              required
              value={formData.preferredStablecoin}
              onChange={(e) => setFormData({...formData, preferredStablecoin: e.target.value})}
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
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            className="w-full p-2 border rounded"
            rows={4}
            placeholder="Describe your approach, timeline, experience, why you're the best choice for this project..."
          />
        </div>

        {/* Milestones */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <label className="block text-sm font-medium">Project Milestones *</label>
            <button
              type="button"
              onClick={addMilestone}
              className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
            >
              + Add Milestone
            </button>
          </div>
          
          <div className="space-y-4">
            {formData.milestones.map((milestone, index) => (
              <div key={index} className="border p-4 rounded-lg bg-gray-50">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium">Milestone {index + 1}</h4>
                  {formData.milestones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeMilestone(index)}
                      className="text-red-600 text-sm hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Milestone Name *</label>
                    <input
                      type="text"
                      required
                      value={milestone.name}
                      onChange={(e) => updateMilestone(index, 'name', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="Design completion"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Amount ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={milestone.amount}
                      onChange={(e) => updateMilestone(index, 'amount', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Due Date *</label>
                    <input
                      type="date"
                      required
                      value={milestone.dueDate}
                      onChange={(e) => updateMilestone(index, 'dueDate', e.target.value)}
                      className="w-full p-2 border rounded text-sm"
                    />
                  </div>
                </div>
                
                <div className="mt-3">
                  <label className="block text-xs font-medium mb-1">Success Criteria *</label>
                  <input
                    type="text"
                    required
                    value={milestone.proof}
                    onChange={(e) => updateMilestone(index, 'proof', e.target.value)}
                    className="w-full p-2 border rounded text-sm"
                    placeholder="What proves this milestone is complete?"
                  />
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
            onChange={(e) => setDocFile(e.target.files?.[0] || null)}
            className="w-full p-2 border rounded"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          />
          <p className="text-sm text-gray-500 mt-1">
            Upload portfolio, previous work examples, certifications, or other supporting documents (PDF, Word, Images)
          </p>
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-8 py-3 rounded-lg disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Submitting Bid...' : 'Submit Bid'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-500 text-white px-6 py-3 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// Main export with Suspense boundary
export default function NewBidPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto p-6">Loading bid form...</div>}>
      <NewBidPageContent />
    </Suspense>
  );
}