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
          getBids(),
        ]);

        // Only approved proposals become projects
        const approvedProjects = proposalsData.filter(
          (p: any) => p.status === 'approved'
        );
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
    return bids.filter((bid: any) => bid.proposalId === projectId);
  };

  const isProjectCompleted = (projectId: number) => {
    const projectBids = getBidsForProject(projectId);
    const acceptedBid = projectBids.find((b: any) => b.status === 'approved');
    if (!acceptedBid) return false;
    if (!acceptedBid.milestones || acceptedBid.milestones.length === 0) return false;

    // ✅ Completed if all milestones are marked completed
    return acceptedBid.milestones.every((m: any) => m.completed === true);
  };

  if (loading)
    return <div className="max-w-6xl mx-auto p-6">Loading projects...</div>;

  const activeProjects = projects.filter((p) => !isProjectCompleted(p.proposalId));
  const completedProjects = projects.filter((p) => isProjectCompleted(p.proposalId));

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
                  <p className="text-green-600 font-medium text-lg">
                    Budget: ${project.amountUSD}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">
                    {projectBids.length} bids •{' '}
                    {acceptedBid ? 'Contract awarded' : 'Accepting bids'}
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
            </div>
          );
        })}
        {activeProjects.length === 0 && (
          <p className="text-gray-500">No active projects.</p>
        )}
      </div>

      {/* Completed Projects */}
      <h2 className="text-2xl font-bold mt-12 mb-6">Completed Projects</h2>
      <div className="space-y-6">
        {completedProjects.map((project) => (
          <div key={project.proposalId} className="border rounded-lg p-6 bg-gray-50">
            <h2 className="font-semibold text-xl mb-2">{project.title}</h2>
            <p className="text-gray-600 mb-1">{project.orgName}</p>
            <p className="text-green-600 font-medium text-lg">
              Budget: ${project.amountUSD}
            </p>
            <p className="text-sm text-gray-500 mt-2">✅ Project Completed</p>
            <Link
              href={`/projects/${project.proposalId}`}
              className="text-blue-600 text-sm hover:underline mt-2 inline-block"
            >
              View details →
            </Link>
          </div>
        ))}
        {completedProjects.length === 0 && (
          <p className="text-gray-500">No completed projects yet.</p>
        )}
      </div>
    </div>
  );
}
