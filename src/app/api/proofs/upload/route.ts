// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Build the public gateway base (NEXT_PUBLIC_PINATA_GATEWAY host-only → /ipfs; else Pinata default)
function gatewayBase(): string {
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')
        : 'https://gateway.pinata.cloud/ipfs');
  return gw;
}

// Use server env PINATA_JWT exactly as provided (must include "Bearer ")
function pinataHeaders(): Record<string, string> {
  const jwt = process.env.PINATA_JWT; // expected: "Bearer <token>"
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_SECRET_API_KEY;

  if (jwt) return { Authorization: jwt }; // do NOT prepend "Bearer " again
  if (apiKey && apiSecret) {
    return {
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret,
    };
  }
  throw new Error('Missing Pinata credentials (PINATA_JWT or PINATA_API_KEY + PINATA_SECRET_API_KEY)');
}

type FileLike = {
  name?: string;
  type?: string;
  size?: number;
  // Node/undici File/Blob exposes arrayBuffer()
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isFileLike(v: any): v is FileLike {
  return v && typeof v === 'object' && typeof v.arrayBuffer === 'function';
}

async function pinOneFileToPinata(file: FileLike): Promise<{ cid: string; url: string; name: string }> {
  const fd = new FormData();
  // The undici FormData accepts web File/Blob-like values. We avoid referencing the global File class.
  fd.append('file', file as any, (file as any).name || 'file'); // Pinata expects 'file' (singular)

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: pinataHeaders(),
    body: fd,                    // don’t set Content-Type manually (boundary required)
    cache: 'no-store',
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Pinata ${res.status}: ${text}`);

  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  const cid = json?.IpfsHash || json?.ipfsHash || json?.Hash || json?.cid;
  if (!cid) throw new Error(`Pinata response missing CID: ${text}`);

  return { cid, url: `${gatewayBase()}/${cid}`, name: (file as any).name || 'file' };
}

// POST-only: Accept multipart/form-data with field name EXACTLY "files" (multiple)
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const raw = form.getAll('files');
    const files = raw.filter(isFileLike);
    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'no_files', message: 'Attach one or more files using field name "files"' },
        { status: 400 }
      );
    }

    const uploads = [];
    for (const f of files) uploads.push(await pinOneFileToPinata(f));

    // Return exact shape required by spec
    return NextResponse.json({ ok: true, uploads }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'upload_failed', message: String(e?.message || e) }, { status: 500 });
  }
}
