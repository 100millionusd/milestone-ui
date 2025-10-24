// src/app/projects/[id]/page.tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getProposal, getBids, getBid, getProofs, payMilestone } from '@/lib/api';
import SafePayButton from '@/components/SafePayButton';
import useMilestonesUpdated from '@/hooks/useMilestonesUpdated';
import { isPaidMs, isSafeInFlight, shouldShowPayButtons } from '@/lib/milestonePaymentState';

const PENDING_LS_KEY = 'mx_pay_pending';
const mkKey = (bidId: number, idx: number) => `${bidId}-${idx}`;

function loadPending(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try { return new Set(JSON.parse(localStorage.getItem(PENDING_LS_KEY) || '[]')); } catch { return new Set(); }
}
function savePending(s: Set<string>) { try { localStorage.setItem(PENDING_LS_KEY, JSON.stringify(Array.from(s))); } catch {} }

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [bids, setBids] = useState<any[]>([]);
  const [pending, setPending] = useState<Set<string>>(() => loadPending());
  const [loading, setLoading] = useState(true);
  const bcRef = useRef<BroadcastChannel | null>(null);

  const addPending = (k: string) => setPending(prev => { const n = new Set(prev); n.add(k); savePending(n); return n; });
  const removePending = (k: string) => setPending(prev => { const n = new Set(prev); n.delete(k); savePending(n); return n; });

  const load = useCallback(async () => {
    setLoading(true);
    const list = await getBids(); // or fetch per project if you have an API
    setBids(Array.isArray(list) ? list : []);
    // clear pending for paid items
    for (const bid of list || []) {
      const ms: any[] = Array.isArray(bid.milestones) ? bid.milestones : [];
      for (let i = 0; i < ms.length; i++) if (isPaidMs(ms[i])) removePending(mkKey(bid.bidId, i));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useMilestonesUpdated(() => load());

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try { bc = new BroadcastChannel('mx-payments'); bcRef.current = bc; } catch {}
    if (bc) {
      bc.onmessage = (e: MessageEvent) => {
        const { type, bidId, milestoneIndex } = (e?.data || {}) as any;
        if (type === 'mx:pay:queued') { addPending(mkKey(bidId, milestoneIndex)); load(); }
        if (type === 'mx:pay:done')   { removePending(mkKey(bidId, milestoneIndex)); load(); }
        if (type === 'mx:ms:updated') { load(); }
      };
    }
    return () => { try { bc?.close(); } catch {} };
  }, [load]);

  async function pollUntilPaid(bidId: number, idx: number, tries = 40, intervalMs = 3000) {
    const key = mkKey(bidId, idx);
    for (let i = 0; i < tries; i++) {
      const bid = await getBid(bidId);
      const m = bid?.milestones?.[idx];
      if (m && isPaidMs(m)) { removePending(key); setBids(prev => prev.map(b => b.bidId === bidId ? { ...b, milestones: prev.find(x => x.bidId === bidId)?.milestones?.map((mm:any,j:number)=> j===idx?{...mm,...m}:mm) } : b)); bcRef.current?.postMessage({ type:'mx:pay:done', bidId, milestoneIndex: idx}); return; }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    // final check
    try {
      const bid = await getBid(bidId);
      if (isPaidMs(bid?.milestones?.[idx])) removePending(key);
    } catch {}
  }

  const handlePay = async (bidId: number, idx: number) => {
    await payMilestone(bidId, idx);
    const key = mkKey(bidId, idx);
    addPending(key);
    bcRef.current?.postMessage({ type: 'mx:pay:queued', bidId, milestoneIndex: idx });
    pollUntilPaid(bidId, idx).catch(()=>{});
  };

  if (loading) return <div className="max-w-5xl mx-auto py-8">Loading…</div>;

  return (
    <div className="max-w-5xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Project {id}</h1>

      {bids.map((bid) => (
        <div key={bid.bidId} className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">{bid.vendorName} — Proposal #{bid.proposalId}</h2>
            <Link href={`/admin/proposals/${bid.proposalId}/bids/${bid.bidId}`} className="text-sm text-blue-600 hover:underline">Admin →</Link>
          </div>

          <div className="space-y-4">
            {(Array.isArray(bid.milestones) ? bid.milestones : []).map((m: any, idx: number) => {
              const key = mkKey(bid.bidId, idx);
              const approved = m?.completed === true || m?.approved === true || m?.status === 'completed';
              const localPending = pending.has(key);
              const showPay = shouldShowPayButtons({ approved, milestone: m, localPending });

              return (
                <div key={`${bid.bidId}:${idx}`} className="border-t pt-4 mt-4">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{m.name}</p>
                    {approved && <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">Approved</span>}
                    {(!isPaidMs(m) && (localPending || isSafeInFlight(m))) && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Payment Pending</span>
                    )}
                    {isPaidMs(m) && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">Paid</span>}
                  </div>

                  <p className="text-sm text-gray-600">Amount: ${m.amount} | Due: {m.dueDate}</p>

                  {showPay && (
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => handlePay(bid.bidId, idx)}
                        className="px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white"
                      >
                        Release Payment
                      </button>

                      <SafePayButton
                        bidId={bid.bidId}
                        milestoneIndex={idx}
                        amountUSD={Number(m?.amount || 0)}
                        onQueued={() => {
                          addPending(key);
                          bcRef.current?.postMessage({ type: 'mx:pay:queued', bidId: bid.bidId, milestoneIndex: idx });
                          pollUntilPaid(bid.bidId, idx).catch(()=>{});
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
