// src/app/api/proofs/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // your prisma singleton
export const runtime = 'nodejs';

function pinataAuthHeaders() {
  const jwt = process.env.PINATA_JWT;
  const key = process.env.PINATA_API_KEY;
  const secret = process.env.PINATA_API_SECRET;

  if (jwt) {
    return { Authorization: `Bearer ${jwt}` };
  }
  if (key && secret) {
    return {
      pinata_api_key: key,
      pinata_secret_api_key: secret,
    };
  }
  throw new Error('Pinata credentials missing (set PINATA_JWT or PINATA_API_KEY/SECRET).');
}

async function uploadOneToPinata(file: File, index: number) {
  const fd = new FormData();
  // Pinata expects the field name to be "file" (not "files")
  fd.append('file', file, (file as any).name || `upload-${index}`);

  // optional metadata (kept simple)
  fd.append('pinataOptions', JSON.stringify({ cidVersion: 0 }));

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: pinataAuthHeaders(),
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Pinata ${res.status}: ${text || res.statusText}`);
  }
  const json = await res.json();
  // json: { IpfsHash, PinSize, Timestamp }
  const cid = json?.IpfsHash;
  if (!cid) throw new Error('Invalid Pinata response (missing IpfsHash)');

  const base =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
    process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
    'https://gateway.pinata.cloud/ipfs';

  const baseNorm = (() => {
    const withProto = /^https?:\/\//i.test(base) ? base : `https://${base}`;
    const trimmed = withProto.replace(/\/+$/, '');
    return /\/ipfs$/i.test(trimmed) ? trimmed : `${trimmed}/ipfs`;
  })();

  const href = `${baseNorm}/${cid}`;
  return {
    cid,
    url: href,
    name: (file as any).name || `upload-${index}`,
    size: file.size,
    type: file.type || 'application/octet-stream',
  };
}

export async function POST(req: NextRequest) {
  const ctype = req.headers.get('content-type') || '';
  if (!ctype.includes('multipart/form-data')) {
    return NextResponse.json(
      { error: 'bad_request', message: 'Use multipart/form-data with one or more "files" fields' },
      { status: 400 }
    );
  }

  try {
    const form = await req.formData();

    // Accept both "files" (your frontend) and "file" (in case)
    const fileEntries: File[] = [
      ...form.getAll('files').filter((f) => f instanceof File) as File[],
      ...form.getAll('file').filter((f) => f instanceof File) as File[],
    ];

    if (!fileEntries.length) {
      return NextResponse.json({ error: 'no_files', message: 'No files found in form-data' }, { status: 400 });
    }

    // Optional linking data (if present we will create a proof row)
    const proposalIdRaw = form.get('proposalId');
    const milestoneIndexRaw = form.get('milestoneIndex');
    const noteRaw = form.get('note');
    const bidIdRaw = form.get('bidId');

    const hasLinking =
      proposalIdRaw !== null &&
      milestoneIndexRaw !== null &&
      Number.isFinite(Number(proposalIdRaw)) &&
      Number.isFinite(Number(milestoneIndexRaw));

    // Upload each file to Pinata
    const uploads = [];
    for (let i = 0; i < fileEntries.length; i++) {
      uploads.push(await uploadOneToPinata(fileEntries[i], i));
    }

    // If we got linking fields, create the proof row
    if (hasLinking) {
      const proposalId = Number(proposalIdRaw);
      const milestoneIndex = Number(milestoneIndexRaw);
      const note = (noteRaw?.toString() || '').trim() || 'vendor proof';
      const files = uploads.map(u => ({ url: u.url, name: u.name }));

      // Your schema uses JSON array for files in Proof (as your GET /api/proofs returns)
      const created = await prisma.proof.create({
        data: {
          proposalId,
          milestoneIndex,
          note,
          files: files as any,         // Prisma Json field
          // include bidId if your model has it:
          ...(bidIdRaw ? { bidId: Number(bidIdRaw) } : {}),
        },
      });

      return NextResponse.json({ ok: true, proof: created, uploads });
    }

    // Otherwise behave like before: just return the uploads
    return NextResponse.json({ ok: true, uploads });
  } catch (err: any) {
    console.error('upload error', err);
    return NextResponse.json(
      { error: 'upload_failed', message: String(err?.message || err) },
      { status: 500 }
    );
  }
}
