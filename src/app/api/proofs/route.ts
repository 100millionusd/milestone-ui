// src/app/api/proofs/route.ts
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

// ----------------- helpers -----------------
function gatewayBase(): string {
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')
        : 'https://gateway.pinata.cloud/ipfs');
  return gw;
}

type InFile = { url?: string; cid?: string; name?: string; path?: string } | string;

function normalizeFiles(
  input: InFile[]
): { url?: string | null; cid?: string | null; name?: string | null; path?: string | null }[] {
  const gw = gatewayBase();
  const bad = (s: string) => s.includes('<gw>') || s.includes('<CID') || s.includes('>') || /^\s*$/.test(s);
  const isCid = (s: string) => /^[A-Za-z0-9]+$/.test(s) && !/^https?:\/\//i.test(s);
  const fixProtocol = (s: string) => (/^https?:\/\//i.test(s) ? s : `https://${s.replace(/^https?:\/\//, '')}`);

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

// -------- exifr GPS (on-the-fly) ----------
const IMAGE_EXT_RE = /\.(jpe?g|tiff?|png|webp|gif|heic|heif)(\?|#|$)/i;
const gpsCache = new Map<string, { lat: number; lon: number } | null>();

async function getExifr(): Promise<any> {
  // dynamic import avoids type issues if no @types/exifr
  const mod = await import('exifr');
  // @ts-ignore - exifr default export
  return mod.default || mod;
}

async function gpsFromUrl(url?: string) {
  if (!url) return null;
  const key = url.split('?')[0];
  if (!IMAGE_EXT_RE.test(key)) return null; // only try images
  if (gpsCache.has(key)) return gpsCache.get(key)!;

  try {
    const res = await fetch(key, { cache: 'no-store' });
    if (!res.ok) {
      gpsCache.set(key, null);
      return null;
    }
    const ab = await res.arrayBuffer();
    const exifr = await getExifr();
    const g: any = await exifr.gps(ab).catch(() => null);
    const lat = g?.latitude;
    const lon = g?.longitude;
    const val = Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat: Number(lat), lon: Number(lon) }
      : null;
    gpsCache.set(key, val);
    return val;
  } catch {
    gpsCache.set(key, null);
    return null;
  }
}

function preferNumber(...vals: any[]) {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v as number;
  }
  return null;
}

// --------------- GET ----------------------
/** GET /api/proofs?proposalId=123 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
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

    // Build response and inject per-file lat/lon, reading EXIF if needed.
    const out = await Promise.all(
      rows.map(async (p: any) => {
        const files = await Promise.all(
          (p.files || []).map(async (f: any) => {
            const url: string | undefined = f.url ?? (f.cid ? `${gatewayBase()}/${f.cid}` : undefined);
            const exif = f.exif ?? undefined;

            // Prefer DB-provided values if present, otherwise try exifr
            let lat = preferNumber(f.lat, exif?.gpsLatitude);
            let lon = preferNumber(f.lon, exif?.gpsLongitude);

            if ((lat == null || lon == null) && url) {
              const g = await gpsFromUrl(url);
              if (g) {
                lat = g.lat;
                lon = g.lon;
              }
            }

            return {
              url,
              cid: f.cid || undefined,
              name: f.name || undefined,
              exif, // if your DB already stores it
              lat,  // only when actual GPS exists
              lon,  // only when actual GPS exists
            };
          })
        );

        return {
          proposalId: p.proposalId,
          milestoneIndex: p.milestoneIndex,
          note: p.note || undefined,
          files,
        };
      })
    );

    return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'db_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}

// --------------- POST ---------------------
/** POST /api/proofs */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const proposalId = Number(body.proposalId);
    const milestoneIndex = Number(body.milestoneIndex);
    const note = typeof body.note === 'string' ? body.note : null;
    const filesInput = Array.isArray(body.files) ? (body.files as InFile[]) : [];

    // NEW: support replace mode (default = append)
    const mode: 'append' | 'replace' =
      body?.mode === 'replace' || body?.replaceExisting === true ? 'replace' : 'append';

    if (!Number.isFinite(proposalId) || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
      return NextResponse.json(
        { error: 'bad_request', details: 'proposalId and milestoneIndex (>=0) are required' },
        { status: 400 }
      );
    }

    const files = normalizeFiles(filesInput);

    const existing = await prisma.proof.findFirst({
      where: { proposalId, milestoneIndex },
      include: { files: true },
    });

    let saved;
    if (!existing) {
      saved = await prisma.proof.create({
        data: { proposalId, milestoneIndex, note, files: { create: files } },
        include: { files: true },
      });
    } else {
      saved = await prisma.proof.update({
        where: { id: existing.id },
        data: {
          note: note ?? existing.note,
          files:
            mode === 'replace'
              ? { deleteMany: {}, create: files } // wipe then add
              : { create: files }, // append only
        },
        include: { files: true },
      });
    }

    // Mirror GET response shape; also compute lat/lon on-the-fly for new/updated files
    const out = await Promise.all(
      (saved.files || []).map(async (f: any) => {
        const url: string | undefined = f.url ?? (f.cid ? `${gatewayBase()}/${f.cid}` : undefined);
        const exif = f.exif ?? undefined;

        let lat = preferNumber(f.lat, exif?.gpsLatitude);
        let lon = preferNumber(f.lon, exif?.gpsLongitude);

        if ((lat == null || lon == null) && url) {
          const g = await gpsFromUrl(url);
          if (g) {
            lat = g.lat;
            lon = g.lon;
          }
        }

        return {
          url,
          cid: f.cid || undefined,
          name: f.name || undefined,
          exif,
          lat,
          lon,
        };
      })
    );

    return NextResponse.json(
      {
        proposalId: saved.proposalId,
        milestoneIndex: saved.milestoneIndex,
        note: saved.note || undefined,
        files: out,
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: 'db_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
