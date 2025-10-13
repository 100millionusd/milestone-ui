import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_BASE || 'https://milestone-api-production.up.railway.app';

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const cookie = req.headers.get('cookie') ?? '';

  const upstream = await fetch(`${API_BASE}/auth/role`, {
    method: 'GET',
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      Accept: 'application/json'
    },
    cache: 'no-store',
    redirect: 'manual'
  });

  let data: unknown = null;
  try { data = await upstream.json(); } catch { /* leave null */ }

  return NextResponse.json(
    data ?? { error: 'Upstream returned no JSON' },
    { status: upstream.status }
  );
}
