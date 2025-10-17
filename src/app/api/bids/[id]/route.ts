export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';

const UPSTREAM =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE ||
  'https://milestone-api-production.up.railway.app';

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const h = headers();
  const cookie = h.get('cookie') || '';

  const attempts = [
    `${UPSTREAM}/bids/${encodeURIComponent(id)}`,
    `${UPSTREAM}/bid/${encodeURIComponent(id)}`,
    `${UPSTREAM}/bids?id=${encodeURIComponent(id)}`,
  ];

  let last: Response | null = null;
  for (const target of attempts) {
    const res = await fetch(target, {
      headers: { ...(cookie ? { cookie } : {}), Accept: 'application/json' },
      cache: 'no-store',
    });
    const body = await res.text();
    if (res.ok) {
      return new Response(body, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
      });
    }
    last = new Response(body, { status: res.status, headers: res.headers });
  }

  if (last) {
    const body = await last.text();
    return new Response(body, {
      status: last.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Bid not found via proxy' }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  });
}
