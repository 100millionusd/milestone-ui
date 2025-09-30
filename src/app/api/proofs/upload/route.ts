// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

// We’ll build gateway URLs with your public gateway host
function gwUrl(cid: string) {
  const host =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
    process.env.NEXT_PUBLIC_IPFS_GATEWAY?.replace(/^https?:\/\//, '') ||
    'gateway.pinata.cloud';
  // ensure it looks like https://<host>/ipfs/<cid>
  return `https://${host}/ipfs/${cid}`;
}

export async function POST(req: Request) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      return NextResponse.json(
        { error: 'missing_pinata_jwt', message: 'Set PINATA_JWT in your server env.' },
        { status: 500 }
      );
    }

    const form = await req.formData();
    const files = form.getAll('files');

    if (!files.length) {
      return NextResponse.json(
        { error: 'no_files', message: 'Attach at least one file field named "files".' },
        { status: 400 }
      );
    }

    const uploaded: Array<{ cid: string; url: string; name?: string }> = [];

    // Upload each file to Pinata (one request per file keeps it robust across hosts)
    for (const f of files) {
      if (!(f instanceof Blob)) continue;

      // Create a new multipart for this single file
      const pinFD = new FormData();
      // Try to keep a filename if provided
      const filename = (f as any)?.name || 'file';
      pinFD.append('file', f, filename);

      // You can add optional metadata
      pinFD.append(
        'pinataMetadata',
        JSON.stringify({ name: filename || 'proof-file' })
      );

      const res = await fetch(PINATA_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: pinFD,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        return NextResponse.json(
          { error: 'pinata_error', status: res.status, body: txt.slice(0, 500) },
          { status: 502 }
        );
      }

      const json = (await res.json()) as { IpfsHash?: string };
      const cid = json?.IpfsHash;
      if (!cid) {
        return NextResponse.json(
          { error: 'bad_pinata_response' },
          { status: 502 }
        );
      }

      uploaded.push({ cid, url: gwUrl(cid), name: filename });
    }

    return NextResponse.json({ uploaded }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'upload_failed', message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
