// src/app/api/proofs/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${process.env.NEXT_PUBLIC_PINATA_GATEWAY.replace(/^https?:\/\//,'').replace(/\/+$/,'')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? process.env.NEXT_PUBLIC_IPFS_GATEWAY.replace(/\/+$/,'')
        : 'https://gateway.pinata.cloud/ipfs');

// ---------- helpers ----------
function normalizeFiles(input: any[]): { url?: string|null; cid?: string|null; name?: string|null; path?: string|null }[] {
  return (Array.isArray(input) ? input : []).map((f: any) => {
    if (typeof f === 'string') {
      const cid = extractCidFromUrl(f) || (isBareCid(f) ? f : null);
      const url = cid ? `${DEFAULT_GATEWAY}/${cid}` : f;
      const name = decodeURIComponent((url || f).split('/').pop() || 'file');
      return { url, cid, name };
    }
    const rawUrl = f?.url || null;
    const cid = f?.cid || extractCidFromUrl(rawUrl || '') || null;
    const url = rawUrl || (cid ? `${DEFAULT_GATEWAY}/${cid}` : null);
    const name = f?.name ?? (url ? decodeURIComponent(url.split('/').pop() || 'file') : cid || null);
    const path = f?.path || null;
    return { url, cid, name, path };
  });
}

// extract CID from ipfs://<cid> or https://<host>/ipfs/<cid>
function extractCidFromUrl(u?: string | null): string | null {
  if (!u) return null;
  try {
    if (u.startsWith('ipfs://')) {
      const m = u.match(/^ipfs:\/\/([^/?#]+)/i);
      return m?.[1] || null;
    }
    const m = u.match(/\/ipfs\/([a-zA-Z0-9]+)(?:[/?#]|$)/);
    return m?.[1] || null;
  } catch { return null; }
}

function isBareCid(s: string): boolean {
  // quick check for base58/base32ish CID (not exhaustive)
  return /^[a-zA-Z0-9]{46,}$/.test(s) && !/^https?:\/\//i.test(s);
}

function pinataAuthHeaders(): Record<string, string> | null {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_SECRET_API_KEY;
  if (jwt) return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  if (apiKey && apiSecret) {
    return {
      'pinata_api_key': apiKey,
      'pinata_secret_api_key': apiSecret,
      'Content-Type': 'application/json',
    };
  }
  return null;
}

async function pinCidIfPossible(cid: string, name?: string) {
  const headers = pinataAuthHeaders();
  if (!headers) return; // no creds → skip
  try {
    const res = await fetch('https://api.pinata.cloud/pinning/pinByHash', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        hashToPin: cid,
        pinataOptions: { cidVersion: 1 },
        pinataMetadata: name ? { name } : undefined,
      }),
    });
    // don't throw on non-200; we don't want to block proof save
    if (!res.ok) {
      // optional: log text for debugging
      await res.text().catch(() => null);
    }
  } catch {
    /* ignore */
  }
}

// ---------- GET ----------
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
        url: f.url ?? (f.cid ? `${DEFAULT_GATEWAY}/${f.cid}` : undefined),
        cid: f.cid || undefined,
        name: f.name || undefined,
      })),
    }));
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}

// ---------- POST (save + auto-pin CIDs) ----------
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

    // fire-and-forget auto-pin for any CIDs we can detect
    const unique = new Map<string, string | undefined>(); // cid -> name
    for (const f of files) {
      const cid = f.cid || extractCidFromUrl(f.url || '') || null;
      if (cid) unique.set(cid, f.name || undefined);
    }
    await Promise.allSettled(Array.from(unique.entries()).map(([cid, name]) => pinCidIfPossible(cid, name)));

    // save (create or append)
    const existing = await prisma.proof.findFirst({
      where: { proposalId, milestoneIndex },
      include: { files: true },
    });

    const saved = !existing
      ? await prisma.proof.create({
          data: { proposalId, milestoneIndex, note, files: { create: files } },
          include: { files: true },
        })
      : await prisma.proof.update({
          where: { id: existing.id },
          data: {
            note: note ?? existing.note,
            files: { create: files },
          },
          include: { files: true },
        });

    return NextResponse.json({
      proposalId: saved.proposalId,
      milestoneIndex: saved.milestoneIndex,
      note: saved.note || undefined,
      files: (saved.files || []).map(f => ({
        url: f.url ?? (f.cid ? `${DEFAULT_GATEWAY}/${f.cid}` : undefined),
        cid: f.cid || undefined,
        name: f.name || undefined,
      })),
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
