import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_BASE || 'https://milestone-api-production.up.railway.app';

export async function GET(req: NextRequest) {
  // Get the lx_jwt cookie
  const jwt = req.cookies.get('lx_jwt')?.value;

  if (!jwt) {
    return NextResponse.json({ role: 'guest' }, { status: 200 });
  }

  // Forward it as auth_token because your backend expects that
  const upstream = await fetch(`${API_BASE}/auth/role`, {
    method: 'GET',
    headers: {
      Cookie: `auth_token=${jwt}`,
      Accept: 'application/json',
      ...(req.headers.get('x-tenant-id') ? { 'X-Tenant-ID': req.headers.get('x-tenant-id')! } : {})
    },
    cache: 'no-store',
    redirect: 'manual'
  });

  let data: unknown = null;
  try {
    data = await upstream.json();
  } catch {
    return NextResponse.json({ error: 'Invalid upstream response' }, { status: 502 });
  }

  return NextResponse.json(data, { status: upstream.status });
}
