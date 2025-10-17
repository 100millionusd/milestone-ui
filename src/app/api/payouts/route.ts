// src/app/api/payouts/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bidId = url.searchParams.get('bidId'); // optional

    const payouts = await prisma.payout.findMany({
      where: bidId ? { bidId: Number(bidId) } : undefined,
      orderBy: { releasedAt: 'desc' },
    });

    // IMPORTANT: your frontend expects an object with a `payouts` array
    return NextResponse.json({ payouts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[payouts API]', message);
    // expose the real error while you debug
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
