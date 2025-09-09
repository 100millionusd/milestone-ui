'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getSubmittedProofs } from '@/lib/api';

export default function VendorProofHistoryPage() {
  const params = useParams();
  const router = useRouter();
  const [proofs, setProofs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const bidId = params.bidId as string;

  useEffect(() => {
    if (bidId) {
      loadProofs();
    }
  }, [bidId]);

  const loadProofs = async () => {
    try {
      setLoading(true);
      const data = await getSubmittedProofs();
      const filtered = data.filter((p) => p.bidId === parseInt(bidId));
      setProofs(filtered);
    } catch (err) {
      console.error('Error fetching proofs:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading proofs...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => router.back()}
          className="mb-4 text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold mb-6">Your Submitted Proofs</h1>

        {proofs.length === 0 ? (
          <div className="bg-white p-6 rounded shadow-sm text-center">
            <p className="text-gray-600">No proofs submitted yet for this bid.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {proofs.map((proof, idx) => (
              <div key={idx} className="bg-white p-6 rounded shadow-sm">
                <p className="font-semibold text-lg">{proof.title}</p>
                <p className="text-gray-600 mb-2">{proof.description}</p>
                {proof.files.length > 0 && (
                  <ul className="list-disc list-inside text-blue-600 mb-2">
                    {proof.files.map((f, i) => (
                      <li key={i}>
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline">
                          {f.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <p
                  className={`px-3 py-1 rounded-full text-sm inline-block ${
                    proof.status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : proof.status === 'rejected'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {proof.status}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
