'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSubmittedProofs, approveMilestone, rejectMilestone } from '@/lib/api';

export default function AdminProofsPage() {
  const [proofs, setProofs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadProofs();
  }, []);

  const loadProofs = async () => {
    try {
      setLoading(true);
      const data = await getSubmittedProofs(); // 👈 API: returns all pending proofs
      setProofs(data);
    } catch (err) {
      console.error('Error loading proofs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (proofId: number, action: 'approve' | 'reject') => {
    setProcessing(proofId);
    try {
      if (action === 'approve') {
        await approveMilestone(proofId);
        alert('✅ Proof approved and payment released!');
      } else {
        await rejectMilestone(proofId);
        alert('❌ Proof rejected.');
      }
      loadProofs();
    } catch (err) {
      console.error('Action failed:', err);
      alert('Action failed, check logs');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading submitted proofs...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📑 Proof Submissions</h1>

        {proofs.length === 0 ? (
          <div className="bg-white p-6 rounded-lg shadow text-center">
            <p className="text-gray-600">No proofs pending review.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {proofs.map((proof) => (
              <div key={proof.id} className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-xl font-semibold mb-2">
                  Bid #{proof.bidId} – {proof.projectTitle}
                </h2>
                <p className="text-gray-600 mb-2">
                  Vendor: {proof.vendorName} ({proof.walletAddress})
                </p>
                <p className="text-gray-800 whitespace-pre-line mb-4">{proof.description}</p>

                {proof.files && proof.files.length > 0 && (
                  <div className="mb-4">
                    <p className="font-medium">Attachments:</p>
                    <ul className="list-disc pl-5">
                      {proof.files.map((file: string, i: number) => (
                        <li key={i}>
                          <a
                            href={file}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {file}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => handleAction(proof.id, 'approve')}
                    disabled={processing === proof.id}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:bg-gray-400"
                  >
                    {processing === proof.id ? 'Approving...' : 'Approve & Release Payment'}
                  </button>
                  <button
                    onClick={() => handleAction(proof.id, 'reject')}
                    disabled={processing === proof.id}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:bg-gray-400"
                  >
                    {processing === proof.id ? 'Rejecting...' : 'Reject'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
