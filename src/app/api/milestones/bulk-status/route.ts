// src/app/api/milestones/bulk-status/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

/**
 * GET /api/milestones/bulk-status?bidId=123&indices=0,1,2,3,4
 * Returns a map: { [milestoneIndex]: { archived:boolean, archivedAt?:string|null, archiveReason?:string|null } }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bidId = Number(searchParams.get('bidId'));
    if (!Number.isFinite(bidId)) {
      return NextResponse.json(
        { error: 'bad_request', message: 'bidId required' },
        { status: 400 }
      );
    }

    const indicesParam = (searchParams.get('indices') || '').trim();
    let indices: number[] | null = null;
    if (indicesParam) {
      indices = indicesParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      if (!indices.length) indices = null;
    }

    const where: any = { bidId };
    if (indices) where.milestoneIndex = { in: indices };

    const rows = await prisma.milestone.findMany({
      where,
      select: {
        milestoneIndex: true,
        archived: true,
        archivedAt: true,
        archiveReason: true,
      },
    });

    const out: Record<number, { archived: boolean; archivedAt?: string | null; archiveReason?: string | null }> = {};

    // If caller sent indices, initialize all to false
    if (indices) {
      for (const i of indices) out[i] = { archived: false };
    }

    // Fill with DB hits
    for (const r of rows) {
      out[r.milestoneIndex] = {
        archived: !!r.archived,
        archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
        archiveReason: r.archiveReason ?? null,
      };
    }

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
