// src/app/admin/proposals/[id]/page.tsx
import Agent2Inline from "@/components/Agent2Inline";
import { getProposal, getBids } from "@/lib/api";
import Link from "next/link";

type PageProps = { params: { id: string } };

// tiny helpers local to this file
function normList(x: any): any[] {
  if (!x) return [];
  if (Array.isArray(x)) return x.filter(Boolean);
  return [x].filter(Boolean);
}
function asUrl(d: any): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  return String(d.url || d.href || d.link || "");
}
function asName(d: any): string {
  if (!d) return "";
  if (typeof d === "string") {
    try {
      const u = new URL(d);
      return decodeURIComponent(u.pathname.split("/").pop() || "file");
    } catch {
      return d.split("/").pop() || "file";
    }
  }
  return String(d.name || d.filename || d.title || d.cid || "file");
}
function isImage(url: string): boolean {
  const u = url.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(u);
}

function AttachmentTile({ doc }: { doc: any }) {
  const url = asUrl(doc);
  if (!url) return null;
  const name = asName(doc);
  const img = isImage(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group block rounded border bg-white hover:shadow-sm transition p-2"
      title={name}
    >
      {img ? (
        <img
          src={url}
          alt={name}
          className="w-24 h-24 object-cover rounded"
          loading="lazy"
        />
      ) : (
        <div className="w-24 h-24 rounded grid place-items-center bg-slate-50 text-slate-600 text-xs">
          PDF / File
        </div>
      )}
      <div className="mt-1 w-24 truncate text-[11px] text-slate-700">{name}</div>
    </a>
  );
}

export default async function ProposalDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const proposalId = Number(params.id);
  if (!Number.isFinite(proposalId)) {
    return <div className="p-6">Invalid proposal id.</div>;
  }

  try {
    const [proposal, bids] = await Promise.all([
      getProposal(proposalId),
      getBids(proposalId),
    ]);

    const fmtUSD = (n: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

    // --- normalize proposal attachments (proposal.docs is already an array) ---
    // --- normalize proposal attachments: support doc (single), docs[], files[] ---
    const legacyP = normList((proposal as any)?.doc);
    const docsP = normList((proposal as any)?.docs);
    const filesP = normList((proposal as any)?.files);
    const proposalDocs = [...docsP, ...filesP, ...legacyP].filter(Boolean);

    return (
      <div className="p-6 space-y-6">
        <header>
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">{proposal.title}</h1>
            <Link
              href={`/proposals/${proposalId}/edit`}
              className="px-3 py-1 rounded bg-indigo-600 text-white text-sm"
            >
              Edit
            </Link>
          </div>
        </header>

        <section className="bg-white p-4 rounded shadow space-y-2">
          <p><strong>Organization:</strong> {proposal.orgName}</p>
          <p><strong>Contact:</strong> {proposal.contact}</p>
          <p><strong>Budget:</strong> {fmtUSD(proposal.amountUSD)}</p>
          <p><strong>Status:</strong> {proposal.status}</p>
          <div>
            <strong>Summary:</strong>
            <p className="mt-1 whitespace-pre-wrap">{proposal.summary}</p>
          </div>

          {/* ✅ Proposal Attachments */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold mb-2">Attachments</h3>
            {proposalDocs.length === 0 ? (
              <div className="text-sm text-slate-500">No attachments.</div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {proposalDocs.map((d, i) => (
                  <AttachmentTile key={i} doc={d} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Bids</h2>

          {bids.length > 0 ? (
            <div className="grid gap-4">
              {bids.map((bid) => {
                // ✅ normalize bid attachments: doc (single), docs[], files[]
                const legacy = normList((bid as any)?.doc);
                const docs = normList((bid as any)?.docs);
                const files = normList((bid as any)?.files);
                const all = [...docs, ...files, ...legacy].filter(Boolean);

                return (
                  <div key={bid.bidId} className="bg-white p-4 rounded shadow space-y-3">
                    <div className="grid md:grid-cols-2 gap-2">
                      <p><strong>Vendor:</strong> {bid.vendorName}</p>
                      <p><strong>Price:</strong> {fmtUSD(bid.priceUSD)}</p>
                      <p><strong>Days:</strong> {bid.days}</p>
                      <p className="md:col-span-2"><strong>Notes:</strong> {bid.notes}</p>
                    </div>

                    {/* ✅ Bid attachments */}
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Bid Attachments</h4>
                      {all.length === 0 ? (
                        <div className="text-sm text-slate-500">No attachments.</div>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {all.map((d, i) => (
                            <AttachmentTile key={i} doc={d} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ✅ Agent 2 inline prompt + results */}
                    <Agent2Inline bid={bid} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p>No bids yet for this proposal.</p>
          )}
        </section>
      </div>
    );
  } catch (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Proposal Details</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error loading proposal: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      </div>
    );
  }
}
