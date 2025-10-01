// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Auth – support JWT or key/secret
function pinataHeaders(): Record<string, string> | null {
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
  return null;
}

async function uploadOneToPinata(file: File) {
  const headers = pinataHeaders();
  if (!headers) throw new Error('Missing Pinata credentials');
  const fd = new FormData();
  // IMPORTANT: field name must be "file"
  fd.append('file', file, file.name);

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers,                 // DO NOT set Content-Type; fetch will set it with boundary
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${text}`);

  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  // Pinata returns IpfsHash
  const cid = json?.IpfsHash || json?.ipfsHash || json?.Hash;
  if (!cid) throw new Error(`Pinata response missing CID: ${text}`);

  // Build gateway URL using NEXT_PUBLIC_PINATA_GATEWAY if present
  const gw =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY
      ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//,'').replace(/\/+$/,'')}/ipfs`
      : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
          ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/,'')
          : 'https://gateway.pinata.cloud/ipfs');

  return {
    cid,
    url: `${gw}/${cid}`,
    name: file.name || 'file',
  };
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    // ✅ read ALL files from field name "file"
    const files = form.getAll('file')
      .filter((v): v is File => v instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: 'no_files', message: 'Attach one or more files using field name "file"' }, { status: 400 });
    }

    const uploads = [];
    for (const f of files) {
      // upload each file separately (simplest and most reliable)
      uploads.push(await uploadOneToPinata(f));
    }

    return NextResponse.json({ ok: true, uploads }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: 'upload_failed', message: String(e?.message || e) }, { status: 500 });
  }
}
