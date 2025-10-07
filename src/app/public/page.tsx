// src/app/public/page.tsx
import Link from 'next/link';

type Project = {
  proposalId: number;
  title: string;
  summary: string;
  totalBudgetUSD: number;
  bids: Array<{
    bidId: number;
    vendorName: string;
    priceUSD: number;
    status: string;
    milestones: Array<{ index: number; name: string; completed: boolean }>;
    images: string[];
  }>;
};

async function getProjects(): Promise<{ projects: Project[] }> {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  const res = await fetch(`${base}/api/public/projects`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load projects');
  return res.json();
}

export default async function PublicCatalogPage() {
  const { projects } = await getProjects();

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-semibold mb-6">Public Projects</h1>

      {(!projects || projects.length === 0) && (
        <div className="p-6 border border-dashed rounded text-gray-500">
          No public projects yet.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {projects?.map((p) =>
          p.bids.map((b) => (
            <div key={`${p.proposalId}-${b.bidId}`} className="rounded border bg-white overflow-hidden">
              {/* images strip */}
              {b.images && b.images.length > 0 ? (
                <div className="grid grid-cols-3 gap-1 bg-gray-50 p-1">
                  {b.images.slice(0, 3).map((src, i) => (
                    <img key={i} src={src} alt="" className="h-28 w-full object-cover rounded" />
                  ))}
                </div>
              ) : (
                <div className="h-28 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
                  No images yet
                </div>
              )}

              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">{p.title || `Proposal #${p.proposalId}`}</h2>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">{b.status}</span>
                </div>
                {p.summary ? (
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{p.summary}</p>
                ) : null}
                <div className="text-sm text-gray-500 mt-2">
                  Vendor: <span className="font-mono">{b.vendorName || '—'}</span> · Budget: $
                  {p.totalBudgetUSD.toLocaleString()}
                </div>

                {/* milestones preview */}
                {b.milestones?.length ? (
                  <ul className="mt-3 space-y-1">
                    {b.milestones.slice(0, 3).map((m) => (
                      <li key={m.index} className="text-sm">
                        <span className="font-medium">{m.name}</span>{' '}
                        {m.completed ? (
                          <span className="text-green-600">✓</span>
                        ) : (
                          <span className="text-yellow-600">•</span>
                        )}
                      </li>
                    ))}
                    {b.milestones.length > 3 ? (
                      <li className="text-xs text-gray-500">+ {b.milestones.length - 3} more…</li>
                    ) : null}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-400 mt-3">No milestones yet</div>
                )}

                <div className="mt-4">
                  <Link
                    href={`/public/${b.bidId}`}
                    className="inline-block text-blue-600 underline text-sm"
                  >
                    View details →
                  </Link>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
