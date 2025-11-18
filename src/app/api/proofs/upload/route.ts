// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

// 1. Force Node.js runtime (Standard for file handling)
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
  console.log(`[API] Uploading: ${file.name} (${file.size} bytes)`);

  // 2. SAFETY CHECK: Netlify has a strict 6MB Request Body Limit.
  // If the file is larger than ~5.8MB, Netlify will kill the connection instantly.
  if (file.size > 5.8 * 1024 * 1024) {
    throw new Error(`File too large (Netlify limit is 6MB). File is ${(file.size / (1024*1024)).toFixed(2)}MB`);
  }

  const fd = new FormData();

  // 3. CRITICAL FIX: Convert to Node Buffer
  // This fixes the "stream hang" issue that happens with PDFs in Next.js 13+
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Append buffer with filename and explicit content type
  const blob = new Blob([buffer], { type: file.type || 'application/pdf' });
  fd.append('file', blob, file.name);

  if (metadata) {
    fd.append('pinataMetadata', JSON.stringify(metadata));
  }

  // 4. Setup Timeout (15s) to prevent silent crashes
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(PINATA_ENDPOINT, {
      method: 'POST',
      headers: pinataHeaders(),
      body: fd,
      signal: controller.signal,
      // 5. MANDATORY FIX: 'duplex: half' is required for file uploads in Node 18+
      // @ts-expect-error - TypeScript might not know this property yet, but it is required
      duplex: 'half', 
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Pinata Error ${res.status}: ${text}`);
    }

    const json = await res.json();
    const cid = json.IpfsHash || json.ipfsHash || json.Hash;

    console.log(`[API] Success CID: ${cid}`);
    return { 
      cid, 
      url: `${gatewayBase()}/${cid}?filename=${encodeURIComponent(file.name)}`, 
      name: file.name 
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    
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
    console.error("[API] Upload Failed:", e);
    
    // Return the ACTUAL error message so you can see it in the browser console
    return NextResponse.json({ 
      ok: false, 
      error: 'upload_failed', 
      message: e.message || 'Unknown error',
      details: String(e)
    }, { status: 500 });
  }
}