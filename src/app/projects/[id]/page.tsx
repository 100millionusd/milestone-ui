// src/app/projects/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids } from '@/lib/api';

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id;

  const [project, setProject] = useState<any>(null);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projectData, bidsData] = await Promise.all([
          getProposal(projectId),
          getBids(projectId),
        ]);
        setProject(projectData);
        setBids(bidsData);
      } catch (error) {
        console.error('Error fetching project:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [projectId]);

  if (loading) return <div>Loading project...</div>;
  if (!project) return <div>Project not found</div>;

  // ✅ Helper to check if project is completed
  const isProjectCompleted = (project: any, bids: any[]) => {
    if (project.status === 'completed') return true;
    const acceptedBid = bids.find((b: any) => b.status === 'approved');
    if (!acceptedBid) return false;
    if (!acceptedBid.milestones || acceptedBid.milestones.length === 0) return false;
    return acceptedBid.milestones.every((m: any) => m.completed === true);
  };

  const completed = isProjectCompleted(project, bids);

  const renderAttachment = (doc: any, idx: number) => {
    if (!doc) return null;
    const href = doc.url || (doc.cid ? `${GATEWAY}/${doc.cid}` : '#');
    const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(doc.name || href);

    if (isImage) {
      return (
        <button
          key={idx}
          onClick={() => setLightbox(href)}
          className="group relative overflow-hidden rounded border"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={doc.name}
            className="h-24 w-24 object-cover group-hover:scale-105 transition"
          />
        </button>
      );
    }

    return (
      <div
        key={idx}
        className="p-2 rounded border bg-gray-50 text-xs text-gray-700"
      >
        <p className="truncate">{doc.name}</p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline"
        >
          Open
        </a>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-2xl font-bold">{project.title}</h1>
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                completed
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {completed ? 'Completed' : 'Active'}
            </span>
          </div>
          <p className="text-gray-600">{project.orgName}</p>
          <p className="text-green-600 font-medium text-lg">
            Budget: ${project.amountUSD}
          </p>
        </div>
        {!completed && (
          <Link
            href={`/bids/new?proposalId=${projectId}`}
            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
          >
            Submit Bid
          </Link>
        )}
      </div>

      {/* ✅ Project Description */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Project Description</h2>
        <p className="text-gray-700">{project.summary}</p>
      </div>

      {/* ✅ Project Attachments */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Project Attachments</h2>
        {project.docs?.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {project.docs.map((doc: any, i: number) => renderAttachment(doc, i))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No attachments provided.</p>
        )}
      </div>

      {/* ✅ Bids */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-3">Bids ({bids.length})</h2>
        {bids.length > 0 ? (
          <div className="space-y-3">
            {bids.map((bid) => (
              <div key={bid.bidId} className="border p-4 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">{bid.vendorName}</h3>
                    <p className="text-gray-600">
                      ${bid.priceUSD} • {bid.days} days
                    </p>
                    <p className="text-sm text-gray-500">{bid.notes}</p>

                    {/* ✅ Bid Attachments */}
                    {bid.doc || bid.docs ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(bid.docs || [bid.doc]).map((d: any, i: number) =>
                          renderAttachment(d, i)
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 mt-2">
                        No attachments
                      </p>
                    )}

                    {/* 🔹 Agent 2 Analysis */}
                    {bid.aiAnalysis ? (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <h4 className="font-semibold text-sm mb-1">
                          Agent 2 Analysis
                        </h4>
                        <p>
                          <span className="font-medium">Verdict:</span>{' '}
                          {bid.aiAnalysis.verdict}
                        </p>
                        <p>
                          <span className="font-medium">Reasoning:</span>{' '}
                          {bid.aiAnalysis.reasoning}
                        </p>
                        {bid.aiAnalysis.suggestions?.length > 0 && (
                          <ul className="list-disc list-inside mt-1 text-sm text-gray-700">
                            {bid.aiAnalysis.suggestions.map((s: string, i: number) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-gray-400 italic">
                        ⏳ Analysis pending...
                      </p>
                    )}
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
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
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">
            No bids yet. Be the first to bid on this project!
          </p>
        )}
      </div>

      <Link href="/projects" className="text-blue-600 hover:underline">
        ← Back to Projects
      </Link>

      {/* ✅ Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="attachment preview"
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 text-white text-2xl"
            onClick={() => setLightbox(null)}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
