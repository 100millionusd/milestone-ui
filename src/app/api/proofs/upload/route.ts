// src/app/api/proofs/upload/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120; // allow long uploads

const PINATA_ENDPOINT = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
const API_BASE = "https://milestone-api-production.up.railway.app";

async function getTenantConfig(key: string, auth: string, tenantId: string) {
  try {
    const res = await fetch(`${API_BASE}/api/tenants/config/${key}`, {
      headers: {
        'Authorization': auth,
        'X-Tenant-ID': tenantId,
        'Accept': 'application/json'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.value;
  } catch (e) {
    console.error(`Failed to fetch config ${key}`, e);
    return null;
  }
}

type FileLike = Blob & { name?: string };

function toArray<T>(x: T | T[] | null): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

async function pinOne(file: FileLike, metadata: any, jwt: string, gateway: string) {
  const fd = new FormData();
  fd.append('file', file as any, (file as any).name || 'file');
  if (metadata) fd.append('pinataMetadata', JSON.stringify(metadata));

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 110_000);

  try {
    const res = await fetch(PINATA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`
      },
      body: fd as any, // undici sets boundary
      signal: controller.signal,
      cache: 'no-store',
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`Pinata ${res.status}: ${text.slice(0, 500)}`);

    let json: any = {};
    try { json = JSON.parse(text); } catch { }
    const cid = json?.IpfsHash || json?.ipfsHash || json?.Hash || json?.cid;
    if (!cid) throw new Error('Pinata response missing CID');

    const name = (file as any).name || 'file';

    // Format gateway URL
    let gw = gateway.replace(/\/+$/, '');
    if (!/\/ipfs$/i.test(gw)) gw += '/ipfs';

    const url = `${gw}/${cid}?filename=${encodeURIComponent(name)}`;
    return { cid, url, name };
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: Request) {
  try {
    const auth = req.headers.get('authorization') || '';
    const tenantId = req.headers.get('x-tenant-id') || '';

    if (!auth || !tenantId) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Missing auth or tenant ID' }, { status: 401 });
    }

    // Fetch credentials
    const [jwt, gateway] = await Promise.all([
      getTenantConfig('pinata_jwt', auth, tenantId),
      getTenantConfig('pinata_gateway', auth, tenantId)
    ]);

    // Fallback to env vars if not configured (backward compatibility)
    const finalJwt = jwt;
    const finalGateway = gateway || 'https://gateway.pinata.cloud';

    if (!finalJwt) {
      return NextResponse.json({ error: 'config_missing', message: 'Pinata not configured for this tenant' }, { status: 500 });
    }

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
      uploads.push(await pinOne(f, meta, finalJwt, finalGateway));
    }

    // return both keys for client compatibility
    return NextResponse.json({ ok: true, uploads, files: uploads }, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message || e);
    const status = /AbortError/i.test(msg) ? 504 : 500;
    return NextResponse.json({ ok: false, error: 'upload_failed', message: msg }, { status });
  }
}
