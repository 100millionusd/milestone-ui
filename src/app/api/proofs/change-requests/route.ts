// src/app/api/proofs/change-requests/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

/**
 * GET /api/proofs/change-requests?proposalId=123&include=responses
 * - returns change requests for a proposal
 * - when include=responses, it attaches vendor replies by reading Proof rows for the same proposal/milestones
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proposalId = Number(searchParams.get('proposalId'));
    const include = String(searchParams.get('include') || '').toLowerCase();

    if (!Number.isFinite(proposalId)) {
      return NextResponse.json(
        { error: 'bad_request', details: 'proposalId required' },
        { status: 400 }
      );
    }

    // Admin requests (keep your existing behavior: open requests first)
    const requests = await prisma.proofChangeRequest.findMany({
      where: { proposalId, status: 'open' },
      orderBy: [{ createdAt: 'desc' }],
    });

    // Only join replies if explicitly asked
    if (include !== 'responses') {
      return NextResponse.json(requests);
    }

    // Pull all Proof rows for this proposal so we can attach vendor replies
    const proofs = await prisma.proof.findMany({
      where: { proposalId },
      orderBy: [{ createdAt: 'asc' }],
      include: { files: true },
    });

    // Group proofs by milestoneIndex
    const byMilestone = new Map<number, any[]>();
    for (const p of proofs) {
      const mi = typeof p.milestoneIndex === 'number' ? p.milestoneIndex : null;
      if (mi === null) continue;

      const arr = byMilestone.get(mi) || [];
      arr.push({
        id: p.id,
        milestoneIndex: mi,
        note: p.note || null,
        createdAt: p.createdAt,
        files: (p.files || []).map(f => ({
          url: f.url ?? (f.cid ? (process.env.NEXT_PUBLIC_PINATA_GATEWAY
            ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ipfs/${f.cid}`
            : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
                ? `${String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')}/${f.cid}`
                : `https://gateway.pinata.cloud/ipfs/${f.cid}`))
            : undefined),
          cid: f.cid || undefined,
          name: f.name || undefined,
        })),
      });
      byMilestone.set(mi, arr);
    }

    // Attach replies for matching milestoneIndex
    const out = requests.map(r => ({
      ...r,
      responses: byMilestone.get(r.milestoneIndex) || [],
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
    const comment = typeof body.comment === 'string' ? body.comment : null;
    const checklist =
      Array.isArray(body.checklist) ? body.checklist
      : (typeof body.checklist === 'string' && body.checklist.trim()
          ? body.checklist.split(',').map((s: string) => s.trim()).filter(Boolean)
          : []);

    if (!Number.isFinite(proposalId) || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
      return NextResponse.json(
        { error: 'bad_request', details: 'proposalId & milestoneIndex (>=0) required' },
        { status: 400 }
      );
    }

    const row = await prisma.proofChangeRequest.create({
      data: { proposalId, milestoneIndex, comment, checklist, status: 'open' },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'db_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
