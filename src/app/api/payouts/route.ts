// src/app/api/payouts/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPSTREAM =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE ||
  'https://milestone-api-production.up.railway.app';

function respond(status: number, body: string, contentType = 'application/json') {
  return new Response(body, { status, headers: { 'content-type': contentType } });
}

export async function GET(req: Request) {
  const cur = new URL(req.url);
  const cookie = req.headers.get('cookie') || '';

  // Build a tolerant query string (keep all params except our local cache-buster t)
  const passthrough = new URLSearchParams();
  cur.searchParams.forEach((val, key) => {
    if (key === 't') return;
    passthrough.set(key, val);
  });
  const qs = passthrough.toString();
  const suffix = qs ? `?${qs}` : '';

  // Try multiple upstream shapes: /payouts, /payments, per-bid variants, and /bids/:id
  const bidId = cur.searchParams.get('bidId') || cur.searchParams.get('bid_id') || '';
  const attempts: string[] = [];

  // generic lists
  attempts.push(`${UPSTREAM}/payouts${suffix}`);
  attempts.push(`${UPSTREAM}/payments${suffix}`);

  // per-bid (if provided)
  if (bidId) {
    const enc = encodeURIComponent(bidId);
    attempts.push(`${UPSTREAM}/payouts?bidId=${enc}`);
    attempts.push(`${UPSTREAM}/payouts?bid_id=${enc}`);
    attempts.push(`${UPSTREAM}/payments?bidId=${enc}`);
    attempts.push(`${UPSTREAM}/payments?bid_id=${enc}`);
    attempts.push(`${UPSTREAM}/bids/${enc}/payouts`);
    attempts.push(`${UPSTREAM}/bids/${enc}/payments`);
  }

  let last: Response | null = null;

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        cache: 'no-store',
      });

      const body = await res.text();
      if (res.ok) {
        return respond(res.status, body, res.headers.get('content-type') || 'application/json');
      }
      // keep last non-OK to surface its status later
      last = new Response(body, { status: res.status, headers: res.headers });
    } catch (e: any) {
      last = new Response(String(e ?? 'upstream error'), { status: 502, headers: { 'content-type': 'text/plain' } });
    }
  }

  if (last) {
    const body = await last.text();
    return respond(last.status, body);
  }
  return respond(502, JSON.stringify({ error: 'No upstream attempted' }));
}
