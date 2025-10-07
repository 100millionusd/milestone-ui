import Image from "next/image";
import Link from "next/link";
import { getPublicProjects } from "@/lib/api";

export const revalidate = 0; // no caching

function usd(n: number) {
  try { return (n ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }); }
  catch { return `$${Math.round(n ?? 0)}`; }
}

export default async function PublicProjectsPage() {
  const items = await getPublicProjects();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Projects</h1>
      {(!items || items.length === 0) && (
        <p className="text-sm text-gray-500">No public projects yet.</p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p: any) => {
          const featured = Array.isArray(p.bids) && p.bids.length ? p.bids[0] : null;
          return (
            <div key={p.proposalId} className="rounded-2xl border border-gray-200 overflow-hidden bg-white shadow-sm">
              <div className="relative aspect-[16/9] bg-gray-50">
                {p.coverImage ? (
                  // Image component needs absolute URL or allowed domain—fallback to <img> if unknown
                  <img
                    src={p.coverImage}
                    alt={p.proposalTitle || "cover"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-gray-400 text-sm">
                    No image
                  </div>
                )}
              </div>

              <div className="p-4">
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  {p.orgName}
                </div>
                <h2 className="text-lg font-semibold">{p.proposalTitle || "Untitled Project"}</h2>
                {p.summary && (
                  <p className="mt-2 text-sm text-gray-600 line-clamp-4 whitespace-pre-wrap">
                    {p.summary}
                  </p>
                )}

                {/* Bids */}
                <div className="mt-4">
                  <div className="text-sm font-medium mb-2">Bids</div>
                  {Array.isArray(p.bids) && p.bids.length > 0 ? (
                    <ul className="space-y-3">
                      {p.bids.map((b: any) => (
                        <li key={b.bidId} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-medium">{b.vendorName || "Vendor"}</div>
                            <div className="text-sm text-gray-600">{usd(b.priceUSD)}</div>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {b.days ? `${b.days} days` : null} {b.status ? `• ${b.status}` : null}
                          </div>

                          {/* Milestones */}
                          {Array.isArray(b.milestones) && b.milestones.length > 0 && (
                            <div className="mt-2">
                              <div className="text-xs font-medium text-gray-700 mb-1">Milestones</div>
                              <ol className="space-y-1">
                                {b.milestones.map((m: any, idx: number) => (
                                  <li key={idx} className="text-xs text-gray-600 flex items-start gap-2">
                                    <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-gray-300" />
                                    <span className="flex-1">
                                      <span className="font-medium">{m.name || `Milestone ${idx + 1}`}</span>
                                      {typeof m.amount === "number" ? (
                                        <> — {usd(m.amount)}</>
                                      ) : null}
                                      {m.dueDate ? (
                                        <> • due {new Date(m.dueDate).toLocaleDateString()}</>
                                      ) : null}
                                      {m.completed ? <> • completed</> : null}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-500">No public bids yet.</div>
                  )}
                </div>

                {/* optional detail link if you keep a detail route */}
                {p.bidId ? (
                  <div className="mt-4">
                    <Link
                      href={`/public/${p.bidId}`}
                      className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline"
                    >
                      View details →
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
