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

// ---------- Visual Helpers (UI Only) ----------
const Icons = {
  Dollar: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Clock: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  CheckCircle: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  Briefcase: () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
};

const StatBox = ({ label, value, icon, subtext, children }: { label?: string, value?: React.ReactNode, icon?: React.ReactNode, subtext?: string, children?: React.ReactNode }) => (
  <div className="flex flex-col justify-center p-3 bg-slate-50 rounded-lg border border-slate-100 h-full">
    {children ? children : (
      <>
        <div className="flex items-center gap-2 text-slate-500 text-xs uppercase font-semibold tracking-wide mb-1">
          {icon}
          {label}
        </div>
        <div className="text-slate-900 font-medium text-base truncate">
          {value}
        </div>
        {subtext && <div className="text-xs text-slate-400 mt-1">{subtext}</div>}
      </>
    )}
  </div>
);

// ---------- Logic Helpers ----------
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
  const renderCard = (
    project: Project,
    badge: { text: string; cls: string },
    extra?: React.ReactNode
  ) => {
    const projectBids = getBidsForProject(project.proposalId);
    const bidsApproved = projectBids.filter(b => b.status === 'approved').length;
    const accepted = projectBids.find(b => b.status === 'approved') || null;

    // Aggregate milestones across ALL bids
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
    const progressPct = msAgg.total > 0 ? Math.round((msAgg.completed / msAgg.total) * 100) : 0;

    // Define status colors for the top stripe
    const statusColor = badge.text === 'Active' ? 'bg-blue-500' : badge.text === 'Completed' ? 'bg-green-500' : 'bg-amber-500';

    return (
      <div
        key={project.proposalId}
        className="group relative bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden"
      >
        {/* Top Status Stripe */}
        <div className={`h-1 w-full ${statusColor}`} />

        <div className="p-6">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className={`px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider rounded-md border ${badge.cls} border-opacity-20`}>
                  {badge.text}
                </span>
                <span className="text-xs text-slate-400">#{project.proposalId}</span>
              </div>
              
              <h2 className="text-xl font-bold text-slate-900 truncate pr-2" title={project.title}>
                {project.title}
              </h2>
              
              <div className="flex items-center gap-2 mt-1">
                {project.orgName ? (
                   <p className="text-slate-600 text-sm font-medium">{project.orgName}</p>
                ) : <span className="text-slate-400 italic text-sm">No Organization</span>}
                
                <span className="text-slate-300">•</span>
                
                <p className="text-slate-500 text-sm">
                  Created {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'Unknown'}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 md:justify-end mt-2 md:mt-0 shrink-0">
              <Link
                href={`/projects/${project.proposalId}`}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition"
              >
                View Details
              </Link>

               {/* Primary Actions for Active Projects */}
               {!accepted && badge.text === 'Active' && (
                 <>
                   <Link
                     href={`/bids/new?proposalId=${project.proposalId}`}
                     className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition shadow-sm"
                   >
                     <span>Submit Bid</span>
                   </Link>
                   
                   <Link
                    href={`/templates?proposalId=${project.proposalId}`}
                    className="inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-slate-600 hover:text-cyan-700 hover:bg-cyan-50 rounded-lg transition"
                    title="Use a Template"
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                    Template
                  </Link>
                 </>
               )}
            </div>
          </div>

          {/* Dashboard Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {/* 1. Budget */}
            <StatBox 
              label="Budget" 
              icon={<Icons.Dollar />}
              value={typeof project.amountUSD === 'number' ? currency.format(Number(project.amountUSD)) : '—'} 
              subtext={badge.text === 'Active' ? 'Estimated' : 'Final'}
            />

            {/* 2. Bids Activity */}
            <StatBox 
              label="Activity" 
              icon={<Icons.Briefcase />}
              value={
                <div className="flex items-baseline gap-1">
                   <span>{projectBids.length}</span>
                   <span className="text-xs font-normal text-slate-500">bids</span>
                </div>
              }
              subtext={accepted ? 'Contract Awarded' : `${bidsApproved} approved`}
            />

            {/* 3. Milestones Progress */}
            <StatBox>
               <div className="flex items-center justify-between text-slate-500 text-xs uppercase font-semibold tracking-wide mb-2">
                 <div className="flex items-center gap-2"><Icons.CheckCircle /> Milestones</div>
                 <span>{progressPct}%</span>
               </div>
               {/* Progress Bar */}
               <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className={`h-2.5 rounded-full transition-all duration-500 ${progressPct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                    style={{ width: `${progressPct}%` }}
                  ></div>
               </div>
               <div className="flex justify-between mt-2 text-xs text-slate-400">
                 <span>{msAgg.completed}/{msAgg.total} done</span>
                 <span>{msAgg.paid} paid</span>
               </div>
            </StatBox>

            {/* 4. Last Activity */}
            <StatBox 
              label="Last Update" 
              icon={<Icons.Clock />}
              value={lastAct ? lastAct.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
              subtext={lastAct ? lastAct.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
            />
          </div>

          {/* Footer / Extra Content (Archive button etc) */}
          {extra && (
            <div className="mt-4 pt-4 border-t border-slate-100 bg-slate-50 -mx-6 -mb-6 px-6 py-3 flex items-center justify-between text-sm">
              {extra}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    if (loading) return <div className="p-6 text-center text-gray-500">Loading projects...</div>;

 if (activeTab === 'active') {
      return (
        <div className="space-y-6">
          {activeProjects.map((p) =>
            // CHANGED: cls is now green text/bg
            renderCard(p, { text: 'Active', cls: 'text-green-700 bg-green-50' })
          )}
          {activeProjects.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
               <p className="text-gray-500 italic">There are no active projects at the moment.</p>
            </div>
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
              // CHANGED: Swapped to Blue so it doesn't clash with Active
              { text: 'Completed', cls: 'text-blue-700 bg-blue-50' },
              <div className="w-full flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-blue-700 font-medium">
                   <Icons.CheckCircle />
                   <span>Project fully completed</span>
                </div>
                <button
                  onClick={() => handleArchive(p.proposalId)}
                  disabled={!!archiving[p.proposalId]}
                  className="px-3 py-1.5 rounded text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-medium transition disabled:opacity-50"
                  title="Move this project to Archived"
                >
                  {archiving[p.proposalId] ? 'Archiving…' : 'Archive Project'}
                </button>
              </div>
            )
          )}
          {completedProjects.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
              <p className="text-gray-500 italic">No completed projects yet.</p>
            </div>
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
            { text: 'Archived', cls: 'text-amber-700 bg-amber-50' },
            <div className="flex items-center gap-2 text-amber-700">
               <span className="text-lg">🗄️</span>
               <span>This project is archived.</span>
            </div>
          )
        )}
        {archivedProjects.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
            <p className="text-gray-500 italic">No archived projects.</p>
          </div>
        )}
      </div>
    );
  };

  // ---- Guarded early returns ----
  if (allowed === null) {
    return <div className="max-w-6xl mx-auto p-6 text-gray-500">Checking access…</div>;
  }
  if (allowed === false) {
    return null; // redirected already
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Tabs */}
      <div className="mb-8">
        <h1 className="text-lg font-bold text-slate-900 mb-6">Projects</h1>
        <div className="inline-flex rounded-lg bg-slate-100 p-1 shadow-inner">
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
        'px-5 py-2.5 text-sm font-medium rounded-md transition-all duration-200',
        isActive ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50',
      ].join(' ')}
      aria-pressed={isActive}
    >
      {label}
    </button>
  );
}