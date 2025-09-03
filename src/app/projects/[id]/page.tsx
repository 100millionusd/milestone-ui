// src/app/projects/[id]/page.tsx
import { getProposal, getBids } from "@/lib/api";
import Link from "next/link";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const proposalId = parseInt(id);

  try {
    const [proposal, allBids] = await Promise.all([
      getProposal(proposalId),
      getBids()
    ]);

    const bids = allBids.filter(bid => bid.proposalId === proposalId);

    return (
      <div className="p-6">
        <div className="mb-6">
          <Link href="/projects" className="text-blue-600 hover:text-blue-800">
            ← Back to Projects
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold mb-4">{proposal.title}</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="font-medium text-gray-600">Organization</p>
              <p>{proposal.orgName}</p>
            </div>
            <div>
              <p className="font-medium text-gray-600">Status</p>
              <span className={`px-2 py-1 rounded text-sm ${
                proposal.status === 'approved' ? 'bg-green-100 text-green-800' :
                proposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {proposal.status}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-600">Budget</p>
              <p>${proposal.amountUSD.toLocaleString()}</p>
            </div>
            <div>
              <p className="font-medium text-gray-600">Contact</p>
              <p>{proposal.contact}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="font-medium text-gray-600">Project Summary</p>
            <p className="text-gray-800 mt-1">{proposal.summary}</p>
          </div>

          {proposal.address && (
            <div className="mb-4">
              <p className="font-medium text-gray-600">Address</p>
              <p className="text-gray-800">{proposal.address}</p>
            </div>
          )}
        </div>

        {/* SUBMIT BID BUTTON */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6 text-center">
          <h2 className="text-xl font-semibold text-blue-800 mb-3">Interested in this project?</h2>
          <p className="text-blue-600 mb-4">Submit your bid proposal with milestone-based payments</p>
          <Link 
            href={`/bids/new?proposalId=${proposal.proposalId}`}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium inline-block"
          >
            📝 Submit Your Bid
          </Link>
          <p className="text-sm text-blue-500 mt-3">
            You'll need your Ethereum wallet address for USDT/USDC payments
          </p>
        </div>

        {/* Bids Section */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Bids</h2>
            <span className="bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-sm">
              {bids.length} {bids.length === 1 ? 'BID' : 'BIDS'}
            </span>
          </div>
          
          {bids.length > 0 ? (
            <div className="grid gap-4">
              {bids.map((bid) => (
                <div key={bid.bidId} className="border rounded p-4 hover:shadow-md transition-shadow">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-lg">{bid.vendorName}</h3>
                      <p className="text-sm text-gray-600">
                        Submitted: {new Date(bid.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-green-600">
                        ${bid.priceUSD.toLocaleString()}
                      </p>
                      <p className="text-sm text-gray-600">{bid.days} days</p>
                    </div>
                  </div>

                  {bid.notes && (
                    <div className="mb-3">
                      <p className="font-medium text-gray-600">Notes:</p>
                      <p className="text-gray-800">{bid.notes}</p>
                    </div>
                  )}

                  {bid.doc && (
                    <div className="mb-3">
                      <p className="font-medium text-gray-600">Document:</p>
                      <a 
                        href={bid.doc.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        📄 {bid.doc.name} ({Math.round(bid.doc.size / 1024)} KB)
                      </a>
                    </div>
                  )}

                  {/* Show milestone progress if available */}
                  {bid.milestones && bid.milestones.length > 0 && (
                    <div className="mb-3 pt-3 border-t">
                      <p className="text-sm font-medium text-gray-600 mb-2">Milestone Progress:</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full"
                            style={{ 
                              width: `${(bid.milestones.filter((m: any) => m.completed).length / bid.milestones.length) * 100}%` 
                            }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-500">
                          {bid.milestones.filter((m: any) => m.completed).length}/{bid.milestones.length} completed
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-3 border-t">
                    <span className="text-sm text-gray-500">Bid ID: {bid.bidId}</span>
                    
                    {/* CLICKABLE BID LINKS */}
                    <div className="flex gap-3">
                      <Link
                        href={`/admin/proposals/${proposalId}/bids/${bid.bidId}`}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium"
                      >
                        View Admin Details
                      </Link>
                      <Link
                        href={`/vendor/proof/${bid.bidId}`}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium"
                      >
                        Submit Proof
                      </Link>
                    </div>
                  </div>

                  {/* Bid Status Badge */}
                  <div className="mt-3 pt-3 border-t">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      bid.status === 'approved' ? 'bg-green-100 text-green-800' :
                      bid.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      Status: {bid.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-4">💼</div>
              <h3 className="text-lg font-medium mb-2">No Bids Yet</h3>
              <p>No vendors have submitted bids for this project yet.</p>
              <p className="text-sm mt-2">Be the first to submit a bid!</p>
            </div>
          )}
        </div>

        {/* Project Metadata */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Proposal ID: {proposal.proposalId} • Created: {new Date(proposal.createdAt).toLocaleDateString()}</p>
        </div>
      </div>
    );
  } catch (error) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <Link href="/projects" className="text-blue-600 hover:text-blue-800">
            ← Back to Projects
          </Link>
        </div>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <h2 className="font-semibold">Error loading project</h2>
          <p>{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
        </div>
        <div className="mt-4 bg-blue-50 border border-blue-200 p-4 rounded">
          <p className="text-sm text-blue-800">
            Troubleshooting tips:
          </p>
          <ul className="text-sm text-blue-600 mt-2 list-disc list-inside">
            <li>Make sure the backend server is running on http://localhost:3000</li>
            <li>Check if the proposal exists in the database</li>
            <li>Verify your internet connection</li>
          </ul>
        </div>
      </div>
    );
  }
}