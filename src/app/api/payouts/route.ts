// src/app/api/payouts/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bidId = url.searchParams.get('bidId');

    const payouts = await prisma.payout.findMany({
      where: bidId ? { bidId: Number(bidId) } : undefined,
      orderBy: { releasedAt: 'desc' },
    });

    // ✅ Wrap in object — required by frontend normalizePayments()
    return NextResponse.json({ payouts });
  } catch (err) {
    console.error('[payouts API]', err);
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 });
  }
}
