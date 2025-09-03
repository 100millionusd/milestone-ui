// src/app/admin/proposals/[id]/page.tsx
import { getProposal, getBids } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProposalDetailPage({ params }: PageProps) {
  const { id } = await params;
  const proposalId = parseInt(id);

  try {
    const proposal = await getProposal(proposalId);
    const bids = await getBids(proposalId);

    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">{proposal.title}</h1>
        <div className="bg-white p-4 rounded shadow">
          <p><strong>Organization:</strong> {proposal.orgName}</p>
          <p><strong>Contact:</strong> {proposal.contact}</p>
          <p><strong>Budget:</strong> ${proposal.amountUSD}</p>
          <p><strong>Status:</strong> {proposal.status}</p>
          <p><strong>Summary:</strong> {proposal.summary}</p>
        </div>

        <h2 className="text-xl font-bold mt-6 mb-4">Bids</h2>
        {bids.length > 0 ? (
          <div className="grid gap-4">
            {bids.map((bid) => (
              <div key={bid.bidId} className="bg-white p-4 rounded shadow">
                <p><strong>Vendor:</strong> {bid.vendorName}</p>
                <p><strong>Price:</strong> ${bid.priceUSD}</p>
                <p><strong>Days:</strong> {bid.days}</p>
                <p><strong>Notes:</strong> {bid.notes}</p>
              </div>
            ))}
          </div>
        ) : (
          <p>No bids yet for this proposal.</p>
        )}
      </div>
    );
  } catch (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Proposal Details</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Error loading proposal: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }
}