// src/app/api/milestones/[bidId]/[milestoneIndex]/archive/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

/**
 * GET → return current archive state for this milestone
 */
export async function GET(
  _req: Request,
  ctx: { params: { bidId: string; milestoneIndex: string } }
) {
  try {
    const bidId = Number(ctx?.params?.bidId);
    const milestoneIndex = Number(ctx?.params?.milestoneIndex);
    if (!Number.isFinite(bidId) || !Number.isFinite(milestoneIndex)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const milestone = await prisma.milestone.findUnique({
      where: { bidId_milestoneIndex: { bidId, milestoneIndex } },
    });

    return NextResponse.json({
      ok: true,
      milestone: milestone ?? {
        bidId,
        milestoneIndex,
        archived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/**
 * POST → archive this milestone
 * body: { reason?: string, archivedBy?: number }
 */
export async function POST(
  req: Request,
  ctx: { params: { bidId: string; milestoneIndex: string } }
) {
  try {
    const bidId = Number(ctx?.params?.bidId);
    const milestoneIndex = Number(ctx?.params?.milestoneIndex);
    if (!Number.isFinite(bidId) || !Number.isFinite(milestoneIndex)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason : null;
    const archivedBy = Number.isFinite(Number(body?.archivedBy))
      ? Number(body.archivedBy)
      : null;

    const milestone = await prisma.milestone.upsert({
      where: { bidId_milestoneIndex: { bidId, milestoneIndex } },
      update: {
        archived: true,
        archivedAt: new Date(),
        archivedBy,
        archiveReason: reason,
      },
      create: {
        bidId,
        milestoneIndex,
        archived: true,
        archivedAt: new Date(),
        archivedBy,
        archiveReason: reason,
      },
    });

    return NextResponse.json({ ok: true, milestone }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}

/**
 * DELETE → unarchive this milestone
 */
export async function DELETE(
  _req: Request,
  ctx: { params: { bidId: string; milestoneIndex: string } }
) {
  try {
    const bidId = Number(ctx?.params?.bidId);
    const milestoneIndex = Number(ctx?.params?.milestoneIndex);
    if (!Number.isFinite(bidId) || !Number.isFinite(milestoneIndex)) {
      return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    }

    // If it doesn't exist yet, nothing to unarchive → return not_found=false state
    const existing = await prisma.milestone.findUnique({
      where: { bidId_milestoneIndex: { bidId, milestoneIndex } },
    });

    if (!existing) {
      return NextResponse.json({
        ok: true,
        milestone: {
          bidId,
          milestoneIndex,
          archived: false,
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
      });
    }

    const milestone = await prisma.milestone.update({
      where: { bidId_milestoneIndex: { bidId, milestoneIndex } },
      data: {
        archived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
    });

    return NextResponse.json({ ok: true, milestone }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
