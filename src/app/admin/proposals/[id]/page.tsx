// src/app/admin/proposals/[id]/page.tsx
import Agent2Inline from "@/components/Agent2Inline";
import { getProposal, getBids } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalDetailPage({ params }: PageProps) {
  const { id } = await params;
  const proposalId = Number(id);

  try {
    const proposal = await getProposal(proposalId);
    const bids = await getBids(proposalId);

    const fmtUSD = (n: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

    return (
      <div className="p-6 space-y-6">
        <header>
          <h1 className="text-2xl font-bold">{proposal.title}</h1>
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
        </section>

        <section>
          <h2 className="text-xl font-bold mb-4">Bids</h2>

          {bids.length > 0 ? (
            <div className="grid gap-4">
              {bids.map((bid) => (
                <div key={bid.bidId} className="bg-white p-4 rounded shadow space-y-3">
                  <div className="grid md:grid-cols-2 gap-2">
                    <p><strong>Vendor:</strong> {bid.vendorName}</p>
                    <p><strong>Price:</strong> {fmtUSD(bid.priceUSD)}</p>
                    <p><strong>Days:</strong> {bid.days}</p>
                    <p className="md:col-span-2"><strong>Notes:</strong> {bid.notes}</p>
                  </div>

                  {/* ✅ Agent 2 inline prompt + results */}
                  <Agent2Inline bid={bid} />
                </div>
              ))}
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
