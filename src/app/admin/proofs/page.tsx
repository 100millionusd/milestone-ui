// src/app/admin/proofs/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { getSubmittedProofs, approveProof, rejectProof } from '@/lib/api';

interface Proof {
  bidId: number;
  milestoneIndex: number;
  vendorName: string;
  walletAddress: string;
  title: string;
  description: string;
  files: { name: string; url: string }[];
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
}

export default function AdminProofsPage() {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);

  useEffect(() => {
    loadProofs();
  }, []);

  const loadProofs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSubmittedProofs();
      setProofs(data);
    } catch (err) {
      console.error('Error fetching proofs:', err);
      setError('Failed to fetch proofs');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (bidId: number, milestoneIndex: number, action: 'approve' | 'reject') => {
    try {
      setProcessing(bidId);
      if (action === 'approve') {
        await approveProof(bidId, milestoneIndex);
      } else {
        await rejectProof(bidId, milestoneIndex);
      }
      await loadProofs();
    } catch (err) {
      console.error(`Error trying to ${action} proof:`, err);
      alert(`Failed to ${action} proof`);
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading submitted proofs...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Submitted Proofs</h1>

        {proofs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center">
            <p className="text-gray-600">No proofs submitted yet.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {proofs.map((proof) => (
              <div key={`${proof.bidId}-${proof.milestoneIndex}`} className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{proof.title}</h2>
                    <p className="text-gray-600">
                      Vendor: {proof.vendorName} ({proof.walletAddress})
                    </p>
                    <p className="text-sm text-gray-500">
                      Submitted: {new Date(proof.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      proof.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : proof.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {proof.status.charAt(0).toUpperCase() + proof.status.slice(1)}
                  </span>
                </div>

                <div className="mb-4">
                  <h3 className="font-medium text-gray-700 mb-2">Description</h3>
                  <p className="text-gray-600 whitespace-pre-line">{proof.description}</p>
                </div>

                {proof.files.length > 0 && (
                  <div className="mb-4">
                    <h3 className="font-medium text-gray-700 mb-2">Files</h3>
                    <ul className="list-disc list-inside text-blue-600">
                      {proof.files.map((file, idx) => (
                        <li key={idx}>
                          <a href={file.url} target="_blank" rel="noopener noreferrer" className="underline">
                            {file.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {proof.status === 'pending' && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAction(proof.bidId, proof.milestoneIndex, 'approve')}
                      disabled={processing === proof.bidId}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:bg-gray-400"
                    >
                      {processing === proof.bidId ? 'Approving...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleAction(proof.bidId, proof.milestoneIndex, 'reject')}
                      disabled={processing === proof.bidId}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:bg-gray-400"
                    >
                      {processing === proof.bidId ? 'Rejecting...' : 'Reject'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
