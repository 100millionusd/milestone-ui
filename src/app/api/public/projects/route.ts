// src/app/api/public/projects/route.ts
import { NextResponse } from 'next/server';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  'https://milestone-api-production.up.railway.app';

export const dynamic = 'force-dynamic';

async function getJSON(url: string, fallback: any) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return fallback;
    const j = await r.json().catch(() => fallback);
    return j ?? fallback;
  } catch {
    return fallback;
  }
}

export async function GET() {
  try {
    // 1) Pull proposals (try approved + pending, then fallback to all)
    const approved = await getJSON(`${API_BASE}/proposals?status=approved`, []);
    const pending  = await getJSON(`${API_BASE}/proposals?status=pending`,  []);
    let proposals: any[] = [...approved, ...pending];
    if (!proposals.length) {
      proposals = await getJSON(`${API_BASE}/proposals`, []);
    }

    // 2) Pull all bids once and index by proposal
    const bids: any[] = await getJSON(`${API_BASE}/bids`, []);
    const byProposal = new Map<number, any[]>();
    for (const b of Array.isArray(bids) ? bids : []) {
      const pid = Number(b?.proposalId ?? b?.proposal_id);
      if (!Number.isFinite(pid)) continue;
      const arr = byProposal.get(pid) || [];
      arr.push(b);
      byProposal.set(pid, arr);
    }

    const pickBid = (list?: any[]) => {
      if (!list?.length) return null;
      const approved = list.find((x) => String(x?.status || '').toLowerCase() === 'approved');
      return approved || list[0];
    };

    // 3) Build items: proposal + chosen bid (if any) + proofs (best-effort)
    const limited = proposals.slice(0, 100);
    const results = await Promise.allSettled(
      limited.map(async (p) => {
        const proposalId = Number(p?.proposalId ?? p?.proposal_id ?? p?.id);
        const bid        = pickBid(byProposal.get(proposalId));

        let proofs: any[] = [];
        if (bid) {
          const bidId = Number(bid?.bidId ?? bid?.bid_id ?? bid?.id);
          if (Number.isFinite(bidId)) {
            proofs = await getJSON(`${API_BASE}/proofs/${encodeURIComponent(String(bidId))}`, []);
          }
        }

        return { proposal: p, bid: bid ?? null, proofs };
      })
    );

    const out = results
      .filter((r) => r.status === 'fulfilled')
      .map((r: any) => r.value);

    // Never throw to RSC
    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('[public/projects] error', e);
    return NextResponse.json([], { status: 200 });
  }
}
