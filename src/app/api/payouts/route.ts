export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';

const UPSTREAM =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE ||
  'https://milestone-api-production.up.railway.app';

export async function GET(req: Request) {
  const h = headers();
  const cookie = h.get('cookie') || '';
  const url = new URL(req.url);

  const mine  = url.searchParams.get('mine')  || '';
  const bidId = url.searchParams.get('bidId') || url.searchParams.get('bid_id') || '';

  const attempts: string[] = [];
  if (mine) {
    attempts.push(`${UPSTREAM}/payouts?mine=${encodeURIComponent(mine)}`);
    attempts.push(`${UPSTREAM}/payments?mine=${encodeURIComponent(mine)}`);
  } else {
    attempts.push(`${UPSTREAM}/payouts`);
    attempts.push(`${UPSTREAM}/payments`);
  }
  if (bidId) {
    attempts.push(`${UPSTREAM}/payouts?bidId=${bidId}`);
    attempts.push(`${UPSTREAM}/payouts?bid_id=${bidId}`);
    attempts.push(`${UPSTREAM}/payments?bidId=${bidId}`);
    attempts.push(`${UPSTREAM}/payments?bid_id=${bidId}`);
    attempts.push(`${UPSTREAM}/bids/${bidId}/payouts`);
    attempts.push(`${UPSTREAM}/bids/${bidId}/payments`);
  }

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

  return new Response(JSON.stringify({ error: 'No upstream tried' }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  });
}
