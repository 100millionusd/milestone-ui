// src/app/projects/page.tsx
import { getProposals } from "@/lib/api";
import Link from "next/link";

export default async function ProjectsPage() {
  const proposals = await getProposals();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">All Projects</h1>
      
      <div className="grid gap-6">
        {proposals.map((proposal) => (
          <Link
            key={proposal.proposalId}
            href={`/projects/${proposal.proposalId}`}
            className="block border rounded-lg p-6 hover:shadow-md transition-shadow bg-white"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-semibold">{proposal.title}</h2>
                <p className="text-gray-600">{proposal.orgName}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                proposal.status === 'approved' ? 'bg-green-100 text-green-800' :
                proposal.status === 'rejected' ? 'bg-red-100 text-red-800' :
                'bg-yellow-100 text-yellow-800'
              }`}>
                {proposal.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600">Budget</p>
                <p className="font-semibold">${proposal.amountUSD.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Contact</p>
                <p>{proposal.contact}</p>
              </div>
            </div>

            <p className="text-gray-700 line-clamp-2">{proposal.summary}</p>

            <div className="mt-4 flex justify-between items-center">
              <span className="text-sm text-gray-500">
                Created: {new Date(proposal.createdAt).toLocaleDateString()}
              </span>
              <span className="text-blue-600 text-sm font-medium">
                View Details →
              </span>
            </div>
          </Link>
        ))}
      </div>

      {proposals.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border-2 border-dashed">
          <div className="text-4xl mb-4">🏗️</div>
          <h2 className="text-xl font-semibold mb-2">No Projects Yet</h2>
          <p className="text-gray-600">There are no project proposals available at this time.</p>
          <Link
            href="/new"
            className="inline-block mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Create First Project
          </Link>
        </div>
      )}
    </div>
  );
}