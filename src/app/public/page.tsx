// src/app/public/page.tsx
export const dynamic = 'force-dynamic';

type PublicProject = {
  bidId: number;
  proposalId: number;
  title: string;
  orgName: string;
  budgetUSD: number;
  milestonesCount: number;
  completedCount: number;
  thumbnail?: string | null;
  updatedAt?: string | null;
};

async function fetchProjects(): Promise<PublicProject[]> {
  // server-side relative fetch to our Next API
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ? '' : ''}/api/public/projects`, {
    cache: 'no-store',
  });
  if (!r.ok) return [];
  return r.json();
}

function fmtUSD(v: number) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v || 0);
  } catch {
    return `$${Math.round(v || 0).toLocaleString()}`;
  }
}

export default async function PublicProjectsPage() {
  const projects = await fetchProjects();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Public Projects</h1>
      <p className="text-gray-600 mb-6">
        A read-only showcase of active projects. Click any card to view its milestones and proofs.
      </p>

      {projects.length === 0 ? (
        <div className="border rounded p-8 text-center text-gray-500">
          No public projects yet.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((p) => (
            <a
              key={p.bidId}
              href={`/public/${p.bidId}`}
              className="block rounded-lg overflow-hidden border hover:shadow-md transition"
            >
              <div className="aspect-video bg-gray-100">
                {p.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                    No preview
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="text-xs text-gray-500">{p.orgName || '—'}</div>
                <div className="font-semibold truncate">{p.title || `Bid #${p.bidId}`}</div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="font-medium">{p.milestonesCount}</span> milestones
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="font-medium">{p.completedCount}</span> done
                  </span>
                  <span className="ml-auto font-medium">{fmtUSD(p.budgetUSD)}</span>
                </div>
                {p.updatedAt && (
                  <div className="mt-2 text-xs text-gray-400">
                    Updated {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
