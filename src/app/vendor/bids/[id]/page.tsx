'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import * as api from '@/lib/api';
import Agent2PromptBox from '@/components/Agent2PromptBox';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';

type Loaded = 'idle' | 'loading' | 'ready' | 'error';
type Role = 'admin' | 'vendor' | 'guest';

export default function VendorBidDetailPage() {
  const params = useParams<{ id: string }>();
  const bidId = Number(params?.id);

  const { role: ctxRole, address: ctxAddr } = useWeb3Auth();

  const [status, setStatus] = useState<Loaded>('loading');
  const [error, setError] = useState<string | null>(null);
  const [bid, setBid] = useState<any>(null);

  // server-verified identity (JWT cookie -> /auth/role)
  const [who, setWho] = useState<{ address?: string; role?: Role } | null>(null);
  const [whoLoaded, setWhoLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // load bid
const raw = await api.getBid(bidId);

const fromArray =
  (Array.isArray(raw?.docs)  && raw.docs.find((d: any)  => d?.url)) ||
  (Array.isArray(raw?.files) && raw.files.find((f: any) => f?.url)) ||
  null;

// If normal bid already has doc, keep it exactly as-is.
// If template bid lacks doc but has docs/files, add a single doc.
// Otherwise, leave raw untouched.
const b = raw?.doc ? raw : (fromArray ? { ...raw, doc: fromArray } : raw);

setBid(b);
setStatus('ready');
      } catch (e: any) {
        setError(e?.message || 'Failed to load bid');
        setStatus('error');
      }

      try {
        // load server identity (cookie/JWT)
        const auth = await api.getAuthRoleOnce(); // { address, role } | { role: 'guest' }
        setWho(auth);
      } catch {
        setWho(null);
      } finally {
        setWhoLoaded(true);
      }
    })();
  }, [bidId]);

  const lc = (s?: string) => (s ? s.toLowerCase().trim() : '');

  const bidOwner = lc(bid?.walletAddress);
  const serverAddr = lc(who?.address);
  const web3Addr   = lc(ctxAddr);

  // ✅ consider user the owner if either the server cookie OR Web3 address matches
  const isOwner = !!bidOwner && (bidOwner === serverAddr || bidOwner === web3Addr);

  // prefer server role, fall back to Web3Auth role
  const effectiveRole = (who?.role || ctxRole || 'guest') as Role;

  // can run Agent2 if admin or owner
  const canRun = effectiveRole === 'admin' || isOwner;

  function onAfterAnalyze(updated: any) {
    setBid(updated);
  }

  if (status === 'loading') {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">My Bid #{bidId}</h1>
          <Link href="/vendor/dashboard" className="underline">← Back</Link>
        </div>
        <div className="py-20 text-center text-gray-500">Loading…</div>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">My Bid #{bidId}</h1>
          <Link href="/vendor/dashboard" className="underline">← Back</Link>
        </div>
        <div className="p-4 rounded border bg-rose-50 text-rose-700">{error}</div>
      </main>
    );
  }

  const analysis = bid?.aiAnalysis || null;
  const ms = Array.isArray(bid?.milestones) ? bid.milestones : [];

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Bid #{bidId}</h1>
        <Link href="/vendor/dashboard" className="underline">← Back</Link>
      </div>

      {/* Bid Summary */}
      <section className="rounded border bg-white p-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Info label="Project" value={`#${bid.proposalId}`} />
          <Info label="Vendor" value={bid.vendorName} />
          <Info label="Price" value={`$${bid.priceUSD} ${bid.preferredStablecoin}`} />
          <Info label="Timeline" value={`${bid.days} days`} />
          <div className="sm:col-span-2">
            <div className="text-sm text-gray-500">Notes</div>
            <div className="font-medium whitespace-pre-wrap">{bid.notes || '—'}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-sm text-gray-500 mb-1">Milestones</div>
          <ul className="space-y-2">
            {ms.map((m: any, i: number) => (
              <li key={i} className="rounded border p-3">
                <div className="font-medium">{m.name}</div>
                <div className="text-sm text-gray-600">
                  Amount: ${m.amount} · Due: {new Date(m.dueDate).toLocaleDateString()}
                  {m.completed ? ' · Completed' : ''}
                </div>
                {m.proof && <div className="text-sm text-gray-500 mt-1">Proof: {m.proof}</div>}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Agent 2 Analysis + Prompt */}
      <section className="relative z-10">
        <Agent2PromptBox
          bidId={bidId}
          analysis={analysis}
          role={effectiveRole}
          canRun={canRun}              
          onAfter={onAfterAnalyze}
        />

        {/* Show the warning only after we’ve checked the cookie */}
        {whoLoaded && !canRun && (
          <div className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
            You can view the analysis, but only the bid owner or an admin can run Agent 2.
          </div>
        )}
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-gray-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
