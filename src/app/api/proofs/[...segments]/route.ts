export const dynamic = 'force-dynamic';

const API_BASE = 'https://milestone-api-production.up.railway.app';

/**
 * Proxies any /api/proofs/** request to the Railway backend.
 * Examples:
 *   POST /api/proofs/247/approve  ->  POST  /proofs/247/approve
 *   POST /api/proofs/247/reject   ->  POST  /proofs/247/reject
 *   GET  /api/proofs?bidId=123    ->  GET   /proofs?bidId=123
 */
async function proxy(req: Request, segments: string[]) {
  const url = new URL(req.url);

  // Build target path:
  // - when there are segments, join them after /proofs/
  // - when there are none (e.g. /api/proofs?…), keep it as /proofs
  const tail = segments.length ? `/${segments.map(encodeURIComponent).join('/')}` : '';
  const target = new URL(`${API_BASE}/proofs${tail}${url.search}`);

  // Pass through method + body + auth headers
  const method = req.method.toUpperCase();
  const bodyText = method === 'GET' || method === 'HEAD' ? undefined : await req.text();

  const upstream = await fetch(target.toString(), {
    method,
    headers: {
      'Content-Type': req.headers.get('content-type') || 'application/json',
      cookie: req.headers.get('cookie') || '',
      authorization: req.headers.get('authorization') || '',
    },
    body: bodyText,
  });

  // Stream back the response as-is
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: { segments?: string[] } }
) {
  return proxy(req, params.segments ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: { segments?: string[] } }
) {
  return proxy(req, params.segments ?? []);
}

export async function PUT(
  req: Request,
  { params }: { params: { segments?: string[] } }
) {
  return proxy(req, params.segments ?? []);
}

export async function PATCH(
  req: Request,
  { params }: { params: { segments?: string[] } }
) {
  return proxy(req, params.segments ?? []);
}

export async function DELETE(
  req: Request,
  { params }: { params: { segments?: string[] } }
) {
  return proxy(req, params.segments ?? []);
}
