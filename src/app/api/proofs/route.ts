// src/app/api/proofs/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// If you paste only a hostname for NEXT_PUBLIC_PINATA_GATEWAY, we build https://<host>/ipfs
// Otherwise we fall back to NEXT_PUBLIC_IPFS_GATEWAY as-is (can already include /ipfs).
const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')
        : 'https://gateway.pinata.cloud/ipfs');

function isHttpUrl(u: string) {
  return /^https?:\/\//i.test(u);
}
function isLikelyTruncatedOrPlaceholder(u: string) {
  // Block ellipsized or encoded angle-bracket placeholders
  return u.includes('...') || /%3C|%3E|<|>/.test(u);
}
function lastPath(u: string) {
  try {
    const p = u.split('?')[0].split('#')[0];
    const leaf = p.split('/').pop() || 'file';
    return decodeURIComponent(leaf);
  } catch {
    return 'file';
  }
}

type InFile = { url?: string; cid?: string; name?: string; path?: string } | string;
type OutFile = { url?: string | null; cid?: string | null; name?: string | null; path?: string | null };

// Normalize a single file input (string URL/CID or object) -> {url,cid,name,path}
// Also validate that URLs are usable and not truncated/placeholder.
function normalizeOne(raw: InFile): OutFile {
  if (typeof raw === 'string') {
    const s = raw.trim();
    const isCid = /^[A-Za-z0-9]+$/.test(s) && !isHttpUrl(s);
    if (isCid) {
      return { cid: s, url: `${GATEWAY}/${s}`, name: s, path: null };
    }
    if (!isHttpUrl(s)) {
      throw new Error(`Invalid file input: "${s}"`);
    }
    if (isLikelyTruncatedOrPlaceholder(s)) {
      throw new Error(`Truncated/placeholder URL detected: "${s}"`);
    }
    return { url: s, cid: null, name: lastPath(s), path: null };
  }

  const cid = raw?.cid ? String(raw.cid).trim() : null;
  let url = raw?.url ? String(raw.url).trim() : null;

  if (!url && cid) url = `${GATEWAY}/${cid}`;
  if (!url && !cid) throw new Error('File url or cid is required');

  if (url) {
    if (!isHttpUrl(url)) throw new Error(`Invalid URL (must start with http/https): "${url}"`);
    if (isLikelyTruncatedOrPlaceholder(url)) {
      throw new Error(`Truncated/placeholder URL detected: "${url}"`);
    }
  }

  const name =
    raw?.name?.trim() ||
    (url ? lastPath(url) : cid) ||
    null;

  const path = raw?.path ? String(raw.path) : null;

  return { url, cid, name, path };
}

function normalizeFiles(input: any): OutFile[] {
  const arr = Array.isArray(input) ? input : [];
  return arr.map(normalizeOne);
}

// ---- GET --------------------------------------------------------------------
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    // health ping support
    if (searchParams.has('__ping')) {
      return NextResponse.json({ ok: true, gateway: GATEWAY });
    }

    const proposalId = Number(searchParams.get('proposalId'));
    if (!Number.isFinite(proposalId)) {
      return NextResponse.json(
        { error: 'bad_request', details: 'proposalId is required and must be a number' },
        { status: 400 }
      );
    }

    const rows = await prisma.proof.findMany({
      where: { proposalId },
      orderBy: [{ milestoneIndex: 'asc' }, { createdAt: 'asc' }],
      include: { files: true },
    });

    const out = rows.map((p) => ({
      proposalId: p.proposalId,
      milestoneIndex: p.milestoneIndex,
      note: p.note || undefined,
      files: (p.files || []).map((f) => ({
        url: f.url ?? (f.cid ? `${GATEWAY}/${f.cid}` : undefined),
        cid: f.cid || undefined,
        name: f.name || undefined,
      })),
    }));

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}

// ---- POST (create/append proof files) ---------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const proposalId = Number(body.proposalId);
    const milestoneIndex = Number(body.milestoneIndex);
    const note = typeof body.note === 'string' ? body.note : null;

    if (!Number.isFinite(proposalId) || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
      return NextResponse.json(
        { error: 'bad_request', details: 'proposalId and milestoneIndex (>=0) are required' },
        { status: 400 }
      );
    }

    // Normalize + validate files (reject truncated/placeholder)
    const files = normalizeFiles(body.files);

    // Upsert by (proposalId, milestoneIndex): create if missing, else append files & update note if provided
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
          files: files.length ? { create: files } : undefined,
        },
        include: { files: true },
      });
    }

    return NextResponse.json(
      {
        proposalId: saved.proposalId,
        milestoneIndex: saved.milestoneIndex,
        note: saved.note || undefined,
        files: (saved.files || []).map((f) => ({
          url: f.url ?? (f.cid ? `${GATEWAY}/${f.cid}` : undefined),
          cid: f.cid || undefined,
          name: f.name || undefined,
        })),
      },
      { status: 201 }
    );
  } catch (e: any) {
    // If validation failed in normalizeOne, surface a 400 with message
    const msg = String(e?.message || e);
    if (
      msg.includes('Invalid URL') ||
      msg.includes('Truncated/placeholder') ||
      msg.includes('File url or cid is required') ||
      msg.includes('Invalid file input')
    ) {
      return NextResponse.json({ error: 'bad_request', details: msg }, { status: 400 });
    }
    return NextResponse.json({ error: 'db_error', message: msg }, { status: 500 });
  }
}
