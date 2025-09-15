// src/app/projects/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listProposals, getBids, archiveProposal } from '@/lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiving, setArchiving] = useState<Record<number, boolean>>({}); // proposalId -> busy

  useEffect(() => {
    (async () => {
      try {
        const [proposalsData, bidsData] = await Promise.all([
          // includeArchived=true so Archived section actually has data
          listProposals({ includeArchived: true }),
          getBids(),
        ]);
        setProjects(proposalsData);
        setBids(bidsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const getBidsForProject = (projectId: number) =>
    bids.filter((bid: any) => bid.proposalId === projectId);

  const isProjectCompleted = (project: any) => {
    if (project.status === 'completed') return true;
    const projectBids = getBidsForProject(project.proposalId);
    const acceptedBid = projectBids.find((b: any) => b.status === 'approved');
    if (!acceptedBid) return false;
    if (Array.isArray(acceptedBid.milestones) && acceptedBid.milestones.length > 0) {
      return acceptedBid.milestones.every((m: any) => m.completed === true);
    }
    if (acceptedBid.status === 'completed') return true;
    return false;
  };

  const handleArchive = async (proposalId: number) => {
    const ok = confirm('Archive this completed project?');
    if (!ok) return;

    // optimistic UI
    setArchiving((m) => ({ ...m, [proposalId]: true }));
    setProjects((prev) =>
      prev.map((p) =>
        p.proposalId === proposalId ? { ...p, status: 'archived' } : p
      )
    );

    try {
      await archiveProposal(proposalId);
    } catch (err: any) {
      // rollback on error
      alert(`Failed to archive: ${err?.message || err}`);
      setProjects((prev) =>
        prev.map((p) =>
          p.proposalId === proposalId ? { ...p, status: 'completed' } : p
        )
      );
    } finally {
      setArchiving((m) => ({ ...m, [proposalId]: false }));
    }
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6">Loading projects...</div>;
  }

  // Sections
  const archivedProjects = projects.filter((p) => p.status === 'archived');
  const completedProjects = projects.filter(
    (p) => p.status === 'completed' || (p.status === 'approved' && isProjectCompleted(p))
  );
  const activeProjects = projects.filter(
    (p) => p.status === 'approved' && !isProjectCompleted(p)
  );

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Active */}
      <h1 className="text-2xl font-bold mb-6">Active Projects</h1>
      <div className="space-y-6">
        {activeProjects.map((project) => {
          const projectBids = getBidsForProject(project.proposalId);
          const acceptedBid = projectBids.find((bid) => bid.status === 'approved');

          return (
            <div key={project.proposalId} className="border rounded-lg p-6 hover:shadow-md transition">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="font-semibold text-xl">{project.title}</h2>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                      Active
                    </span>
                  </div>
                  <p className="text-gray-600">{project.orgName}</p>
                  <p className="text-green-600 font-medium text-lg mt-2">
                    Budget: ${project.amountUSD}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-3">
                    {projectBids.length} {projectBids.length === 1 ? 'bid' : 'bids'} •{' '}
                    {acceptedBid ? 'Contract awarded' : 'Accepting bids'}
                  </p>
                  <div className="space-x-2">
                    <Link
                      href={`/projects/${project.proposalId}`}
                      className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                    >
                      View Project
                    </Link>
                    {!acceptedBid && (
                      <Link
                        href={`/bids/new?proposalId=${project.proposalId}`}
                        className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
                      >
                        Submit a Bid
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {activeProjects.length === 0 && (
          <p className="text-gray-500 italic">There are no active projects at the moment.</p>
        )}
      </div>

      {/* Completed */}
      <h2 className="text-2xl font-bold mt-12 mb-6">Completed Projects</h2>
      <div className="space-y-6">
        {completedProjects.map((project) => (
          <div key={project.proposalId} className="border rounded-lg p-6 bg-gray-50 hover:shadow-sm transition">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold text-xl">{project.title}</h2>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                Completed
              </span>
            </div>
            <p className="text-gray-600">{project.orgName}</p>
            <p className="text-green-600 font-medium text-lg mt-2">
              Budget: ${project.amountUSD}
            </p>
            <p className="text-sm text-gray-500 mt-3">✅ This project has been fully completed.</p>
            <div className="mt-3 flex gap-2">
              <Link
                href={`/projects/${project.proposalId}`}
                className="text-blue-600 text-sm hover:underline inline-flex items-center"
              >
                View Project Details →
              </Link>
              <button
                onClick={() => handleArchive(project.proposalId)}
                disabled={!!archiving[project.proposalId]}
                className="text-sm px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                title="Move this project to Archived"
              >
                {archiving[project.proposalId] ? 'Archiving…' : 'Archive'}
              </button>
            </div>
          </div>
        ))}
        {completedProjects.length === 0 && (
          <p className="text-gray-500 italic">No completed projects yet.</p>
        )}
      </div>

      {/* Archived */}
      <h2 className="text-2xl font-bold mt-12 mb-6">Archived Projects</h2>
      <div className="space-y-6">
        {archivedProjects.map((project) => (
          <div key={project.proposalId} className="border rounded-lg p-6 bg-amber-50 hover:shadow-sm transition">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold text-xl">{project.title}</h2>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                Archived
              </span>
            </div>
            <p className="text-gray-600">{project.orgName}</p>
            <p className="text-green-600 font-medium text-lg mt-2">
              Budget: ${project.amountUSD}
            </p>
            <p className="text-sm text-amber-800 mt-3">🗄️ This project is archived.</p>
            <Link
              href={`/projects/${project.proposalId}`}
              className="text-blue-600 text-sm hover:underline mt-2 inline-block"
            >
              View Project Details →
            </Link>
          </div>
        ))}
        {archivedProjects.length === 0 && (
          <p className="text-gray-600 italic">No archived projects.</p>
        )}
      </div>
    </div>
  );
}
