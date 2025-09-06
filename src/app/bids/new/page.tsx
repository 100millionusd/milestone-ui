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
        {/* ... (keep all your form JSX exactly as before) ... */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Vendor Name *</label>
            <input
              type="text"
              required
              value={formData.vendorName}
              onChange={(e) => setFormData({...formData, vendorName: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bid Price (USD) *</label>
            <input
              type="number"
              step="0.01"
              required
              value={formData.priceUSD}
              onChange={(e) => setFormData({...formData, priceUSD: e.target.value})}
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        {/* ... (rest of your form) ... */}

        <div className="flex gap-4">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded disabled:bg-gray-400"
          >
            {loading ? 'Submitting...' : 'Submit Bid'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-500 text-white px-6 py-2 rounded"
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