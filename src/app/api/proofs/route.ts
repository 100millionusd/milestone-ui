// src/app/api/proofs/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // your prisma client

// Helpers for gateway normalization (keep your existing ones if you already have)
const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY.replace(/^https?:\/\//,'').replace(/\/+$/,'')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? process.env.NEXT_PUBLIC_IPFS_GATEWAY.replace(/\/+$/,'')
        : 'https://gateway.pinata.cloud/ipfs');

function normalizeFiles(input: any[]): { url?: string|null; cid?: string|null; name?: string|null; path?: string|null }[] {
  return (Array.isArray(input) ? input : []).map((f: any) => {
    if (typeof f === 'string') {
      // allow raw url or raw CID
      const isCid = /^[A-Za-z0-9]+$/.test(f) && !/^https?:\/\//i.test(f);
      return isCid ? { cid: f, url: `${GATEWAY}/${f}`, name: f } : { url: f, name: decodeURIComponent(f.split('/').pop() || 'file') };
    }
    const cid = f?.cid || null;
    const url = f?.url || (cid ? `${GATEWAY}/${cid}` : null);
    const name = f?.name ?? (url ? decodeURIComponent(url.split('/').pop() || 'file') : cid || null);
    const path = f?.path || null;
    return { url, cid, name, path };
  });
}

// GET (you already have something like this)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proposalId = Number(searchParams.get('proposalId'));
    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId is required and must be a number' }, { status: 400 });
    }

    const rows = await prisma.proof.findMany({
      where: { proposalId },
      orderBy: [{ milestoneIndex: 'asc' }, { createdAt: 'asc' }],
      include: { files: true },
    });

    const out = rows.map(p => ({
      proposalId: p.proposalId,
      milestoneIndex: p.milestoneIndex,
      note: p.note || undefined,
      files: (p.files || []).map(f => ({
        url: f.url ?? (f.cid ? `${GATEWAY}/${f.cid}` : undefined),
        cid: f.cid || undefined,
        name: f.name || undefined,
      })),
    }));
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}

// ✅ POST that actually saves to DB
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const proposalId = Number(body.proposalId);
    const milestoneIndex = Number(body.milestoneIndex);
    const note = typeof body.note === 'string' ? body.note : null;
    const filesInput = Array.isArray(body.files) ? body.files : [];

    if (!Number.isFinite(proposalId) || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId and milestoneIndex (>=0) are required' }, { status: 400 });
    }

    const files = normalizeFiles(filesInput);

    // Upsert by (proposalId, milestoneIndex). If you don’t have a unique constraint,
    // you can do a findFirst+create or create a new record each time.
    // Here we’ll create if not exists, else append files.
    const existing = await prisma.proof.findFirst({
      where: { proposalId, milestoneIndex },
      include: { files: true },
    });

    let saved;
    if (!existing) {
      saved = await prisma.proof.create({
        data: {
          proposalId,
          milestoneIndex,
          note,
          files: { create: files },
        },
        include: { files: true },
      });
    } else {
      // append files; update note if provided
      saved = await prisma.proof.update({
        where: { id: existing.id },
        data: {
          note: note ?? existing.note,
          files: { create: files },
        },
        include: { files: true },
      });
    }

    return NextResponse.json({
      proposalId: saved.proposalId,
      milestoneIndex: saved.milestoneIndex,
      note: saved.note || undefined,
      files: (saved.files || []).map(f => ({
        url: f.url ?? (f.cid ? `${GATEWAY}/${f.cid}` : undefined),
        cid: f.cid || undefined,
        name: f.name || undefined,
      })),
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
