// src/app/projects/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listProposals, getBids, archiveProposal } from '@/lib/api';

type TabKey = 'active' | 'completed' | 'archived';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [archiving, setArchiving] = useState<Record<number, boolean>>({}); // proposalId -> busy

  useEffect(() => {
    (async () => {
      try {
        // includeArchived=true so the Archived tab actually has data
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

  const archivedProjects = projects.filter((p) => p.status === 'archived');
  const completedProjects = projects.filter(
    (p) => p.status === 'completed' || (p.status === 'approved' && isProjectCompleted(p))
  );
  const activeProjects = projects.filter(
    (p) => p.status === 'approved' && !isProjectCompleted(p)
  );

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

  const renderCard = (project: any, badge: { text: string; cls: string }, extra?: React.ReactNode) => {
    const projectBids = getBidsForProject(project.proposalId);
    const acceptedBid = projectBids.find((bid) => bid.status === 'approved');

    return (
      <div
        key={project.proposalId}
        className="border rounded-lg p-6 hover:shadow-md transition bg-white"
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="font-semibold text-xl">{project.title}</h2>
              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.cls}`}>
                {badge.text}
              </span>
            </div>
            <p className="text-gray-600">{project.orgName}</p>
            <p className="text-green-600 font-medium text-lg mt-2">
              Budget: ${project.amountUSD}
            </p>
          </div>
          <div className="text-right">
            {badge.text === 'Active' && (
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
              {!acceptedBid && badge.text === 'Active' && (
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

        {extra}
      </div>
    );
  };

  const renderTabContent = () => {
    if (loading) return <div>Loading projects...</div>;

    if (activeTab === 'active') {
      return (
        <div className="space-y-6">
          {activeProjects.map((p) =>
            renderCard(p, { text: 'Active', cls: 'bg-yellow-100 text-yellow-800' })
          )}
          {activeProjects.length === 0 && (
            <p className="text-gray-500 italic">There are no active projects at the moment.</p>
          )}
        </div>
      );
    }

    if (activeTab === 'completed') {
      return (
        <div className="space-y-6">
          {completedProjects.map((p) =>
            renderCard(
              p,
              { text: 'Completed', cls: 'bg-green-100 text-green-800' },
              <div className="mt-3 flex gap-2">
                <p className="text-sm text-gray-500">✅ This project has been fully completed.</p>
                {/* ✅ Archive button only on Completed tab */}
                <button
                  onClick={() => handleArchive(p.proposalId)}
                  disabled={!!archiving[p.proposalId]}
                  className="text-sm px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                  title="Move this project to Archived"
                >
                  {archiving[p.proposalId] ? 'Archiving…' : 'Archive'}
                </button>
              </div>
            )
          )}
          {completedProjects.length === 0 && (
            <p className="text-gray-500 italic">No completed projects yet.</p>
          )}
        </div>
      );
    }

    // archived
    return (
      <div className="space-y-6">
        {archivedProjects.map((p) =>
          renderCard(
            p,
            { text: 'Archived', cls: 'bg-amber-100 text-amber-800' },
            <p className="mt-3 text-sm text-amber-800">🗄️ This project is archived.</p>
          )
        )}
        {archivedProjects.length === 0 && (
          <p className="text-gray-600 italic">No archived projects.</p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Tabs */}
      <div className="mb-6">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabButton current={activeTab} setCurrent={setActiveTab} id="active" label="Active" />
          <TabButton current={activeTab} setCurrent={setActiveTab} id="completed" label="Completed" />
          <TabButton current={activeTab} setCurrent={setActiveTab} id="archived" label="Archived" />
        </div>
      </div>

      {renderTabContent()}
    </div>
  );
}

function TabButton({
  current,
  setCurrent,
  id,
  label,
}: {
  current: 'active' | 'completed' | 'archived';
  setCurrent: (t: 'active' | 'completed' | 'archived') => void;
  id: 'active' | 'completed' | 'archived';
  label: string;
}) {
  const isActive = current === id;
  return (
    <button
      onClick={() => setCurrent(id)}
      className={[
        'px-4 py-2 text-sm font-medium rounded-lg transition',
        isActive
          ? 'bg-slate-900 text-white shadow'
          : 'text-slate-700 hover:bg-slate-100',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
