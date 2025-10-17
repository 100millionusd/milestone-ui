// src/app/api/payments/route.ts
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const UPSTREAM =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE ||
  'https://milestone-api-production.up.railway.app';

function pass(status: number, body: string, contentType?: string) {
  return new Response(body, {
    status,
    headers: { 'content-type': contentType || 'application/json' },
  });
}

export async function GET(req: Request) {
  const cookie = req.headers.get('cookie') || '';
  const cur = new URL(req.url);
  const p = cur.searchParams;

  const mine = p.get('mine') || '';
  const bidId = p.get('bidId') || p.get('bid_id') || '';
  const vendorAddress = p.get('vendorAddress') || '';

  const buildQS = (overrides: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (mine) q.set('mine', mine);
    if (vendorAddress) q.set('vendorAddress', vendorAddress);
    const v = overrides.bidId ?? overrides.bid_id;
    if (v !== undefined) {
      if ('bidId' in overrides) q.set('bidId', String(v));
      if ('bid_id' in overrides) q.set('bid_id', String(v));
    }
    cur.searchParams.forEach((val, key) => {
      if (['t', 'mine', 'bidId', 'bid_id', 'vendorAddress'].includes(key)) return;
      if (!q.has(key)) q.set(key, val);
    });
    const s = q.toString();
    return s ? `?${s}` : '';
  };

  // Try both upstream names + per-bid shapes
  const attempts: string[] = [];
  attempts.push(`${UPSTREAM}/payments${buildQS({})}`);
  attempts.push(`${UPSTREAM}/payouts${buildQS({})}`);
  if (bidId) {
    attempts.push(`${UPSTREAM}/payments${buildQS({ bidId })}`);
    attempts.push(`${UPSTREAM}/payments${buildQS({ bid_id: bidId })}`);
    attempts.push(`${UPSTREAM}/payouts${buildQS({ bidId })}`);
    attempts.push(`${UPSTREAM}/payouts${buildQS({ bid_id: bidId })}`);
    attempts.push(`${UPSTREAM}/bids/${encodeURIComponent(bidId)}/payments`);
    attempts.push(`${UPSTREAM}/bids/${encodeURIComponent(bidId)}/payouts`);
  }

  let last: Response | null = null;
  for (const url of attempts) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', ...(cookie ? { cookie } : {}) },
        cache: 'no-store',
      });
      const body = await res.text();
      if (res.ok) return pass(res.status, body, res.headers.get('content-type') || 'application/json');
      last = new Response(body, { status: res.status, headers: res.headers });
    } catch (err: any) {
      last = new Response(String(err ?? 'upstream fetch error'), { status: 502, headers: { 'content-type': 'text/plain' } });
    }
  }

  if (last) {
    const body = await last.text();
    return pass(last.status, body);
  }
  return pass(502, JSON.stringify({ error: 'No attempt executed' }));
}
