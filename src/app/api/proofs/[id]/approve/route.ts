export const dynamic = 'force-dynamic';

const API_BASE = 'https://milestone-api-production.up.railway.app';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const body = await req.text();
  const upstream = await fetch(`${API_BASE}/proofs/${params.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') || '',
      authorization: req.headers.get('authorization') || '',
    },
    body: body || undefined,
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
