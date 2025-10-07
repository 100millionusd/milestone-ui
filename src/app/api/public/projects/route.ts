// src/app/api/public/projects/route.ts
import { NextResponse } from 'next/server';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  'https://milestone-api-production.up.railway.app';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1) Fetch all bids (public in your API)
    const r = await fetch(`${API_BASE}/bids`, { cache: 'no-store' });
    if (!r.ok) return NextResponse.json([], { status: 200 });

    const bids: any[] = await r.json().catch(() => []);
    const limited = Array.isArray(bids) ? bids.slice(0, 100) : [];

    // 2) For each bid, try to fetch its proposal and proofs (best-effort, never throw)
    const items = await Promise.allSettled(
      limited.map(async (b: any) => {
        const bidId = b?.bidId ?? b?.bid_id ?? b?.id;
        const pid = b?.proposalId ?? b?.proposal_id;

        let proposal: any = null;
        try {
          if (pid != null) {
            const pr = await fetch(`${API_BASE}/proposals/${encodeURIComponent(String(pid))}`, {
              cache: 'no-store',
            });
            if (pr.ok) proposal = await pr.json().catch(() => null);
          }
        } catch {}

        let proofs: any[] = [];
        try {
          if (bidId != null) {
            const prf = await fetch(`${API_BASE}/proofs/${encodeURIComponent(String(bidId))}`, {
              cache: 'no-store',
            });
            if (prf.ok) {
              const arr = await prf.json().catch(() => []);
              proofs = Array.isArray(arr) ? arr : [];
            }
          }
        } catch {}

        // Note: don’t shape here; let the client helper do it
        return { bid: b, proposal, proofs };
      })
    );

    const out = items
      .filter((x) => x.status === 'fulfilled')
      .map((x: any) => x.value);

    return NextResponse.json(out, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    console.error('[public/projects] error', e);
    // NEVER throw to RSC — return empty list instead
    return NextResponse.json([], { status: 200 });
  }
}
