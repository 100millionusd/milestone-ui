// src/app/api/milestones/[bidId]/[milestoneIndex]/archive/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;                 // NEW
export const fetchCache = 'force-no-store';  // NEW

const prisma = new PrismaClient();
const NO_STORE = { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }; // NEW

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
      return NextResponse.json({ error: 'bad_request' }, { status: 400, ...NO_STORE }); // NEW
    }

    const milestone = await prisma.milestone.findUnique({
      where: { bidId_milestoneIndex: { bidId, milestoneIndex } },
      select: {                                 // NEW (only what we need)
        bidId: true,
        milestoneIndex: true,
        archived: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
      },
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
    }, NO_STORE); // NEW
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500, ...NO_STORE } // NEW
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
      return NextResponse.json({ error: 'bad_request' }, { status: 400, ...NO_STORE }); // NEW
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
      select: {                               // NEW
        bidId: true,
        milestoneIndex: true,
        archived: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
      },
    });

    return NextResponse.json({ ok: true, milestone }, { status: 200, ...NO_STORE }); // NEW
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500, ...NO_STORE } // NEW
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
      return NextResponse.json({ error: 'bad_request' }, { status: 400, ...NO_STORE }); // NEW
    }

    const existing = await prisma.milestone.findUnique({
      where: { bidId_milestoneIndex: { bidId, milestoneIndex } },
      select: { bidId: true }, // NEW
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
      }, NO_STORE); // NEW
    }

    const milestone = await prisma.milestone.update({
      where: { bidId_milestoneIndex: { bidId, milestoneIndex } },
      data: {
        archived: false,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
      },
      select: {                               // NEW
        bidId: true,
        milestoneIndex: true,
        archived: true,
        archivedAt: true,
        archivedBy: true,
        archiveReason: true,
      },
    });

    return NextResponse.json({ ok: true, milestone }, { status: 200, ...NO_STORE }); // NEW
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500, ...NO_STORE } // NEW
    );
  }
}
