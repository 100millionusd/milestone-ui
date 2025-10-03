// src/app/api/milestones/bulk-archive/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

/**
 * POST → bulk archive
 * body: { items: Array<{ bidId: number; milestoneIndex: number; reason?: string; archivedBy?: number }> }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json(
        { error: 'bad_request', message: 'items[] required' },
        { status: 400 }
      );
    }

    const now = new Date();
    const ops = items.map((it: any) => {
      const bidId = Number(it?.bidId);
      const milestoneIndex = Number(it?.milestoneIndex);
      const reason = typeof it?.reason === 'string' ? it.reason : null;
      const archivedBy = Number.isFinite(Number(it?.archivedBy))
        ? Number(it.archivedBy)
        : null;

      if (!Number.isFinite(bidId) || !Number.isFinite(milestoneIndex)) {
        throw new Error('Invalid bidId/milestoneIndex');
      }

      return prisma.milestone.upsert({
        where: { bidId_milestoneIndex: { bidId, milestoneIndex } },
        update: {
          archived: true,
          archivedAt: now,
          archivedBy,
          archiveReason: reason,
        },
        create: {
          bidId,
          milestoneIndex,
          archived: true,
          archivedAt: now,
          archivedBy,
          archiveReason: reason,
        },
      });
    });

    const results = await prisma.$transaction(ops);
    return NextResponse.json({ ok: true, count: results.length }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/**
 * DELETE → bulk unarchive
 * body: { items: Array<{ bidId: number; milestoneIndex: number }> }
 */
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json(
        { error: 'bad_request', message: 'items[] required' },
        { status: 400 }
      );
    }

    const ops = items.map((it: any) => {
      const bidId = Number(it?.bidId);
      const milestoneIndex = Number(it?.milestoneIndex);
      if (!Number.isFinite(bidId) || !Number.isFinite(milestoneIndex)) {
        throw new Error('Invalid bidId/milestoneIndex');
      }

      return prisma.milestone.updateMany({
        where: { bidId, milestoneIndex },
        data: {
          archived: false,
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
      });
    });

    const results = await prisma.$transaction(ops);
    const count = results.reduce((s, r) => s + (r?.count || 0), 0);
    return NextResponse.json({ ok: true, count }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
