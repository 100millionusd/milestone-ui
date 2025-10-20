// UPDATE your existing /api/milestones/bulk-status/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

/**
 * GET /api/milestones/bulk-status?bidIds=1,2,3
 * Returns a nested map: { [bidId]: { [milestoneIndex]: { archived:boolean, archivedAt?:string|null, archiveReason?:string|null } } }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const bidIdsParam = searchParams.get('bidIds');
    
    if (!bidIdsParam) {
      return NextResponse.json(
        { error: 'bad_request', message: 'bidIds required' },
        { status: 400 }
      );
    }

    const bidIds = bidIdsParam.split(',').map(Number).filter(Number.isFinite);
    
    if (!bidIds.length) {
      return NextResponse.json(
        { error: 'bad_request', message: 'No valid bidIds' },
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

    const where: any = { bidId: { in: bidIds } };
    if (indices) where.milestoneIndex = { in: indices };

    const rows = await prisma.milestone.findMany({
      where,
      select: {
        bidId: true,
        milestoneIndex: true,
        archived: true,
        archivedAt: true,
        archiveReason: true,
      },
    });

    // Create nested structure: { bidId: { milestoneIndex: archiveInfo } }
    const out: Record<number, Record<number, { archived: boolean; archivedAt?: string | null; archiveReason?: string | null }>> = {};

    // Initialize all requested bidIds
    bidIds.forEach(bidId => {
      out[bidId] = {};
    });

    // Fill with data from database
    rows.forEach(row => {
      if (!out[row.bidId]) {
        out[row.bidId] = {};
      }
      out[row.bidId][row.milestoneIndex] = {
        archived: !!row.archived,
        archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
        archiveReason: row.archiveReason ?? null,
      };
    });

    // Fill missing milestones with default values
    bidIds.forEach(bidId => {
      const milestoneIndices = indices || [0, 1, 2, 3, 4]; // Default to first 5 milestones
      milestoneIndices.forEach(index => {
        if (out[bidId][index] === undefined) {
          out[bidId][index] = { archived: false };
        }
      });
    });

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    console.error('Bulk status error:', e);
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}