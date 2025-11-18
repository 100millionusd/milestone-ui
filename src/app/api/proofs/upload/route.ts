// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // allow long uploads

const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

function gatewayBase(): string {
  const envGw =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
    process.env.NEXT_PUBLIC_IPFS_GATEWAY;

  // host-only → ensure single /ipfs suffix
  let base = envGw
    ? `https://${String(envGw).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : 'https://gateway.pinata.cloud';

  base = base.replace(/\/+$/, '');
  if (!/\/ipfs$/i.test(base)) base += '/ipfs';
  return base;
}

function pinataHeaders(): Record<string, string> {
  const jwt = process.env.PINATA_JWT?.trim();
  if (jwt) {
    // accept raw token or "Bearer <token>"
    const val = /^Bearer\s+/i.test(jwt) ? jwt : `Bearer ${jwt}`;
    return { Authorization: val };
  }
  const key = process.env.PINATA_API_KEY;
  const secret = process.env.PINATA_SECRET_API_KEY;
  if (key && secret) {
    return { pinata_api_key: key, pinata_secret_api_key: secret };
  }
  throw new Error('Missing Pinata credentials');
}

type FileLike = Blob & { name?: string };

function toArray<T>(x: T | T[] | null): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

async function pinOne(file: FileLike, metadata?: any) {
  const fd = new FormData();
  fd.append('file', file as any, (file as any).name || 'file');
  if (metadata) fd.append('pinataMetadata', JSON.stringify(metadata));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 110_000);

  try {
    const res = await fetch(PINATA_ENDPOINT, {
      method: 'POST',
      headers: pinataHeaders(),
      body: fd as any, // undici sets boundary
      signal: controller.signal,
      cache: 'no-store',
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Pinata ${res.status}: ${text.slice(0, 500)}`);

    let json: any = {};
    try { json = JSON.parse(text); } catch {}
    const cid = json?.IpfsHash || json?.ipfsHash || json?.Hash || json?.cid;
    if (!cid) throw new Error('Pinata response missing CID');

    const name = (file as any).name || 'file';
    const url = `${gatewayBase()}/${cid}?filename=${encodeURIComponent(name)}`;
    return { cid, url, name };
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // accept BOTH field names: "file" and "files"
    const candidates: FileLike[] = [
      ...toArray(form.get('file') as any),
      ...(form.getAll('file') as any[]),
      ...(form.getAll('files') as any[]),
    ].filter(Boolean);

    if (!candidates.length) {
      return NextResponse.json(
        { ok: false, error: 'no_files', message: 'Send files as "file" or "files".' },
        { status: 400 }
      );
    }

    const proposalId = form.get('proposalId')?.toString() || '';
    const milestoneIndex = form.get('milestoneIndex')?.toString() || '';

    const uploads = [];
    for (const f of candidates) {
      const meta = {
        name: (f as any).name || 'file',
        keyvalues: { proposalId, milestoneIndex },
      };
      uploads.push(await pinOne(f, meta));
    }

    // return both keys for client compatibility
    return NextResponse.json({ ok: true, uploads, files: uploads }, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message || e);
    const status = /AbortError/i.test(msg) ? 504 : 500;
    return NextResponse.json({ ok: false, error: 'upload_failed', message: msg }, { status });
  }
}
