import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PINATA_FILE_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

function gatewayHost() {
  return process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'gateway.pinata.cloud';
}

/**
 * GET /api/proofs/upload?__ping=1  -> small health check
 * (Plain GETs to this route otherwise return 405.)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get('__ping')) {
    return NextResponse.json({
      ok: true,
      method: 'GET',
      has_PINATA_JWT: Boolean(process.env.PINATA_JWT),
      gateway: gatewayHost(),
    });
  }
  return new NextResponse('Method Not Allowed', { status: 405 });
}

/**
 * POST /api/proofs/upload
 * multipart/form-data with one or more fields named "files"
 * Returns: { ok:true, uploads:[{ url, name }] }
 */
export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    return NextResponse.json(
      { ok: false, error: 'Missing PINATA_JWT on server' },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'Invalid multipart form-data', details: String(e?.message || e) },
      { status: 400 }
    );
  }

  const files = form.getAll('files') as File[];
  if (!files || files.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'No files[] provided' },
      { status: 400 }
    );
  }

  const uploads: { url: string; name?: string }[] = [];

  for (const f of files) {
    // Forward each file to Pinata
    const fd = new FormData();
    fd.append('file', f, (f as any).name || 'file');

    const res = await fetch(PINATA_FILE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: fd,
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        {
          ok: false,
          error: 'Pinata upload failed',
          status: res.status,
          details: txt.slice(0, 500),
        },
        { status: 502 }
      );
    }

    const data = await res.json() as any;
    const cid = data?.IpfsHash || data?.ipfsHash || data?.cid;
    if (!cid) {
      return NextResponse.json(
        { ok: false, error: 'Pinata response missing CID', raw: data },
        { status: 502 }
      );
    }

    const name = (f as any).name || 'file';
    const url = `https://${gatewayHost()}/ipfs/${cid}`;
    uploads.push({ url, name });
  }

  return NextResponse.json({ ok: true, uploads });
}
