// src/app/api/payouts/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { headers } from 'next/headers';

const UPSTREAM =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE ||
  'https://milestone-api-production.up.railway.app';

function passthrough(res: Response, body: string) {
  return new Response(body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') || 'application/json',
    },
  });
}

export async function GET(req: Request) {
  const h = headers();
  const cookie = h.get('cookie') || '';
  const cur = new URL(req.url);

  const p = cur.searchParams;
  const mine = p.get('mine') || '';
  const bidId = p.get('bidId') || p.get('bid_id') || '';
  const vendorAddress = p.get('vendorAddress') || '';

  // Build a query string for upstream, preserving unknown params (except cache buster t)
  const buildQS = (overrides: Record<string, string | undefined>) => {
    const q = new URLSearchParams();

    if (mine) q.set('mine', mine);
    if (vendorAddress) q.set('vendorAddress', vendorAddress);

    // Allow both bidId and bid_id variants
    const v = overrides.bidId ?? overrides.bid_id;
    if (v !== undefined) {
      if ('bidId' in overrides) q.set('bidId', String(v));
      if ('bid_id' in overrides) q.set('bid_id', String(v));
    }

    // copy any other params except ones we manage and the cache-buster
    cur.searchParams.forEach((val, key) => {
      if (['t', 'mine', 'bidId', 'bid_id', 'vendorAddress'].includes(key)) return;
      if (!q.has(key)) q.set(key, val);
    });

    const s = q.toString();
    return s ? `?${s}` : '';
  };

  // Try multiple likely upstream shapes
  const attempts: string[] = [];

  // Generic lists first
  attempts.push(`${UPSTREAM}/payouts${buildQS({})}`);
  attempts.push(`${UPSTREAM}/payments${buildQS({})}`);

  // If a bid is specified, try param and nested forms
  if (bidId) {
    attempts.push(`${UPSTREAM}/payouts${buildQS({ bidId })}`);
    attempts.push(`${UPSTREAM}/payouts${buildQS({ bid_id: bidId })}`);

    attempts.push(`${UPSTREAM}/payments${buildQS({ bidId })}`);
    attempts.push(`${UPSTREAM}/payments${buildQS({ bid_id: bidId })}`);

    attempts.push(`${UPSTREAM}/bids/${encodeURIComponent(bidId)}/payouts`);
    attempts.push(`${UPSTREAM}/bids/${encodeURIComponent(bidId)}/payments`);
  }

  let last: Response | null = null;

  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(cookie ? { cookie } : {}),
        },
        cache: 'no-store',
      });

      const body = await res.text();
      if (res.ok) return passthrough(res, body);
      // keep last non-OK to return if all attempts fail
      last = new Response(body, { status: res.status, headers: res.headers });
    } catch (err: any) {
      last = new Response(String(err ?? 'upstream fetch error'), {
        status: 502,
        headers: { 'content-type': 'text/plain' },
      });
    }
  }

  if (last) {
    const body = await last.text();
    return new Response(body, {
      status: last.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'No attempt executed' }), {
    status: 502,
    headers: { 'content-type': 'application/json' },
  });
}
