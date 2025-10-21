// src/app/projects/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { listProposals, getBids, archiveProposal, getAuthRoleOnce } from '@/lib/api';

type TabKey = 'active' | 'completed' | 'archived';

type Project = {
  proposalId: number;
  title: string;
  orgName?: string;
  amountUSD?: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'archived';
  createdAt?: string;
  updatedAt?: string;
  ownerWallet?: string;
};

type Milestone = {
  name?: string;
  amount?: number;
  dueDate?: string;
  completed?: boolean;
  completionDate?: string | null;
  paymentTxHash?: string | null;
  paymentDate?: string | null;
};

type Bid = {
  bidId: number;
  proposalId: number;
  vendorName?: string;
  status: string; // 'pending' | 'approved' | 'rejected' | 'completed' | ...
  milestones?: Milestone[] | string; // server may serialize JSON
  priceUSD?: number;
  priceUsd?: number;
  createdAt?: string;
  updatedAt?: string;
};

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// ---------- helpers ----------
function parseMilestones(raw: Bid['milestones']): Milestone[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function bidMsStats(bid: Bid) {
  const arr = parseMilestones(bid.milestones);
  const total = arr.length;
  const completed = arr.filter(m => m?.completed || m?.paymentTxHash).length;
  const paid = arr.filter(m => m?.paymentTxHash).length;
  // find last activity among milestone dates
  const lastMsDate =
    arr
      .flatMap(m => [m.paymentDate, m.completionDate, m.dueDate].filter(Boolean) as string[])
      .map(s => new Date(s))
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  return { total, completed, paid, lastMsDate };
}

function projectLastActivity(project: Project, projectBids: Bid[]) {
  const dates: (string | undefined | null)[] = [project.updatedAt, project.createdAt];
  for (const b of projectBids) {
    dates.push(b.updatedAt, b.createdAt);
    const { lastMsDate } = bidMsStats(b);
    if (lastMsDate) dates.push(lastMsDate.toISOString());
  }
  const valid = dates
    .filter(Boolean)
    .map(s => new Date(String(s)))
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());
  return valid[0] || null;
}

function isProjectCompleted(project: Project, allBids: Bid[]) {
  if (project.status === 'completed') return true;
  const projectBids = allBids.filter(b => b.proposalId === project.proposalId);
  const accepted = projectBids.find(b => b.status === 'approved');
  if (!accepted) return false;
  const { total, completed } = bidMsStats(accepted);
  if (total === 0) return false;
  return completed === total;
}
// -----------------------------

export default function ProjectsPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<null | boolean>(null);

  const [projects, setProjects] = useState<Project[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [archiving, setArchiving] = useState<Record<number, boolean>>({}); // proposalId -> busy

  // ---- ACCESS GUARD: admin OR approved vendor only ----
  useEffect(() => {
    (async () => {
      try {
        const info = await getAuthRoleOnce();
        const role = String(info?.role ?? 'guest');
        const vendorStatus = String(info?.vendorStatus ?? 'pending').toLowerCase();

        if (role === 'admin' || (role === 'vendor' && vendorStatus === 'approved')) {
          setAllowed(true);
        } else {
          setAllowed(false);
          // pending vendors go to profile until approved
          router.replace('/vendor/profile?awaiting_approval=1');
        }
      } catch {
        setAllowed(false);
        router.replace('/');
      }
    })();
  }, [router]);

  // ---- Data load (only when allowed) ----
  useEffect(() => {
    if (allowed !== true) return;
    (async () => {
      try {
        // includeArchived=true so the Archived tab has data
        const [proposalsData, bidsData] = await Promise.all([
          listProposals({ includeArchived: true }),
          getBids(), // fetch ALL bids, used to compute aggregates per project
        ]);
        setProjects(proposalsData || []);
        setBids(bidsData || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed]);

  // partitions (memoized to avoid recompute churn)
  const archivedProjects = useMemo(
    () => projects.filter((p) => p.status === 'archived'),
    [projects]
  );

  const completedProjects = useMemo(
    () =>
      projects.filter(
        (p) => p.status === 'completed' || (p.status === 'approved' && isProjectCompleted(p, bids))
      ),
    [projects, bids]
  );

  const activeProjects = useMemo(
    () =>
      projects.filter(
        (p) => p.status === 'approved' && !isProjectCompleted(p, bids)
      ),
    [projects, bids]
  );

  const getBidsForProject = (projectId: number) =>
    bids.filter((bid) => bid.proposalId === projectId);

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

  // --------- UI ---------
  const renderCard = (project: Project, badge: { text: string; cls: string }, extra?: React.ReactNode) => {
    const projectBids = getBidsForProject(project.proposalId);
    const bidsApproved = projectBids.filter(b => b.status === 'approved').length;
    const accepted = projectBids.find(b => b.status === 'approved') || null;

    // Aggregate milestones across ALL bids to mirror the overview design
    const msAgg = projectBids.reduce(
      (acc, b) => {
        const { total, completed, paid } = bidMsStats(b);
        acc.total += total;
        acc.completed += completed;
        acc.paid += paid;
        return acc;
      },
      { total: 0, completed: 0, paid: 0 }
    );

    const lastAct = projectLastActivity(project, projectBids);

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
            {project.orgName && <p className="text-gray-600">{project.orgName}</p>}
            {typeof project.amountUSD === 'number' && (
              <p className="text-green-600 font-medium text-lg mt-2">
                Budget: {currency.format(Number(project.amountUSD))}
              </p>
            )}
          </div>
          <div className="text-right">
            {badge.text === 'Active' && (
              <p className="text-sm text-gray-500 mb-3">
                {projectBids.length} {projectBids.length === 1 ? 'bid' : 'bids'} •{' '}
                {accepted ? 'Contract awarded' : 'Accepting bids'}
              </p>
            )}
            <div className="space-x-2">
              <Link
                href={`/projects/${project.proposalId}`}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
              >
                View Project
              </Link>
              {!accepted && badge.text === 'Active' && (
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

        {/* rollups */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Bids</div>
            <div className="font-medium">{bidsApproved}/{projectBids.length || 0} approved</div>
          </div>
          <div>
            <div className="text-gray-500">Milestones (completed)</div>
            <div className="font-medium">{msAgg.completed}/{msAgg.total}</div>
          </div>
          <div>
            <div className="text-gray-500">Milestones (paid)</div>
            <div className="font-medium">{msAgg.paid}/{msAgg.total}</div>
          </div>
          <div className="md:text-right col-span-2 md:col-span-1">
            <div className="text-gray-500">Last activity</div>
            <div className="font-medium">{lastAct ? lastAct.toLocaleString() : '—'}</div>
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
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <p className="text-sm text-gray-600">✅ This project has been fully completed.</p>
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

  // ---- Guarded early returns ----
  if (allowed === null) {
    return <div className="max-w-6xl mx-auto p-6">Checking access…</div>;
  }
  if (allowed === false) {
    return null; // redirected already
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Tabs */}
      <div className="mb-6">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabButton
            current={activeTab}
            setCurrent={setActiveTab}
            id="active"
            label={`Active (${activeProjects.length})`}
          />
          <TabButton
            current={activeTab}
            setCurrent={setActiveTab}
            id="completed"
            label={`Completed (${completedProjects.length})`}
          />
          <TabButton
            current={activeTab}
            setCurrent={setActiveTab}
            id="archived"
            label={`Archived (${archivedProjects.length})`}
          />
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
  current: TabKey;
  setCurrent: (t: TabKey) => void;
  id: TabKey;
  label: string;
}) {
  const isActive = current === id;
  return (
    <button
      onClick={() => setCurrent(id)}
      className={[
        'px-4 py-2 text-sm font-medium rounded-lg transition',
        isActive ? 'bg-slate-900 text-white shadow' : 'text-slate-700 hover:bg-slate-100',
      ].join(' ')}
      aria-pressed={isActive}
    >
      {label}
    </button>
  );
}
