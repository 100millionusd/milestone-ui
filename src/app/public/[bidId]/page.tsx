// src/app/public/[bidId]/page.tsx
import { notFound } from 'next/navigation';
import { getPublicProject } from '@/lib/api'; // ← THIS is the import you asked about

export const dynamic = 'force-dynamic'; // no caching for live public pages

type Params = { params: { bidId: string } };

export default async function PublicProjectPage({ params }: Params) {
  const bidId = Number(params.bidId);
  if (!Number.isFinite(bidId)) notFound();

  // Fetch read-only public data via your Next API
  let data: any = null;
  try {
    data = await getPublicProject(bidId);
  } catch {
    // If 404 or any error, show a friendly empty state
    data = null;
  }

  if (!data || !data.bid) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-semibold mb-4">Public Project</h1>
        <p className="text-gray-600">No public milestones/proofs yet.</p>
      </main>
    );
  }

  const { proposal, bid, milestones = [], proofs = [] } = data;

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">
          {proposal?.public_title || proposal?.title || 'Project'}
        </h1>
        {proposal?.public_summary && (
          <p className="text-gray-700">{proposal.public_summary}</p>
        )}
        <p className="text-gray-500 text-sm">
          Vendor: <span className="font-medium">{bid.vendorName}</span> • Budget: $
          {Number(bid.priceUSD || bid.price_usd || 0).toLocaleString()}
        </p>
      </header>

      {/* Milestones */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Public Milestones</h2>
        {milestones.length === 0 ? (
          <p className="text-gray-500">No public milestones yet.</p>
        ) : (
          <ul className="space-y-3">
            {milestones.map((m: any, i: number) => (
              <li
                key={i}
                className="border rounded-lg p-4 flex items-start justify-between"
              >
                <div>
                  <div className="font-medium">{m.name || `Milestone ${i + 1}`}</div>
                  <div className="text-gray-600 text-sm">
                    Due: {new Date(m.dueDate || m.due_date || Date.now()).toLocaleDateString()}
                    {typeof m.amount === 'number' && (
                      <> • ${Number(m.amount).toLocaleString()}</>
                    )}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    m.completed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {m.completed ? 'Completed' : 'Planned'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Proofs gallery */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Public Proofs</h2>
        {proofs.length === 0 ? (
          <p className="text-gray-500">No public proofs yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {proofs.map((p: any) => (
              <article key={p.proofId ?? `${p.bidId}-${p.milestoneIndex}`} className="border rounded-lg overflow-hidden">
                <div className="p-4 space-y-2">
                  <div className="font-medium">
                    {p.title || `Proof for Milestone ${Number(p.milestoneIndex) + 1}`}
                  </div>
                  {p.public_text ? (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.public_text}</p>
                  ) : p.description ? (
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{p.description}</p>
                  ) : null}
                  {(p.public_files || p.files || []).length > 0 && (
                    <ul className="space-y-2">
                      {(p.public_files || p.files).map((f: any, idx: number) => (
                        <li key={idx}>
                          <a
                            className="text-blue-600 hover:underline break-words"
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {f.name || f.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
