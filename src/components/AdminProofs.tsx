'use client';

import { useEffect, useState } from 'react';
import { getProofs, approveProof, rejectProof } from '@/lib/api';

interface ProofFile {
  name: string;
  url: string;
}

interface Proof {
  bidId: number;
  proposalId: number;
  vendorName: string;
  milestoneName: string;
  amount: number;
  dueDate: string;
  files?: ProofFile[];
  description?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export default function AdminProofs() {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProofs();
  }, []);

  const loadProofs = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProofs();
      setProofs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proofs');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (bidId: number, milestoneIndex: number) => {
    await approveProof(bidId, milestoneIndex);
    loadProofs();
  };

  const handleReject = async (bidId: number, milestoneIndex: number) => {
    await rejectProof(bidId, milestoneIndex);
    loadProofs();
  };

  if (loading) return <div className="p-6">Loading proofs...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Admin — Proofs</h1>
      <div className="grid gap-6">
        {proofs.map((proof, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow border p-6">
            <h2 className="text-lg font-semibold mb-2">
              {proof.vendorName} — Proposal #{proof.proposalId}
            </h2>
            <p className="text-sm text-gray-600 mb-2">
              Milestone: {proof.milestoneName} | Amount: ${proof.amount} | Due:{' '}
              {new Date(proof.dueDate).toLocaleDateString()}
            </p>
            <p className="text-gray-700 mb-3">{proof.description || 'No description'}</p>

            {/* ✅ Attachments */}
            {proof.files?.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {proof.files.map((file, i) => {
                  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || file.url);
                  if (isImage) {
                    return (
                      <a
                        key={i}
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative overflow-hidden rounded border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={file.url}
                          alt={file.name}
                          className="h-32 w-full object-cover group-hover:scale-105 transition"
                        />
                        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
                          {file.name}
                        </div>
                      </a>
                    );
                  }
                  return (
                    <div key={i} className="p-3 rounded border bg-gray-50">
                      <p className="truncate text-sm">{file.name}</p>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Open
                      </a>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Status + actions */}
            <div className="flex gap-2">
              <span
                className={`px-2 py-1 text-xs rounded ${
                  proof.status === 'approved'
                    ? 'bg-green-100 text-green-700'
                    : proof.status === 'rejected'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-yellow-100 text-yellow-700'
                }`}
              >
                {proof.status}
              </span>
              <button
                onClick={() => handleApprove(proof.bidId, idx)}
                disabled={proof.status === 'approved'}
                className="px-3 py-1 text-sm bg-emerald-600 text-white rounded disabled:bg-gray-300"
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(proof.bidId, idx)}
                disabled={proof.status === 'rejected'}
                className="px-3 py-1 text-sm bg-rose-600 text-white rounded disabled:bg-gray-300"
              >
                Reject
              </button>
            </div>
          </div>
        ))}

        {proofs.length === 0 && (
          <div className="text-gray-500 text-center py-10 border rounded bg-white">
            No proofs submitted yet.
          </div>
        )}
      </div>
    </div>
  );
}
