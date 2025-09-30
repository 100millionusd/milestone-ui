// src/app/api/proofs/route.ts
export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

// dynamic import prisma; if it fails, return a helpful JSON instead of a 500 black box
let prisma: any = null;
let prismaImportError: string | null = null;
try {
  const mod = await import('../../../lib/prisma'); // relative to /src/app/api/proofs/route.ts
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
    return NextResponse.json({ error: 'bad_request', details: 'proposalId is required and must be a number' }, { status: 400 });
  }

  if (!prisma) {
    return NextResponse.json({
      error: 'prisma_import_failed',
      message: prismaImportError || 'unknown import error',
      hints: [
        'Ensure src/lib/prisma.ts exists and exports `prisma`.',
        'Ensure @prisma/client is installed and `npx prisma generate` ran.',
        'Netlify: add [functions].included_files for node_modules/.prisma and @prisma/client in netlify.toml',
      ],
      env: {
        has_DATABASE_URL: !!process.env.DATABASE_URL,
        DATABASE_URL_masked: maskDbUrl(process.env.DATABASE_URL),
      },
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
      return NextResponse.json({ error: 'bad_request', details: 'milestoneIndex must be a number' }, { status: 400 });
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
    return NextResponse.json({
      error: 'db_error',
      message: String(err?.message || err),
    }, { status: 500 });
  }
}
