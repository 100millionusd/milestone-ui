// src/app/projects/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getProposals, getBids } from '@/lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [proposalsData, bidsData] = await Promise.all([
          getProposals(),
          getBids()
        ]);
        
        // Filter to show only approved proposals as "projects"
        const approvedProjects = proposalsData.filter(p => p.status === 'approved');
        setProjects(approvedProjects);
        setBids(bidsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getBidsForProject = (projectId) => {
    return bids.filter(bid => bid.proposalId === projectId);
  };

  if (loading) return <div className="max-w-6xl mx-auto p-6">Loading projects...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Active Projects</h1>
      
      <div className="space-y-6">
        {projects.map(project => {
          const projectBids = getBidsForProject(project.proposalId);
          const acceptedBid = projectBids.find(bid => bid.status === 'approved');
          
          return (
            <div key={project.proposalId} className="border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="font-semibold text-xl mb-2">{project.title}</h2>
                  <p className="text-gray-600 mb-1">{project.orgName}</p>
                  <p className="text-green-600 font-medium text-lg">Budget: ${project.amountUSD}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">
                    {projectBids.length} bids • {acceptedBid ? 'Contract awarded' : 'Accepting bids'}
                  </p>
                  <div className="space-x-2">
                    <Link 
                      href={`/projects/${project.proposalId}`}
                      className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                    >
                      View Details
                    </Link>
                    <Link 
                      href={`/bids/new?proposalId=${project.proposalId}`}
                      className="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
                    >
                      Submit Bid
                    </Link>
                  </div>
                </div>
              </div>

              {acceptedBid && (
                <div className="bg-gray-50 p-3 rounded mt-3">
                  <h4 className="font-medium mb-2">Accepted Bid:</h4>
                  <p className="text-sm">
                    <strong>{acceptedBid.vendorName}</strong> • 
                    ${acceptedBid.priceUSD} • 
                    {acceptedBid.days} days
                  </p>
                  <Link 
                    href={`/admin/proposals/${project.proposalId}/bids/${acceptedBid.bidId}`}
                    className="text-blue-600 text-sm hover:underline mt-2 inline-block"
                  >
                    Manage project →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg mb-4">No active projects available for bidding.</p>
          <Link 
            href="/new" 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 inline-block"
          >
            Create a Project Proposal
          </Link>
        </div>
      )}
    </div>
  );
}