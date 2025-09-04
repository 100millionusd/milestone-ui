'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { postJSON, uploadFileToIPFS, getProposal } from "@/lib/api";

// Renamed from NewBidPage to NewBidPageContent
function NewBidPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proposalId = searchParams.get('proposalId');
  
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<any>(null);
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
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (proposalId) {
      loadProposal();
    }
  }, [proposalId]);

  const loadProposal = async () => {
    try {
      const proposalData = await getProposal(parseInt(proposalId!));
      setProposal(proposalData);
    } catch (error) {
      console.error('Error loading proposal:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposalId) {
      alert('Proposal ID is required');
      return;
    }

    setLoading(true);

    try {
      let doc = null;
      if (file) {
        const uploadResult = await uploadFileToIPFS(file);
        doc = {
          cid: uploadResult.cid,
          url: uploadResult.url,
          name: file.name,
          size: file.size
        };
      }

      const body = {
        proposalId: parseInt(proposalId),
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
        })),
        doc
      };

      const resp = await postJSON("/bids", body);
      
      if (resp.ok) {
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

  if (!proposalId) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Proposal ID is required to submit a bid. Please go back to the project page and click "Submit Bid".
        </div>
        <button
          onClick={() => router.back()}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center">Loading proposal details...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
        <h2 className="text-lg font-semibold text-blue-800">Bidding on: {proposal.title}</h2>
        <p className="text-blue-600">Organization: {proposal.orgName}</p>
        <p className="text-blue-600">Budget: ${proposal.amountUSD?.toLocaleString()}</p>
      </div>

      <h1 className="text-2xl font-bold mb-6">Submit Your Bid</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Your Company Name *</label>
            <input
              type="text"
              required
              value={formData.vendorName}
              onChange={(e) => setFormData({...formData, vendorName: e.target.value})}
              className="w-full p-2 border rounded"
              placeholder="Your company or organization name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Total Bid Amount (USD) *</label>
            <input
              type="number"
              required
              step="0.01"
              value={formData.priceUSD}
              onChange={(e) => setFormData({...formData, priceUSD: e.target.value})}
              className="w-full p-2 border rounded"
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Completion Timeline (Days) *</label>
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
            <label className="block text-sm font-medium mb-1">Payment Currency *</label>
            <select
              value={formData.preferredStablecoin}
              onChange={(e) => setFormData({...formData, preferredStablecoin: e.target.value as 'USDT' | 'USDC'})}
              className="w-full p-2 border rounded"
            >
              <option value="USDT">USDT (Tether)</option>
              <option value="USDC">USDC (USD Coin)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Your Wallet Address *</label>
          <input
            type="text"
            required
            placeholder="0x..."
            value={formData.walletAddress}
            onChange={(e) => setFormData({...formData, walletAddress: e.target.value})}
            className="w-full p-2 border rounded font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            We will send {formData.preferredStablecoin} payments to this Ethereum address
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Bid Proposal Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({...formData, notes: e.target.value})}
            className="w-full p-2 border rounded"
            rows={4}
            placeholder="Describe your approach, timeline, expertise, and why you're the best choice for this project..."
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold">Payment Milestones *</h3>
            <button
              type="button"
              onClick={addMilestone}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
            >
              + Add Milestone
            </button>
          </div>

          <div className="space-y-4">
            {milestones.map((milestone, index) => (
              <div key={index} className="border rounded p-4 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Milestone Name *</label>
                    <input
                      type="text"
                      required
                      value={milestone.name}
                      onChange={(e) => updateMilestone(index, 'name', e.target.value)}
                      className="w-full p-2 border rounded"
                      placeholder="e.g., Design Phase, Development, Testing"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Amount ($) *</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={milestone.amount}
                      onChange={(e) => updateMilestone(index, 'amount', e.target.value)}
                      className="w-full p-2 border rounded"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Due Date *</label>
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
                    className="mt-3 text-red-600 text-sm hover:text-red-800"
                  >
                    Remove Milestone
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Supporting Document (Optional)</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full p-2 border rounded"
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
          />
          <p className="text-xs text-gray-500 mt-1">
            Upload a detailed proposal document (PDF, Word, images) - Max 50MB
          </p>
        </div>

        <div className="flex gap-4 pt-4 border-t">
          <button
            type="submit"
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Submitting Bid...' : 'Submit Bid'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-lg"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ADD THIS SUSPENSE WRAPPER AS THE DEFAULT EXPORT
export default function NewBidPage() {
  return (
    <Suspense fallback={<div>Loading bid form...</div>}>
      <NewBidPageContent />
    </Suspense>
  );
}