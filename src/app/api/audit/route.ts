import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const API = (
  process.env.API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  ''
).replace(/\/$/, '');

export async function GET(req: NextRequest) {
  if (!API) {
    return NextResponse.json({ error: 'API_BASE missing' }, { status: 500 });
  }
  const take = req.nextUrl.searchParams.get('take') || '50';

  // ✅ your API exposes /audit, not /admin/audit/recent
  const r = await fetch(`${API}/audit?take=${encodeURIComponent(take)}`, {
    headers: {
      cookie: req.headers.get('cookie') || '',
      authorization: req.headers.get('authorization') || '',
    },
    credentials: 'include',
    cache: 'no-store',
  });

  const body = await r.json().catch(() => (r.ok ? [] : { error: 'Bad JSON' }));
  return NextResponse.json(body, { status: r.status });
}
