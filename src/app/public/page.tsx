// src/app/public/page.tsx
import Link from 'next/link';
import { getPublicProjects, type PublicProject } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function PublicProjectsPage() {
  let projects: PublicProject[] = [];
  try {
    projects = await getPublicProjects();
  } catch (e) {
    console.error('PublicProjectsPage error:', e);
    projects = [];
  }

  if (!projects.length) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Public Projects</h1>
        <div className="rounded-md border p-6 text-gray-600 bg-white">
          No public projects yet.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Public Projects</h1>
      <ul className="grid md:grid-cols-2 gap-5">
        {projects.map((p) => (
          <li key={p.bidId} className="rounded-lg border bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                <Link href={`/public/${p.bidId}`} className="hover:underline">
                  {p.publicTitle || p.proposalTitle || `Project #${p.proposalId}`}
                </Link>
              </h2>
              <span className="text-sm text-gray-500">Bid #{p.bidId}</span>
            </div>

            <p className="mt-1 text-gray-600">
              {p.publicSummary || p.orgName}
            </p>

            <div className="mt-3 text-sm text-gray-500">
              Vendor:{' '}
              <span className="font-medium text-gray-700">
                {p.vendorName || '—'}
              </span>
            </div>

            <div className="mt-2 flex gap-3 text-sm">
              <span className="inline-flex items-center rounded bg-gray-100 px-2 py-1">
                Milestones: {p.milestones?.length ?? 0}
              </span>
              <span className="inline-flex items-center rounded bg-gray-100 px-2 py-1">
                Proofs: {p.proofs?.length ?? 0}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
