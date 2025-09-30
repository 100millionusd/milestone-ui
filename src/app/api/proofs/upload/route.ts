// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';            // ensure Node runtime (not edge)
export const dynamic = 'force-dynamic';     // no caching

const PINATA_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

// Build gateway base: https://<host>/ipfs
function gatewayBase(): string {
  const gw =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
    process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
    'gateway.pinata.cloud';
  const host = gw.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${host}/ipfs`;
}

// Choose Pinata auth headers (JWT preferred)
function pinataHeaders(): Record<string, string> {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_SECRET_API_KEY;

  if (jwt) return { Authorization: `Bearer ${jwt}` };
  if (apiKey && apiSecret) {
    return {
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    };
  }
  throw new Error('Missing Pinata credentials (set PINATA_JWT or PINATA_API_KEY + PINATA_SECRET_API_KEY).');
}

export async function POST(req: Request) {
  try {
    // Read the multipart form data the browser sent
    const form = await req.formData();

    // Accept both "file" and "files" field names to be tolerant
    const incoming = [
      ...form.getAll('file'),
      ...form.getAll('files'),
    ].filter(Boolean) as Array<Blob & { name?: string; type?: string }>;

    if (!incoming.length) {
      return NextResponse.json(
        { error: 'no_files', message: 'No files found. Send one or more files under field "file".' },
        { status: 400 }
      );
    }

    const headers = pinataHeaders();
    const gw = gatewayBase();
    const uploads: Array<{ cid: string; url: string; name: string }> = [];

    for (const blob of incoming) {
      // Build a multipart form for Pinata. DO NOT construct new File() on the server.
      const fd = new FormData();
      // name is optional on server blobs; set a fallback
      const filename = (blob as any).name || 'upload';
      fd.append('file', blob, filename);

      // (optional) metadata & options
      fd.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
      fd.append('pinataMetadata', JSON.stringify({ name: filename }));

      const res = await fetch(PINATA_URL, {
        method: 'POST',
        headers,         // only auth headers; DO NOT set Content-Type here
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Pinata ${res.status}: ${txt || res.statusText}`);
      }

      const json = await res.json().catch(() => ({}));
      const cid = json?.IpfsHash;
      if (!cid || typeof cid !== 'string') {
        throw new Error('Pinata response missing IpfsHash');
      }

      uploads.push({
        cid,
        url: `${gw}/${cid}`,
        name: filename,
      });
    }

    return NextResponse.json({ ok: true, uploads });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'upload_failed', message: String(err?.message || err) },
      { status: 500 }
    );
  }
}

// Make it explicit that GET is not supported here
export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
