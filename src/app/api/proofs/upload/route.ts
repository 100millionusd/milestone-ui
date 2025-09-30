import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function gatewayHost() {
  return process.env.NEXT_PUBLIC_PINATA_GATEWAY || 'gateway.pinata.cloud';
}

export async function GET() {
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
        { error: 'missing_pinata_jwt', message: 'Set PINATA_JWT in your environment' },
        { status: 500 }
      );
    }

    const form = await req.formData();

    // Accept either "files" (multiple) or "file" (single) from the client
    let files = form.getAll('files') as File[];
    const single = form.get('file');
    if ((!files || files.length === 0) && single instanceof File) {
      files = [single];
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'no_files', message: 'Attach at least one file under "files" or "file"' },
        { status: 400 }
      );
    }

    const uploads: Array<{ cid: string; url: string; name?: string }> = [];

    for (const f of files) {
      // Build a new multipart for Pinata with ONLY the "file" field.
      const bytes = await f.arrayBuffer();
      const blob = new Blob([bytes], { type: f.type || 'application/octet-stream' });

      const out = new FormData();
      out.append('file', blob, f.name || 'upload');

      // 🔐 Send to Pinata
      const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: { Authorization: `Bearer ${PINATA_JWT}` },
        body: out,
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Pinata ${resp.status}: ${txt.slice(0, 500)}`);
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
