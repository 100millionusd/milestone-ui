'use client';

import React, { useState, useEffect } from 'react';
import { getProposals, approveProposal, rejectProposal } from '@/lib/api';
import { validateProposal } from '@/services/aiValidator';

type Attachment = {
  cid?: string;
  url?: string;
  name: string;
  size?: number;
  mimetype?: string;
};

interface Proposal {
  proposalId: number;
  orgName: string;
  title: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  contact: string;
  amountUSD: number;
  address?: string;
  city?: string;
  country?: string;
  docs?: Attachment[];
  cid?: string;
}

interface AdminProposalsClientProps {
  initialProposals?: Proposal[];
}

const GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

export default function AdminProposalsClient({ initialProposals = [] }: AdminProposalsClientProps) {
  const [proposals, setProposals] = useState<Proposal[]>(initialProposals);
  const [loading, setLoading] = useState(initialProposals.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [validations, setValidations] = useState<Record<number, any>>({});

  useEffect(() => {
    if (initialProposals.length === 0) fetchProposals();
  }, [initialProposals.length]);

  const fetchProposals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getProposals();

      const results: Record<number, any> = {};
      for (const p of data) {
        try {
          results[p.proposalId] = await validateProposal(p);
        } catch {
          results[p.proposalId] = { comments: 'AI validation failed.' };
        }
      }

      setValidations(results);
      setProposals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch proposals');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (proposalId: number) => {
    try {
      await approveProposal(proposalId);
      setProposals(prev =>
        prev.map(p => (p.proposalId === proposalId ? { ...p, status: 'approved' } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve proposal');
    }
  };

  const handleReject = async (proposalId: number) => {
    try {
      await rejectProposal(proposalId);
      setProposals(prev =>
        prev.map(p => (p.proposalId === proposalId ? { ...p, status: 'rejected' } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  };

  if (loading) return <div className="p-6">Loading proposals...</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-6">Admin — Proposals Management</h1>

        <div className="grid gap-5">
          {proposals.map((p) => (
            <div
              key={p.proposalId}
              className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6"
            >
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{p.title}</h3>
                  <div className="mt-1 text-sm text-slate-600">
                    <span className="font-medium">{p.orgName}</span>
                    {(p.city || p.country) && (
                      <span> · {[p.city, p.country].filter(Boolean).join(', ')}</span>
                    )}
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{p.summary}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">#{p.proposalId}</div>
                  <div className="mt-2 text-sm">
                    <span className="text-slate-500">Requested: </span>
                    <span className="font-semibold">${p.amountUSD.toLocaleString()}</span>
                  </div>
                  <div className="mt-2">
                    <StatusPill status={p.status} />
                  </div>
                </div>
              </div>

              {/* Contact & meta */}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="text-slate-700">
                  <span className="font-semibold text-slate-900">Contact:</span> {p.contact}
                </p>
                {(p.address || p.city || p.country) && (
                  <p className="mt-1 text-slate-700">
                    <span className="font-semibold text-slate-900">Address:</span>{' '}
                    {[p.address, p.city, p.country].filter(Boolean).join(', ')}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Submitted: {new Date(p.createdAt).toLocaleString()}
                </p>
              </div>

              {/* AI Validation */}
              {validations[p.proposalId] && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
                  <h4 className="font-medium text-blue-800 mb-1">AI Validation Report</h4>
                  <ul className="list-disc ml-5 text-blue-700 space-y-1">
                    <li>Org name valid: {String(validations[p.proposalId].orgNameValid ?? 'unknown')}</li>
                    <li>Address valid: {String(validations[p.proposalId].addressValid ?? 'unknown')}</li>
                    <li>Budget check: {String(validations[p.proposalId].budgetCheck ?? 'unknown')}</li>
                    <li>Attachments valid: {String(validations[p.proposalId].attachmentsValid ?? 'unknown')}</li>
                  </ul>
                  <p className="mt-2 text-xs text-blue-600">
                    {validations[p.proposalId].comments}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  onClick={() => handleApprove(p.proposalId)}
                  disabled={p.status === 'approved'}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-emerald-700 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(p.proposalId)}
                  disabled={p.status === 'rejected'}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-rose-700 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}

          {proposals.length === 0 && (
            <div className="text-center py-10 text-slate-500 bg-white border border-slate-200 rounded-2xl">
              No proposals found.
            </div>
          )}
        </div>
      </div>

      {/* Lightbox for images */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 p-4 md:p-8"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="preview" className="mx-auto max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function StatusPill({ status }: { status: string }) {
  const classes =
    status === 'approved'
      ? 'bg-green-100 text-green-800'
      : status === 'rejected'
      ? 'bg-red-100 text-red-800'
      : status === 'completed'
      ? 'bg-blue-100 text-blue-800'
      : 'bg-yellow-100 text-yellow-800';

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${classes}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
