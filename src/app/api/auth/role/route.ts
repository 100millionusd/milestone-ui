import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.API_BASE || 'https://milestone-api-production.up.railway.app';

export async function GET(req: NextRequest) {
  const jwt = req.cookies.get('lx_jwt')?.value;

  if (!jwt) {
    return NextResponse.json({ role: 'guest' });
  }

  const upstream = await fetch(`${API_BASE}/auth/role`, {
    method: 'GET',
    headers: {
      Cookie: `lx_jwt=${jwt}`,
      Accept: 'application/json'
    },
    cache: 'no-store',
    redirect: 'manual'
  });

  let data: unknown = null;
  try {
    data = await upstream.json();
  } catch {
    /* leave null */
  }

  return NextResponse.json(
    data ?? { error: 'Upstream returned no JSON' },
    { status: upstream.status }
  );
}
