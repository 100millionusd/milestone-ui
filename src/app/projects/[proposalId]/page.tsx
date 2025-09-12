// src/app/projects/[proposalId]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids } from '@/lib/api';

export default function ProjectDetailsPage() {
  const { proposalId } = useParams();
  const router = useRouter();

  const [project, setProject] = useState<any | null>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!proposalId) return;

        const [p, allBids] = await Promise.all([
          getProposal(proposalId),
          getBids(),
        ]);

        setProject(p);
        setBids(allBids.filter((b: any) => b.proposalId == proposalId));
      } catch (err) {
        console.error('❌ Error loading project details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [proposalId]);

  if (loading) {
    return <div className="max-w-4xl mx-auto p-6">Loading project details...</div>;
  }

  if (!project) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <p className="text-red-500">Project not found.</p>
        <button
          onClick={() => router.push('/projects')}
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
        >
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Project Info */}
      <div className="border rounded-lg p-6 bg-gray-50">
        <h1 className="text-2xl font-bold mb-2">{project.title}</h1>
        <p className="text-gray-600">Organization: {project.orgName}</p>
        <p className="text-green-600 font-medium mt-2">
          Budget: ${project.amountUSD}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          Status: {project.status}
        </p>
      </div>

      {/* Bids */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Bids</h2>
        {bids.length === 0 ? (
          <p className="text-gray-500 italic">No bids yet.</p>
        ) : (
          <div className="space-y-4">
            {bids.map((bid) => (
              <div
                key={bid.bidId}
                className="border rounded-lg p-4 bg-white shadow-sm"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{bid.vendorName}</p>
                    <p className="text-gray-600">
                      Price: ${bid.priceUSD} • {bid.days} days
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      Wallet: {bid.walletAddress}
                    </p>
                    <p className="mt-2">{bid.notes}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs rounded ${
                      bid.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : bid.status === 'rejected'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {bid.status}
                  </span>
                </div>

                {/* AI Verdict */}
                {bid.aiAnalysis && (
                  <div className="mt-4 p-3 border rounded bg-gray-50 text-sm">
                    <h4 className="font-medium mb-1">🤖 AI Analysis</h4>
                    <pre className="whitespace-pre-wrap text-gray-700">
                      {typeof bid.aiAnalysis === 'string'
                        ? bid.aiAnalysis
                        : JSON.stringify(bid.aiAnalysis, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Milestones */}
                {bid.milestones && bid.milestones.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Milestones</h4>
                    <ul className="space-y-2 text-sm">
                      {bid.milestones.map((m: any, idx: number) => (
                        <li
                          key={idx}
                          className="flex justify-between items-center border-b pb-1"
                        >
                          <span>
                            {m.name} – ${m.amount} due {m.dueDate}
                          </span>
                          {m.completed ? (
                            <span className="text-green-600">✔ Completed</span>
                          ) : (
                            <span className="text-gray-500">⏳ Pending</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Back button */}
      <div>
        <Link
          href="/projects"
          className="bg-gray-500 text-white px-4 py-2 rounded"
        >
          ← Back to Projects
        </Link>
      </div>
    </div>
  );
}
