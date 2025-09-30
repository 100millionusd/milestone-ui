// src/app/api/proofs/route.ts
export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

// Load prisma (relative path avoids tsconfig alias issues)
let prisma: any = null;
let prismaImportError: string | null = null;
try {
  const mod = await import('../../../lib/prisma');
  prisma = (mod as any).prisma;
} catch (e: any) {
  prismaImportError = String(e?.message || e);
}

function maskDbUrl(url?: string) {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const host = u.hostname;
    const db = (u.pathname || '').replace(/^\//, '');
    return `${u.protocol}//${host}/${db}?sslmode=${u.searchParams.get('sslmode') || ''}`;
  } catch { return 'unparseable'; }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const pidRaw = url.searchParams.get('proposalId');
  const proposalId = Number(pidRaw);
  const diag = url.searchParams.get('diag') === '1';

  if (!pidRaw || !Number.isFinite(proposalId)) {
    return NextResponse.json(
      { error: 'bad_request', details: 'proposalId is required and must be a number' },
      { status: 400 }
    );
  }

  if (!prisma) {
    return NextResponse.json({
      error: 'prisma_import_failed',
      message: prismaImportError || 'unknown import error',
      env: {
        has_DATABASE_URL: !!process.env.DATABASE_URL,
        DATABASE_URL_masked: maskDbUrl(process.env.DATABASE_URL),
      },
      hints: [
        'Ensure src/lib/prisma.ts exists and exports `prisma`.',
        'Ensure @prisma/client is installed and `npx prisma generate` ran.',
      ],
    }, { status: 500 });
  }

  if (diag) {
    let ping: any = null, pingErr: string | null = null, version: any = null;
    try { version = (await import('@prisma/client')).Prisma?.prismaVersion; } catch {}
    try { ping = await prisma.$queryRaw`SELECT 1::int AS x`; } catch (e: any) { pingErr = String(e?.message || e); }
    return NextResponse.json({
      ok: true,
      node: process.versions.node,
      env: {
        has_DATABASE_URL: !!process.env.DATABASE_URL,
        DATABASE_URL_masked: maskDbUrl(process.env.DATABASE_URL),
      },
      prismaVersion: version,
      pingResult: ping,
      pingError: pingErr,
    }, { headers: { 'cache-control': 'no-store' } });
  }

  try {
    const miRaw = url.searchParams.get('milestoneIndex');
    const hasMi = miRaw !== null && miRaw !== '';
    const mi = hasMi ? Number(miRaw) : null;
    if (hasMi && !Number.isFinite(mi)) {
      return NextResponse.json(
        { error: 'bad_request', details: 'milestoneIndex must be a number' },
        { status: 400 }
      );
    }

    const proofs = await prisma.proof.findMany({
      where: { proposalId, ...(hasMi ? { milestoneIndex: mi! } : {}) },
      orderBy: [{ milestoneIndex: 'asc' }, { createdAt: 'asc' }],
      include: { files: true },
    });

    const payload = proofs.map((p: any) => ({
      proposalId: p.proposalId,
      bidId: p.bidId ?? undefined,
      milestoneIndex: p.milestoneIndex ?? undefined,
      note: p.note ?? undefined,
      files: (p.files || []).map((f: any) => ({
        url: f.url ?? undefined,
        cid: f.cid ?? undefined,
        name: f.name ?? undefined,
        path: f.path ?? undefined,
      })),
    }));

    return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ error: 'db_error', message: String(err?.message || err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!prisma) {
    return NextResponse.json({
      error: 'prisma_import_failed',
      message: prismaImportError || 'unknown import error',
      env: {
        has_DATABASE_URL: !!process.env.DATABASE_URL,
        DATABASE_URL_masked: maskDbUrl(process.env.DATABASE_URL),
      },
    }, { status: 500 });
  }

  try {
    const body = await req.json();

    const proposalId = Number(body?.proposalId);
    const milestoneIndex = Number(body?.milestoneIndex); // zero-based (M1=0, M2=1)
    const bidId = body?.bidId != null ? Number(body.bidId) : null;
    const note = typeof body?.note === 'string' ? body.note : null;
    const createdBy = typeof body?.createdBy === 'string' ? body.createdBy : 'vendor';

    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId (number) is required' }, { status: 400 });
    }
    if (!Number.isFinite(milestoneIndex)) {
      return NextResponse.json({ error: 'bad_request', details: 'milestoneIndex (number) is required' }, { status: 400 });
    }

    const filesInput = Array.isArray(body?.files) ? body.files : [];
    const filesCreate = filesInput
      .filter((f: any) => f && (f.url || f.cid || f.name || f.path))
      .map((f: any) => ({
        url:  typeof f.url  === 'string' ? f.url  : null,
        cid:  typeof f.cid  === 'string' ? f.cid  : null,
        name: typeof f.name === 'string' ? f.name : null,
        path: typeof f.path === 'string' ? f.path : null,
      }));

    const created = await prisma.proof.create({
      data: {
        proposalId,
        milestoneIndex,
        bidId: Number.isFinite(bidId as any) ? bidId : null,
        note,
        createdBy,
        files: filesCreate.length ? { create: filesCreate } : undefined,
      },
      include: { files: true },
    });

    // Normalize response shape to match GET
    const payload = {
      proposalId: created.proposalId,
      bidId: created.bidId ?? undefined,
      milestoneIndex: created.milestoneIndex ?? undefined,
      note: created.note ?? undefined,
      files: (created.files || []).map((f: any) => ({
        url: f.url ?? undefined,
        cid: f.cid ?? undefined,
        name: f.name ?? undefined,
        path: f.path ?? undefined,
      })),
    };

    return NextResponse.json(payload, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ error: 'db_error', message: String(err?.message || err) }, { status: 500 });
  }
}
