// src/app/api/payouts/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // adjust path if different

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const vendorId = url.searchParams.get('vendorId'); // optional filtering

    const payouts = await prisma.payout.findMany({
      where: vendorId ? { vendorId: Number(vendorId) } : undefined,
      orderBy: { released_at: 'desc' },
    });

    return NextResponse.json({ payouts });
  } catch (err) {
    console.error('[payouts API]', err);
    return NextResponse.json({ error: 'Failed to load payouts' }, { status: 500 });
  }
}
