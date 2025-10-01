// src/app/api/proofs/repin/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function pinataAuthHeaders(): Record<string, string> | null {
  const jwt = process.env.PINATA_JWT;
  const apiKey = process.env.PINATA_API_KEY;
  const apiSecret = process.env.PINATA_SECRET_API_KEY;
  if (jwt) return { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
  if (apiKey && apiSecret) {
    return {
      'pinata_api_key': apiKey,
      'pinata_secret_api_key': apiSecret,
      'Content-Type': 'application/json',
    };
  }
  return null;
}

function extractCidFromUrl(u?: string | null): string | null {
  if (!u) return null;
  if (u.startsWith('ipfs://')) {
    const m = u.match(/^ipfs:\/\/([^/?#]+)/i);
    return m?.[1] || null;
  }
  const m = u.match(/\/ipfs\/([a-zA-Z0-9]+)(?:[/?#]|$)/);
  return m?.[1] || null;
}

async function pinCidIfPossible(cid: string, name?: string) {
  const headers = pinataAuthHeaders();
  if (!headers) return { ok: false, reason: 'no_creds' as const };
  try {
    const r = await fetch('https://api.pinata.cloud/pinning/pinByHash', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        hashToPin: cid,
        pinataOptions: { cidVersion: 1 },
        pinataMetadata: name ? { name } : undefined,
      }),
    });
    return { ok: r.ok, status: r.status };
  } catch (e) {
    return { ok: false, reason: 'fetch_error' as const };
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proposalId = Number(searchParams.get('proposalId'));
    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId (number) required' }, { status: 400 });
    }

    const proofs = await prisma.proof.findMany({
      where: { proposalId },
      include: { files: true },
    });

    const cids = new Map<string, string | undefined>(); // cid -> name
    for (const p of proofs) {
      for (const f of p.files || []) {
        const cid = f.cid || extractCidFromUrl(f.url || '') || null;
        if (cid) cids.set(cid, f.name || undefined);
      }
    }

    const results = await Promise.allSettled(
      Array.from(cids.entries()).map(([cid, name]) => pinCidIfPossible(cid, name))
    );

    const pinned = results.filter(r => r.status === 'fulfilled' && (r as any).value?.ok).length;

    return NextResponse.json({
      ok: true,
      proposalId,
      totalCids: cids.size,
      pinned,
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'repin_failed', message: String(e?.message || e) }, { status: 500 });
  }
}
