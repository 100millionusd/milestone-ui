// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Build the public gateway base
function gatewayBase(): string {
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')
        : 'https://gateway.pinata.cloud/ipfs');
  return gw;
}

// Select Pinata auth headers: JWT preferred, falls back to API key/secret
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
  throw new Error('Missing Pinata credentials (PINATA_JWT or PINATA_API_KEY + PINATA_SECRET_API_KEY)');
}

// Upload single file to Pinata
async function uploadOne(file: File) {
  const headers = pinataHeaders();
  const fd = new FormData();
  // IMPORTANT: field name must be "file"
  fd.append('file', file, file.name || 'file');

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers, // do NOT set Content-Type for FormData
    body: fd,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${text}`);

  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  const cid = json?.IpfsHash || json?.ipfsHash || json?.Hash;
  if (!cid) throw new Error(`Pinata response missing CID: ${text}`);

  return { cid, url: `${gatewayBase()}/${cid}`, name: file.name || 'file' };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    // ✅ read ALL files under field name "file"
    const files = form.getAll('file').filter((v): v is File => v instanceof File);
    if (files.length === 0) {
      return NextResponse.json(
        { error: 'no_files', message: 'Attach one or more files using field name "file"' },
        { status: 400 }
      );
    }

    const uploads = [];
    for (const f of files) {
      uploads.push(await uploadOne(f));
    }

    return NextResponse.json({ ok: true, uploads }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: 'upload_failed', message: String(e?.message || e) }, { status: 500 });
  }
}

// Optional ping
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('__ping')) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
