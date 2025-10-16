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
  const bad = (s: string) => s.includes('<gw>') || s.includes('<CID') || s.includes('>') || /^\s*$/.test(s);
  const isCid = (s: string) => /^[A-Za-z0-9]+$/.test(s) && !/^https?:\/\//i.test(s);
  const fixProtocol = (s: string) => /^https?:\/\//i.test(s) ? s : `https://${s.replace(/^https?:\/\//,'')}`;

  return (Array.isArray(input) ? input : []).flatMap((f: InFile) => {
    if (typeof f === 'string') {
      if (bad(f)) return [];
      if (isCid(f)) return [{ cid: f, url: `${gw}/${f}`, name: f, path: null }];
      const url = fixProtocol(f);
      return [{ url, cid: null, name: decodeURIComponent(url.split('/').pop() || 'file'), path: null }];
    }
    const cid = f?.cid || null;
    let url = f?.url || (cid ? `${gw}/${cid}` : null);
    if (url) {
      if (bad(url)) return [];
      url = fixProtocol(url);
    }
    const name = f?.name ?? (url ? decodeURIComponent(url.split('/').pop() || 'file') : cid || null);
    const path = (f as any)?.path || null;
    return [{ url, cid, name, path }];
  });
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
  files: (p.files || []).map((f: any) => {
    const url =
      f.url ?? (f.cid ? `${gatewayBase()}/${f.cid}` : undefined);
    const exif = f.exif ?? undefined;

    const lat =
      typeof f.lat === 'number'
        ? f.lat
        : typeof exif?.gpsLatitude === 'number'
        ? exif.gpsLatitude
        : null;

    const lon =
      typeof f.lon === 'number'
        ? f.lon
        : typeof exif?.gpsLongitude === 'number'
        ? exif.gpsLongitude
        : null;

    return {
      url,
      cid: f.cid || undefined,
      name: f.name || undefined,
      exif,   // passes through if you have it in DB
      lat,    // null unless real GPS exists
      lon,    // null unless real GPS exists
    };
  }),
}));

return NextResponse.json(out);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const proposalId = Number(body.proposalId);
    const milestoneIndex = Number(body.milestoneIndex);
    const note = typeof body.note === 'string' ? body.note : null;
    const filesInput = Array.isArray(body.files) ? (body.files as InFile[]) : [];

    // NEW: support replace mode (default = append)
    const mode: 'append' | 'replace' = (body?.mode === 'replace' || body?.replaceExisting === true) ? 'replace' : 'append';

    if (!Number.isFinite(proposalId) || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId and milestoneIndex (>=0) are required' }, { status: 400 });
    }

    const files = normalizeFiles(filesInput);

    const existing = await prisma.proof.findFirst({
      where: { proposalId, milestoneIndex },
      include: { files: true },
    });

    let saved;
    if (!existing) {
      // first record for this milestone
      saved = await prisma.proof.create({
        data: { proposalId, milestoneIndex, note, files: { create: files } },
        include: { files: true },
      });
    } else {
      // append or replace
      saved = await prisma.proof.update({
        where: { id: existing.id },
        data: {
          note: note ?? existing.note,
          files: mode === 'replace'
            ? { deleteMany: {}, create: files }  // wipe then add
            : { create: files },                  // append only
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
