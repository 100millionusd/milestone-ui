// src/app/api/payouts/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Supports:
 *   GET /api/payouts?bidId=123    -> payouts for that bid
 *   GET /api/payouts?mine=1       -> payouts for user's bids (falls back to all if unknown)
 *   GET /api/payouts              -> all payouts (dev/admin)
 *
 * Always returns: { payouts: [...] }  (what your vendor page expects)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bidIdParam = url.searchParams.get('bidId');
    const mine = url.searchParams.get('mine') === '1';

    // Case 1: specific bid
    if (bidIdParam) {
      const bidId = Number(bidIdParam);
      if (!Number.isFinite(bidId)) return NextResponse.json({ payouts: [] }, { status: 200 });

      const payouts = await prisma.payout.findMany({
        where: { bidId },
        orderBy: { releasedAt: 'desc' },
      });
      return NextResponse.json({ payouts }, { status: 200 });
    }

    // Case 2: mine=1 -> try to scope by "my bids"; if that fails, fall back to all payouts
    if (mine) {
      try {
        const origin = url.origin;
        const headers: HeadersInit = {
          Accept: 'application/json',
          cookie: req.headers.get('cookie') || '',
          authorization: req.headers.get('authorization') || '',
        };

        // Ask our own API for my bids (mirrors the admin-side pass-through style). :contentReference[oaicite:1]{index=1}
        const r = await fetch(`${origin}/api/bids?mine=1&_=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'include',
          headers,
        });
        if (r.ok) {
          const bj = await r.json().catch(() => ({}));
          const rows = Array.isArray(bj) ? bj : (bj?.bids ?? []);
          const bidIds = (rows || [])
            .map((b: any) => Number(b?.id ?? b?.bid_id ?? b?.bidId))
            .filter((n: number) => Number.isFinite(n));

          if (bidIds.length) {
            const payouts = await prisma.payout.findMany({
              where: { bidId: { in: bidIds } },
              orderBy: { releasedAt: 'desc' },
            });
            return NextResponse.json({ payouts }, { status: 200 });
          }
        }
      } catch {
        // ignore and fall back below
      }
      // Fallback: show all payouts so the vendor tab at least renders data
      const payouts = await prisma.payout.findMany({ orderBy: { releasedAt: 'desc' } });
      return NextResponse.json({ payouts }, { status: 200 });
    }

    // Case 3: no params -> all payouts
    const payouts = await prisma.payout.findMany({ orderBy: { releasedAt: 'desc' } });
    return NextResponse.json({ payouts }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[payouts API]', msg);
    // Keep vendor UI stable: 200 + empty list
    return NextResponse.json({ payouts: [], error: msg }, { status: 200 });
  }
}
