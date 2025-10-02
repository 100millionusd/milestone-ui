import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// --- Gateway + normalizer ----------------------------------------------------
const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')}/ipfs`
    : 'https://gateway.pinata.cloud/ipfs';

function normalizeIpfsUrl(input?: string, cid?: string): string {
  const GW = PINATA_GATEWAY.replace(/\/+$/, '');
  if (cid && (!input || /^\s*$/.test(input))) return `${GW}/${cid}`;
  if (!input) return '';
  let u = String(input).trim();

  // bare CID (optionally with ?query)
  const m = u.match(/^([A-Za-z0-9]{46,})(\?.*)?$/);
  if (m) return `${GW}/${m[1]}${m[2] || ''}`;

  // ipfs://, leading slashes, repeated ipfs/ segments
  u = u.replace(/^ipfs:\/\//i, '');
  u = u.replace(/^\/+/, '');
  u = u.replace(/^(?:ipfs\/)+/i, '');

  if (!/^https?:\/\//i.test(u)) u = `${GW}/${u}`;
  u = u.replace(/\/ipfs\/(?:ipfs\/)+/gi, '/ipfs/');
  return u;
}

type InFile = { url?: string; cid?: string; name?: string } | string;

function sanitizeFiles(files: any): Array<{ name: string; url: string; cid?: string }> {
  if (!Array.isArray(files)) return [];
  const out: Array<{ name: string; url: string; cid?: string }> = [];

  for (const f of files as InFile[]) {
    let name = 'file';
    let cid = '';
    let rawUrl = '';

    if (typeof f === 'string') {
      rawUrl = f;
    } else if (f && typeof f === 'object') {
      name   = f.name ? String(f.name) : 'file';
      cid    = f.cid ? String(f.cid).trim() : '';
      rawUrl = f.url ? String(f.url).trim() : '';
    }

    // Always prefer a gateway URL derived from CID when present.
    const url = normalizeIpfsUrl(rawUrl, cid);
    if (!url) continue;

    out.push({ name, url, cid: cid || undefined });
  }

  return out;
}
// -----------------------------------------------------------------------------

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = Number(ctx?.params?.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { error: 'bad_request', details: 'id must be a number' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const comment = typeof body.comment === 'string' ? body.comment : '';
    const filesSanitized = sanitizeFiles(body.files);

    // Ensure request exists
    const cr = await prisma.proofChangeRequest.findUnique({ where: { id } });
    if (!cr) {
      return NextResponse.json(
        { error: 'not_found', details: 'change request not found' },
        { status: 404 }
      );
    }

    // Try to write with filesJson, fall back to files, then to comment-only.
    let saved: any;
    try {
      saved = await (prisma as any).proofChangeResponse.create({
        data: {
          requestId: id,
          comment,
          filesJson: filesSanitized, // JSON column variant A
          createdBy: 'vendor',
        },
      });
    } catch {
      try {
        saved = await (prisma as any).proofChangeResponse.create({
          data: {
            requestId: id,
            comment,
            files: filesSanitized,    // JSON column variant B
            createdBy: 'vendor',
          },
        });
      } catch {
        saved = await prisma.proofChangeResponse.create({
          data: {
            requestId: id,
            comment,
            createdBy: 'vendor',
          },
        });
      }
    }

    // Do NOT auto-approve; keep request open until admin acts.
    return NextResponse.json({ ok: true, response: saved }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
