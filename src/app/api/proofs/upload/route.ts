// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

function gatewayBase(): string {
  const envGw = process.env.NEXT_PUBLIC_PINATA_GATEWAY || process.env.NEXT_PUBLIC_IPFS_GATEWAY;
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
    return { Authorization: /^Bearer\s+/i.test(jwt) ? jwt : `Bearer ${jwt}` };
  }
  const key = process.env.PINATA_API_KEY;
  const secret = process.env.PINATA_SECRET_API_KEY;
  if (key && secret) {
    return { pinata_api_key: key, pinata_secret_api_key: secret };
  }
  throw new Error('Missing Pinata credentials');
}

async function pinOne(file: File, metadata?: any) {
  const fd = new FormData();

  // 1. Convert File to ArrayBuffer to ensure clean read in Node.js
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type });
  
  fd.append('file', blob, file.name);

  if (metadata) {
    fd.append('pinataMetadata', JSON.stringify(metadata));
  }

  // 2. Timeout safety (15 seconds)
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15000);

  try {
    // 3. THE CRITICAL FIX: duplex: 'half'
    // This is required for Node.js fetch when sending a body!
    const res = await fetch(PINATA_ENDPOINT, {
      method: 'POST',
      headers: pinataHeaders(),
      body: fd,
      signal: controller.signal,
      // @ts-ignore - Typescript might complain, but this is required for Node fetch
      duplex: 'half', 
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Pinata Error ${res.status}: ${errText}`);
    }

    const json = await res.json();
    const cid = json.IpfsHash || json.ipfsHash || json.Hash;
    
    return { 
      cid, 
      url: `${gatewayBase()}/${cid}?filename=${encodeURIComponent(file.name)}`, 
      name: file.name 
    };
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    
    // Filter explicitly for files
    const candidates = [
      ...form.getAll('file'),
      ...form.getAll('files')
    ].filter((f): f is File => f instanceof File);

    if (candidates.length === 0) {
      return NextResponse.json({ ok: false, error: 'no_files' }, { status: 400 });
    }

    const proposalId = form.get('proposalId')?.toString() || '';
    const milestoneIndex = form.get('milestoneIndex')?.toString() || '';

    const uploads = [];
    
    for (const f of candidates) {
      uploads.push(await pinOne(f, {
        name: f.name,
        keyvalues: { proposalId, milestoneIndex }
      }));
    }

    return NextResponse.json({ ok: true, uploads });
    
  } catch (e: any) {
    console.error("Upload failed:", e);
    return NextResponse.json({ 
      ok: false, 
      error: 'upload_failed', 
      message: e.message 
    }, { status: 500 });
  }
}