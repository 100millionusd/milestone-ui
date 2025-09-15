// src/app/projects/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { listProposals, getBids } from '@/lib/api';

type TabKey = 'active' | 'completed' | 'archived';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('active');

  useEffect(() => {
    (async () => {
      try {
        // ✅ include archived so the Archived tab has data
        const [proposalsData, bidsData] = await Promise.all([
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

    // If bid has milestones, all must be completed
    if (Array.isArray(acceptedBid.milestones) && acceptedBid.milestones.length > 0) {
      return acceptedBid.milestones.every((m: any) => m.completed === true);
    }
    // Or bid is explicitly completed
    if (acceptedBid.status === 'completed') return true;

    return false;
  };

  const { activeProjects, completedProjects, archivedProjects } = useMemo(() => {
    const archived = projects.filter((p) => p.status === 'archived');
    const completed = projects.filter(
      (p) => p.status === 'completed' || (p.status === 'approved' && isProjectCompleted(p))
    );
    const active = projects.filter((p) => p.status === 'approved' && !isProjectCompleted(p));
    return { activeProjects: active, completedProjects: completed, archivedProjects: archived };
  }, [projects, bids]);

  const counts = {
    active: activeProjects.length,
    completed: completedProjects.length,
    archived: archivedProjects.length,
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto p-6">Loading projects...</div>;
  }

  const TabButton = ({ tab, label }: { tab: TabKey; label: string }) => {
    const selected = activeTab === tab;
    return (
      <button
        onClick={() => setActiveTab(tab)}
        className={[
          'px-4 py-2 text-sm font-medium rounded-lg transition',
          selected
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-600 hover:text-slate-900 hover:bg-white/70',
        ].join(' ')}
        aria-pressed={selected}
      >
        {label}
        <span className="ml-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {counts[tab]}
        </span>
      </button>
    );
  };

  const renderProjectCard = (project: any, badgeColor: string, badgeText: string) => {
    const projectBids = getBidsForProject(project.proposalId);
    const acceptedBid = projectBids.find((bid) => bid.status === 'approved');

    return (
      <div key={project.proposalId} className="border rounded-lg p-6 hover:shadow-md transition">
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold text-xl">{project.title}</h2>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badgeColor}`}>
                {badgeText}
              </span>
            </div>
            <p className="text-gray-600">{project.orgName}</p>
            <p className="text-green-600 font-medium text-lg mt-2">
              Budget: ${project.amountUSD}
            </p>
          </div>
          <div className="text-right">
            {badgeText === 'Active' && (
              <p className="text-sm text-gray-500 mb-3">
                {projectBids.length} {projectBids.length === 1 ? 'bid' : 'bids'} •{' '}
                {acceptedBid ? 'Contract awarded' : 'Accepting bids'}
              </p>
            )}
            <div className="space-x-2">
              <Link
                href={`/projects/${project.proposalId}`}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
              >
                View Project
              </Link>
              {badgeText === 'Active' && !acceptedBid && (
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

        {/* Completed / Archived notes */}
        {badgeText === 'Completed' && (
          <p className="text-sm text-gray-500">✅ This project has been fully completed.</p>
        )}
        {badgeText === 'Archived' && (
          <p className="text-sm text-amber-800">🗄️ This project is archived.</p>
        )}
      </div>
    );
  };

  const renderList = () => {
    if (activeTab === 'active') {
      if (activeProjects.length === 0) {
        return <p className="text-gray-500 italic">There are no active projects at the moment.</p>;
      }
      return activeProjects.map((p) => renderProjectCard(p, 'bg-yellow-100 text-yellow-800', 'Active'));
    }

    if (activeTab === 'completed') {
      if (completedProjects.length === 0) {
        return <p className="text-gray-500 italic">No completed projects yet.</p>;
      }
      return completedProjects.map((p) =>
        renderProjectCard(p, 'bg-green-100 text-green-800', 'Completed')
      );
    }

    // archived
    if (archivedProjects.length === 0) {
      return <p className="text-gray-600 italic">No archived projects.</p>;
    }
    return archivedProjects.map((p) =>
      renderProjectCard(p, 'bg-amber-100 text-amber-800', 'Archived')
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Projects</h1>

      {/* Tabs */}
      <div className="mb-6">
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          <TabButton tab="active" label="Active" />
          <TabButton tab="completed" label="Completed" />
          <TabButton tab="archived" label="Archived" />
        </div>
      </div>

      <div className="space-y-6">{renderList()}</div>
    </div>
  );
}
