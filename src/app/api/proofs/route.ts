// src/app/api/proofs/route.ts
export const runtime = 'nodejs';         // ensure Node runtime (not Edge) on Netlify
export const revalidate = 0;             // no ISR
export const dynamic = 'force-dynamic';  // always dynamic

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type FileInput = { url?: string; cid?: string; name?: string; path?: string } | string;

function normalizeFileInput(x: FileInput) {
  if (typeof x === 'string') {
    // If it's a bare string, try to guess if it's a URL/CID and keep as url
    return { url: x };
  }
  const o = x || {};
  return {
    url: o.url ?? undefined,
    cid: o.cid ?? undefined,
    name: o.name ?? undefined,
    path: o.path ?? undefined,
  };
}

/** GET /api/proofs?proposalId=110[&milestoneIndex=0]
 *  Returns: Array<{ proposalId, bidId?, milestoneIndex?, note?, files: {url?,cid?,name?,path?}[] }>
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pidRaw = url.searchParams.get('proposalId');
    if (!pidRaw) {
      return NextResponse.json({ error: 'proposalId is required' }, { status: 400 });
    }
    const proposalId = Number(pidRaw);
    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'proposalId must be a number' }, { status: 400 });
    }

    const miRaw = url.searchParams.get('milestoneIndex');
    const hasMi = miRaw !== null && miRaw !== '';
    const mi = hasMi ? Number(miRaw) : null;
    if (hasMi && !Number.isFinite(mi)) {
      return NextResponse.json({ error: 'milestoneIndex must be a number' }, { status: 400 });
    }

    // TODO (optional): auth/role gating here

    const proofs = await prisma.proof.findMany({
      where: { proposalId, ...(hasMi ? { milestoneIndex: mi! } : {}) },
      orderBy: [{ milestoneIndex: 'asc' }, { createdAt: 'asc' }],
      include: { files: true },
    });

    // Normalize to frontend shape
    const payload = proofs.map((p) => ({
      proposalId: p.proposalId,
      bidId: p.bidId ?? undefined,
      milestoneIndex: p.milestoneIndex ?? undefined,
      note: p.note ?? undefined,
      files: p.files.map((f) => ({
        url: f.url ?? undefined,
        cid: f.cid ?? undefined,
        name: f.name ?? undefined,
        path: f.path ?? undefined,
      })),
    }));

    return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } });
  } catch (err: any) {
    console.error('GET /api/proofs error:', err);
    return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
  }
}

/** POST /api/proofs
 *  Body:
 *  {
 *    proposalId: number,
 *    bidId?: number,
 *    milestoneIndex?: number,   // 0-based
 *    note?: string,
 *    createdBy?: string,        // wallet/user id
 *    files: Array<{url?, cid?, name?, path?} | string>
 *  }
 *  Returns: created Proof with files
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const proposalId = Number(body?.proposalId);
    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'proposalId required (number)' }, { status: 400 });
    }

    const bidId = body?.bidId == null ? null : Number(body.bidId);
    if (body?.bidId != null && !Number.isFinite(bidId)) {
      return NextResponse.json({ error: 'bidId must be a number if provided' }, { status: 400 });
    }

    const milestoneIndex =
      body?.milestoneIndex == null ? null : Number(body.milestoneIndex);
    if (body?.milestoneIndex != null && !Number.isFinite(milestoneIndex)) {
      return NextResponse.json({ error: 'milestoneIndex must be a number if provided' }, { status: 400 });
    }

    const filesIn = Array.isArray(body?.files) ? body.files as FileInput[] : [];
    if (filesIn.length === 0) {
      return NextResponse.json({ error: 'files[] required' }, { status: 400 });
    }

    const filesData = filesIn.map(normalizeFileInput).map((f) => ({
      url: f.url ?? null,
      cid: f.cid ?? null,
      name: f.name ?? null,
      path: f.path ?? null,
    }));

    const created = await prisma.proof.create({
      data: {
        proposalId,
        bidId: bidId,
        milestoneIndex: milestoneIndex,
        note: body?.note ?? null,
        createdBy: body?.createdBy ?? null,
        files: { create: filesData },
      },
      include: { files: true },
    });

    // Respond in the same normalized shape as GET (optional)
    const payload = {
      proposalId: created.proposalId,
      bidId: created.bidId ?? undefined,
      milestoneIndex: created.milestoneIndex ?? undefined,
      note: created.note ?? undefined,
      files: created.files.map((f) => ({
        url: f.url ?? undefined,
        cid: f.cid ?? undefined,
        name: f.name ?? undefined,
        path: f.path ?? undefined,
      })),
    };

    return NextResponse.json(payload, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/proofs error:', err);
    return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
  }
}

/** Optional hard block for other verbs */
export function PUT() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export function PATCH() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export function DELETE() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
export function OPTIONS() {
  // same-origin; no special CORS needed, but respond cleanly
  return NextResponse.json({}, { status: 204 });
}
