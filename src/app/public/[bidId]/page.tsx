// src/app/public/[bidId]/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProjects } from "@/lib/api";

function usd(n: number) {
  try {
    return (n ?? 0).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  } catch {
    return `$${Math.round(n ?? 0)}`;
  }
}

function getSiteOrigin(): string {
  const raw =
    (process as any).env?.NEXT_PUBLIC_SITE_URL ||
    (process as any).env?.URL ||
    (process as any).env?.DEPLOY_PRIME_URL ||
    (process as any).env?.VERCEL_URL ||
    "";
  const s = String(raw).trim().replace(/\/+$/, "");
  if (!s) return "";
  return s.startsWith("http") ? s : `https://${s}`;
}

// best-effort: load proofs/files from our own Next API
async function fetchProofs(proposalId: number) {
  const origin = getSiteOrigin();
  if (!origin) return [];
  try {
    const r = await fetch(
      `${origin}/api/proofs?proposalId=${encodeURIComponent(String(proposalId))}&ts=${Date.now()}`,
      { cache: "no-store" }
    );
    if (!r.ok) return [];
    const list = await r.json().catch(() => []);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export default async function PublicProjectDetail({
  params,
  searchParams,
}: {
  params: { bidId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const bidId = Number(params.bidId);
  if (!Number.isFinite(bidId)) notFound();

  // load all projects and pick the one matching this bidId
  const items = await getPublicProjects(); // ensure this uses { cache: 'no-store' } in src/lib/api.ts
  const project = (Array.isArray(items) ? items : []).find(
    (p: any) => Number(p?.bidId) === bidId
  );

  if (!project) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-semibold">Public Project</h1>
        <p className="mt-2 text-gray-500">This project was not found.</p>
        <Link href="/public" className="text-blue-600 hover:underline mt-4 inline-block">
          ← Back to all projects
        </Link>
      </div>
    );
  }

  // also load proofs/files (for Files tab)
  const proofs = await fetchProofs(Number(project.proposalId ?? 0));

  // tabs via query param (no client JS needed)
  const tab = String(searchParams?.tab || "overview");

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "bids", label: `Bids (${project.bids?.length || 0})` },
    { key: "milestones", label: "Milestones" },
    { key: "files", label: `Files (${proofs?.length || 0})` },
  ];

  // flatten milestones from all bids (show newest bid first)
  const allMilestones: Array<{ fromBidId: number; vendor: string; m: any }> =
    (project.bids || [])
      .slice()
      .reverse()
      .flatMap((b: any) =>
        (b.milestones || []).map((m: any) => ({
          fromBidId: Number(b.bidId),
          vendor: b.vendorName || "",
          m,
        }))
      );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/public" className="text-sm text-blue-600 hover:underline">
        ← Back to Projects
      </Link>

      {/* header */}
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide text-gray-500">
          {project.orgName}
        </div>
        <h1 className="text-3xl font-bold">{project.proposalTitle || "Public Project"}</h1>
      </div>

      {/* cover */}
      <div className="mt-4 rounded-2xl overflow-hidden bg-gray-50">
        {project.coverImage ? (
          <img
            src={project.coverImage}
            alt={project.proposalTitle || "cover"}
            className="w-full h-auto object-cover"
          />
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-400">
            No image
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => {
            const active = tab === t.key;
            const href = `?tab=${t.key}`;
            return (
              <Link
                key={t.key}
                href={href}
                className={
                  "pb-3 text-sm " +
                  (active
                    ? "border-b-2 border-black font-medium"
                    : "text-gray-500 hover:text-gray-800")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* tab content */}
      <div className="mt-6">
        {tab === "overview" && (
          <section className="space-y-4">
            {project.summary && (
              <div>
                <h2 className="text-lg font-semibold mb-2">Project Description</h2>
                <p className="whitespace-pre-wrap text-gray-700">{project.summary}</p>
              </div>
            )}

            {Array.isArray(project.images) && project.images.length > 1 && (
              <div>
                <h3 className="text-sm font-medium mb-2">More images</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {project.images.slice(1, 10).map((u: string, i: number) => (
                    <img
                      key={i}
                      src={u}
                      alt={`image ${i + 1}`}
                      className="w-full aspect-video object-cover rounded-lg border"
                      loading="lazy"
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "bids" && (
          <section className="space-y-4">
            {(project.bids || []).length === 0 && (
              <p className="text-gray-500">No public bids visible.</p>
            )}
            {Array.isArray(project.bids) &&
              project.bids.map((b: any) => (
                <div key={b.bidId} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="font-medium">{b.vendorName || "Vendor"}</div>
                    <div className="text-sm text-gray-700">{usd(b.priceUSD)}</div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {b.days ? `${b.days} days` : null}{" "}
                    {b.status ? `• ${b.status}` : null}
                  </div>

                  {Array.isArray(b.milestones) && b.milestones.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-gray-700 mb-1">Milestones</div>
                      <ol className="space-y-1">
                        {b.milestones.map((m: any, idx: number) => (
                          <li key={idx} className="text-xs text-gray-700">
                            <span className="font-medium">{m.name || `Milestone ${idx + 1}`}</span>
                            {typeof m.amount === "number" && <> — {usd(m.amount)}</>}
                            {m.dueDate && <> • due {new Date(m.dueDate).toLocaleDateString()}</>}
                            {m.completed && <> • completed</>}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))}
          </section>
        )}

        {tab === "milestones" && (
          <section className="space-y-3">
            {allMilestones.length === 0 && (
              <p className="text-gray-500">No public milestones yet.</p>
            )}
            {allMilestones.map(({ fromBidId, vendor, m }, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="font-medium">
                    {m.name || `Milestone`} <span className="text-gray-400">• bid #{fromBidId}</span>
                  </div>
                  <div className="text-gray-700">{typeof m.amount === "number" ? usd(m.amount) : ""}</div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {vendor ? `${vendor} • ` : ""}{m.dueDate ? `due ${new Date(m.dueDate).toLocaleDateString()}` : ""}
                  {m.completed ? " • completed" : ""}
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === "files" && (
          <section className="space-y-4">
            {(!proofs || proofs.length === 0) && (
              <p className="text-gray-500">No public milestones/proofs yet.</p>
            )}
            {Array.isArray(proofs) &&
              proofs.map((p: any) => (
                <div key={p.proofId || `${p.milestoneIndex}-p`} className="rounded-lg border p-4">
                  <div className="text-sm font-medium">
                    Milestone {Number(p.milestoneIndex) + 1}: {p.title || "Submission"}
                  </div>
                  {p.publicText && (
                    <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{p.publicText}</p>
                  )}
                  {Array.isArray(p.files) && p.files.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {p.files.map((f: any, idx: number) => (
                        <a
                          key={idx}
                          href={f.url}
                          target="_blank"
                          className="block rounded-lg border overflow-hidden"
                          rel="noreferrer"
                        >
                          {/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(String(f.url || "")) ? (
                            <img
                              src={f.url}
                              alt={f.name || `file ${idx + 1}`}
                              className="w-full aspect-video object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-24 flex items-center justify-center text-xs text-gray-500">
                              {f.name || "file"}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 text-xs text-gray-500">
                    {p.submittedAt ? `Submitted ${new Date(p.submittedAt).toLocaleString()}` : ""}
                  </div>
                </div>
              ))}
          </section>
        )}
      </div>
    </div>
  );
}
