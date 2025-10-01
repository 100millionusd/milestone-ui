// src/app/api/proofs/route.ts
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

type InFile = { url?: string; cid?: string; name?: string; path?: string } | string;

function normalizeFiles(input: InFile[]): { url?: string|null; cid?: string|null; name?: string|null; path?: string|null }[] {
  const gw = gatewayBase();

  const isCid = (s: string) => /^[A-Za-z0-9]+$/.test(s) && !/^https?:\/\//i.test(s);
  const bad = (s: string) => s.includes('<gw>') || s.includes('<CID') || s.includes('>');

  const fixProtocol = (s: string) =>
    /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^https?:\/\//, '')}`;

  const out: Array<{ url?: string|null; cid?: string|null; name?: string|null; path?: string|null }> = [];

  for (const f of (Array.isArray(input) ? input : [])) {
    if (typeof f === 'string') {
      if (bad(f)) continue;
      if (isCid(f)) {
        out.push({ cid: f, url: `${gw}/${f}`, name: f, path: null });
      } else {
        const url = fixProtocol(f);
        out.push({ url, cid: null, name: decodeURIComponent(url.split('/').pop() || 'file'), path: null });
      }
    } else if (f && typeof f === 'object') {
      const cid = f.cid || null;
      let url = f.url || (cid ? `${gw}/${cid}` : null);
      if (url) {
        if (bad(url)) continue;
        url = fixProtocol(url);
      }
      const name = f.name ?? (url ? decodeURIComponent(url.split('/').pop() || 'file') : cid || null);
      const path = (f as any).path || null;
      out.push({ url, cid, name, path });
    }
  }

  // keep only entries with a usable url or cid
  return out.filter(x => x.url || x.cid);
}

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

    const out = rows.map((p: any) => ({
      proposalId: p.proposalId,
      milestoneIndex: p.milestoneIndex,
      note: p.note || undefined,
      files: (p.files || []).map((f: any) => ({
        url: f.url ?? (f.cid ? `${gatewayBase()}/${f.cid}` : undefined),
        cid: f.cid || undefined,
        name: f.name || undefined,
      })),
    }));
    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const proposalId = Number(body.proposalId);
    const milestoneIndex = Number(body.milestoneIndex);
    const note = typeof body.note === 'string' ? body.note : null;
    const filesInput = Array.isArray(body.files) ? (body.files as InFile[]) : [];

    if (!Number.isFinite(proposalId) || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId and milestoneIndex (>=0) are required' }, { status: 400 });
    }

    const files = normalizeFiles(filesInput);

    // Append to existing record for (proposalId, milestoneIndex) if present; else create.
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
      files: (saved.files || []).map((f: any) => ({
        url: f.url ?? (f.cid ? `${gatewayBase()}/${f.cid}` : undefined),
        cid: f.cid || undefined,
        name: f.name || undefined,
      })),
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
