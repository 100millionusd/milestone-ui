// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

const PINATA_JWT = process.env.PINATA_JWT; // recommended
const PINATA_API_KEY = process.env.PINATA_API_KEY;     // legacy alt
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY; // legacy alt

if (!PINATA_JWT && !(PINATA_API_KEY && PINATA_SECRET_API_KEY)) {
  console.warn('[proofs/upload] Missing Pinata credentials (PINATA_JWT or API key/secret).');
}

// Normalize gateway (so we can return a usable public URL)
const GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY)
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')
        : 'https://gateway.pinata.cloud/ipfs');

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}

export async function POST(req: Request) {
  try {
    const inFd = await req.formData();

    // Accept multiple under either "file" or "files"
    const inFiles: File[] = [
      ...inFd.getAll('file'),
      ...inFd.getAll('files'),
    ].filter((x): x is File => x instanceof File);

    if (inFiles.length === 0) {
      return NextResponse.json({ error: 'bad_request', message: 'No files found in form-data (use "file" or "files")' }, { status: 400 });
    }

    const uploads: Array<{ cid: string; url: string; name: string }> = [];

    for (const f of inFiles) {
      const out = new FormData();
      // Pinata expects "file" as the field name; can be appended multiple times.
      out.append('file', f, (f as any).name || 'upload');

      // Optional: give Pinata a readable name
      out.append('pinataMetadata', JSON.stringify({
        name: (f as any).name || 'upload',
      }));

      // Optional: set cidVersion or other options
      out.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

      const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: PINATA_JWT
          ? { Authorization: `Bearer ${PINATA_JWT}` }
          : {
              pinata_api_key: PINATA_API_KEY || '',
              pinata_secret_api_key: PINATA_SECRET_API_KEY || '',
            },
        body: out,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Pinata ${res.status}: ${txt || res.statusText}`);
      }

      const json = await res.json();
      const cid = json?.IpfsHash;
      if (!cid) throw new Error('Pinata did not return IpfsHash');

      uploads.push({
        cid,
        url: `${GATEWAY}/${cid}`,
        name: (f as any).name || cid,
      });
    }

    return NextResponse.json({ ok: true, uploads }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'upload_failed', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}
