// src/components/AdminProposalsClient.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { getProposals, approveProposal, rejectProposal } from '@/lib/api';

interface Proposal {
  proposalId: number;
  orgName: string;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
  contact: string;
  amountUSD: number;
}

interface AdminProposalsClientProps {
  initialProposals?: Proposal[];
}

const AdminProposalsClient: React.FC<AdminProposalsClientProps> = ({ initialProposals = [] }) => {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
  const [loading, setLoading] = useState(initialProposals.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialProposals.length === 0) {
      fetchProposals();
    }
  }, [initialProposals.length]);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProposals();
      setProposals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch proposals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (proposalId: number) => {
    try {
      setError(null);
      await approveProposal(proposalId);
      setProposals(prev => prev.map(p => 
        p.proposalId === proposalId ? { ...p, status: 'approved' } : p
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve proposal');
    }
  };

  const handleReject = async (proposalId: number) => {
    try {
      setError(null);
      await rejectProposal(proposalId);
      setProposals(prev => prev.map(p => 
        p.proposalId === proposalId ? { ...p, status: 'rejected' } : p
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  };

  if (loading) return <div className="p-4">Loading proposals...</div>;
  if (error) return <div className="p-4 text-red-600">Error: {error}</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Admin - Proposals Management</h1>
      
      <div className="grid gap-4">
        {proposals.map((proposal) => (
          <div key={proposal.proposalId} className="border rounded-lg p-4 bg-white shadow-sm">
            <h3 className="text-lg font-semibold mb-2">{proposal.title}</h3>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <p><span className="font-medium">Organization:</span> {proposal.orgName}</p>
              <p><span className="font-medium">Contact:</span> {proposal.contact}</p>
              <p><span className="font-medium">Budget:</span> ${proposal.amountUSD.toLocaleString()}</p>
              <p>
                <span className="font-medium">Status:</span> 
                <span className={`ml-2 px-2 py-1 rounded text-xs ${
                  proposal.status === 'approved' ? 'bg-green-100 text-green-800' :
                  proposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {proposal.status}
                </span>
              </p>
            </div>
            <p className="text-sm text-gray-600 mb-3">{proposal.summary}</p>
            
            <div className="flex gap-2">
              <button 
                onClick={() => handleApprove(proposal.proposalId)}
                disabled={proposal.status === 'approved'}
                className="px-4 py-2 bg-green-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-green-700 transition-colors"
              >
                Approve
              </button>
              <button 
                onClick={() => handleReject(proposal.proposalId)}
                disabled={proposal.status === 'rejected'}
                className="px-4 py-2 bg-red-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
        
        {proposals.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No proposals found.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminProposalsClient;