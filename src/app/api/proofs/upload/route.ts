import { NextResponse } from 'next/server';

export const runtime = 'nodejs';        // REQUIRED (must not be Edge)
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function gatewayHost() {
  return (
    process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
    'gateway.pinata.cloud'
  );
}

export async function GET() {
  // Helpful error for accidental GET pings
  return NextResponse.json(
    { error: 'method_not_allowed', message: 'Use POST with multipart/form-data' },
    { status: 405 }
  );
}

export async function POST(req: Request) {
  try {
    const PINATA_JWT = process.env.PINATA_JWT;
    if (!PINATA_JWT) {
      return NextResponse.json(
        { error: 'missing_pinata_jwt', message: 'Set PINATA_JWT in Netlify env' },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const files = form.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'no_files', message: 'Attach at least one file under the "files" field' },
        { status: 400 }
      );
    }

    const uploads: Array<{ cid: string; url: string; name?: string }> = [];

    for (const f of files) {
      // Convert incoming File → Blob for outgoing multipart
      const bytes = await f.arrayBuffer();
      const blob = new Blob([bytes], { type: f.type || 'application/octet-stream' });

      const out = new FormData();
      out.append('file', blob, f.name || 'proof-file');

      // optional but nice to have
      out.append(
        'pinataMetadata',
        new Blob([JSON.stringify({ name: f.name || 'proof-file' })], { type: 'application/json' })
      );
      out.append(
        'pinataOptions',
        new Blob([JSON.stringify({ cidVersion: 1 })], { type: 'application/json' })
      );

      const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PINATA_JWT}` },
        body: out,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Pinata ${resp.status}: ${txt.slice(0, 300)}`);
      }

      const json = await resp.json();
      const cid = json?.IpfsHash;
      if (!cid) throw new Error('Pinata response missing IpfsHash');

      uploads.push({
        cid,
        url: `https://${gatewayHost()}/ipfs/${cid}`,
        name: f.name,
      });
    }

    return NextResponse.json({ ok: true, uploads }, { status: 200 });
  } catch (err: any) {
    console.error('pinata upload error:', err);
    return NextResponse.json(
      { error: 'upload_failed', message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
