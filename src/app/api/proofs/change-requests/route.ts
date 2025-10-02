// src/app/api/proofs/change-requests/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const proposalId = Number(searchParams.get('proposalId'));
    const bidId =
      searchParams.get('bidId') != null
        ? Number(searchParams.get('bidId'))
        : undefined;

    if (!Number.isFinite(proposalId)) {
      return NextResponse.json(
        { error: 'bad_request', details: 'proposalId required' },
        { status: 400 }
      );
    }

    // include=responses -> return full reply thread
    const includeParam = (searchParams.get('include') || '').toLowerCase();
    const includeResponses = includeParam
      .split(',')
      .map((s) => s.trim())
      .includes('responses');

    // status=open (default) | all | approved | closed | pending
    const statusParam = (searchParams.get('status') || 'open').toLowerCase();

    const where: any = { proposalId };
    if (Number.isFinite(bidId)) where.bidId = bidId;
    if (statusParam !== 'all') where.status = statusParam;

    const rows = await prisma.proofChangeRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: includeResponses
        ? {
            responses: { orderBy: { createdAt: 'asc' } },
            // support alt relation name if your schema uses "replies"
            replies: { orderBy: { createdAt: 'asc' } },
          }
        : undefined,
    });

    // Normalize to a single `responses` array for the UI
    const out = rows.map((r: any) => ({
      ...r,
      responses: Array.isArray(r.responses)
        ? r.responses
        : Array.isArray(r.replies)
        ? r.replies
        : [],
    }));

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: 'db_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const proposalId = Number(body.proposalId);
    const milestoneIndex = Number(body.milestoneIndex);
    const bidId =
      body.bidId != null && Number.isFinite(Number(body.bidId))
        ? Number(body.bidId)
        : undefined;

    const comment =
      typeof body.comment === 'string' ? body.comment : null;

    const checklist =
      Array.isArray(body.checklist)
        ? body.checklist
        : (typeof body.checklist === 'string' && body.checklist.trim()
            ? body.checklist
                .split(',')
                .map((s: string) => s.trim())
                .filter(Boolean)
            : []);

    if (
      !Number.isFinite(proposalId) ||
      !Number.isFinite(milestoneIndex) ||
      milestoneIndex < 0
    ) {
      return NextResponse.json(
        {
          error: 'bad_request',
          details: 'proposalId & milestoneIndex (>=0) required',
        },
        { status: 400 }
      );
    }

    // Base data (schema-safe)
    const baseData: any = {
      proposalId,
      milestoneIndex,
      comment,
      checklist,
      status: 'open',
    };

    // Try to create WITH bidId (for schemas that have it)…
    if (Number.isFinite(bidId)) {
      try {
        const row = await prisma.proofChangeRequest.create({
          data: { ...baseData, bidId },
        });
        return NextResponse.json(row, { status: 201 });
      } catch (err: any) {
        // …but if your schema doesn’t have bidId, fall back to creating WITHOUT it
        const msg = String(err?.message || '');
        const unknownArg =
          msg.includes('Unknown argument `bidId`') ||
          msg.includes('Unknown arg `bidId`') ||
          msg.includes('Unknown argument') && msg.includes('bidId');
        if (!unknownArg) throw err;
      }
    }

    // Create WITHOUT bidId
    const row = await prisma.proofChangeRequest.create({
      data: baseData,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'db_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
