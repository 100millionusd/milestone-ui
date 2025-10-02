// src/app/api/proofs/change-requests/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

function gatewayBase(): string {
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')
        : 'https://gateway.pinata.cloud/ipfs');
  return gw;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proposalId = Number(searchParams.get('proposalId'));
    const includeResponses = (searchParams.get('include') || '').toLowerCase().includes('responses');

    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId required' }, { status: 400 });
    }

    // Load all requests for the project
    const requests = await prisma.proofChangeRequest.findMany({
      where: { proposalId },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (!includeResponses || requests.length === 0) {
      return NextResponse.json(requests);
    }

    // For each request, pull ALL Proof rows for same milestone created at/after the request
    // (i.e., every vendor reply, with files)
    const out = [];
    for (const r of requests) {
      const proofs = await prisma.proof.findMany({
        where: {
          proposalId,
          milestoneIndex: r.milestoneIndex,
          createdAt: { gte: r.createdAt },
        },
        orderBy: [{ createdAt: 'asc' }],
        include: { files: true },
      });

      const responses = proofs.map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        note: p.note || '',
        files: (p.files || []).map((f: any) => ({
          url: f.url ?? (f.cid ? `${gatewayBase()}/${f.cid}` : undefined),
          cid: f.cid || undefined,
          name: f.name || undefined,
        })),
      }));

      out.push({
        ...r,
        responses,
      });
    }

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
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
      return NextResponse.json({ error: 'bad_request', details: 'proposalId & milestoneIndex (>=0) required' }, { status: 400 });
    }

    const row = await prisma.proofChangeRequest.create({
      data: { proposalId, milestoneIndex, comment, checklist, status: 'open' },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
