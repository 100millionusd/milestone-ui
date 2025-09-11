// src/app/projects/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProposals, getBids } from '@/lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [proposalsData, bidsData] = await Promise.all([
          getProposals(),
          getBids()
        ]);

        // only proposals that were approved are actual projects
        const approvedProjects = proposalsData.filter((p: any) => p.status === 'approved' || p.status === 'completed');
        setProjects(approvedProjects);
        setBids(bidsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getBidsForProject = (projectId: number) => {
    return bids.filter((bid) => bid.proposalId === projectId);
  };

  const isProjectCompleted = (project: any) => {
    // Case 1: proposal explicitly marked completed
    if (project.status === 'completed') return true;

    // Case 2: project has an accepted bid with all milestones done
    const projectBids = getBidsForProject(project.proposalId);
    const acceptedBid = projectBids.find((bid) => bid.status === 'approved');

    if (acceptedBid && acceptedBid.milestones?.length) {
      return acceptedBid.milestones.every((m: any) => m.completed);
    }

    return false;
  };

  if (loading) return <div className="max-w-6xl mx-auto p-6">Loading projects...</div>;

  const activeProjects = projects.filter((p) => p.status === 'approved' && !isProjectCompleted(p));
  const completedProjects = projects.filter((p) => isProjectCompleted(p));

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Active Projects */}
      <h1 className="text-2xl font-bold mb-6">Active Projects</h1>
      <div className="space-y-6">
        {activeProjects.map((project) => {
          const projectBids = getBidsForProject(project.proposalId);
          const acceptedBid = projectBids.find((bid) => bid.status === 'approved');

          return (
            <div key={project.proposalId} className="border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="font-semibold text-xl mb-2">{project.title}</h2>
                  <p className="text-gray-600 mb-1">{project.orgName}</p>
                  <p className="text-green-600 font-medium text-lg">Budget: ${project.amountUSD}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">
                    {projectBids.length} bids • {acceptedBid ? 'Contract awarded' : 'Accepting bids'}
                  </p>
                  <div className="space-x-2">
                    <Link
                      href={`/projects/${project.proposalId}`}
                      className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                    >
                      View Details
                    </Link>
                    {!acceptedBid && (
                      <Link
                        href={`/bids/new?proposalId=${project.proposalId}`}
                        className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
                      >
                        Submit Bid
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {acceptedBid && (
                <div className="bg-gray-50 p-3 rounded mt-3">
                  <h4 className="font-medium mb-2">Accepted Bid:</h4>
                  <p className="text-sm">
                    <strong>{acceptedBid.vendorName}</strong> • ${acceptedBid.priceUSD} • {acceptedBid.days} days
                  </p>
                  <Link
                    href={`/admin/proposals/${project.proposalId}/bids/${acceptedBid.bidId}`}
                    className="text-blue-600 text-sm hover:underline mt-2 inline-block"
                  >
                    Manage project →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {activeProjects.length === 0 && (
        <div className="text-center py-12 text-gray-500">No active projects available for bidding.</div>
      )}

      {/* Completed Projects */}
      <h1 className="text-2xl font-bold mt-12 mb-6">Completed Projects</h1>
      <div className="space-y-6">
        {completedProjects.map((project) => {
          const projectBids = getBidsForProject(project.proposalId);
          const acceptedBid = projectBids.find((bid) => bid.status === 'approved');

          return (
            <div key={project.proposalId} className="border rounded-lg p-6 bg-gray-50">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="font-semibold text-xl mb-2">{project.title}</h2>
                  <p className="text-gray-600 mb-1">{project.orgName}</p>
                  <p className="text-green-600 font-medium text-lg">Budget: ${project.amountUSD}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">
                    {projectBids.length} bids • Completed
                  </p>
                  <Link
                    href={`/projects/${project.proposalId}`}
                    className="bg-gray-600 text-white px-4 py-2 rounded text-sm hover:bg-gray-700"
                  >
                    View Details
                  </Link>
                </div>
              </div>

              {acceptedBid && (
                <div className="bg-white p-3 rounded mt-3">
                  <h4 className="font-medium mb-2">Final Bid:</h4>
                  <p className="text-sm">
                    <strong>{acceptedBid.vendorName}</strong> • ${acceptedBid.priceUSD} • {acceptedBid.days} days
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {completedProjects.length === 0 && (
        <div className="text-center py-12 text-gray-500">No completed projects yet.</div>
      )}
    </div>
  );
}
