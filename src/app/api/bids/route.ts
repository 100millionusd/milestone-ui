import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE ||
  'https://milestone-api-production.up.railway.app';

export async function GET() {
  const h = await headers();
  // Forward both cookie and authorization if present
  const cookie = h.get('cookie') || '';
  const auth = h.get('authorization') || '';

  const res = await fetch(`${API_BASE}/bids`, {
    method: 'GET',
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(auth ? { authorization: auth } : {}),
      'content-type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    return new Response(res.body, { status: res.status });
  }

  // FIX: Parse and sanitize URLs in the proxy response
  const data = await res.json();
  const fixed = Array.isArray(data) ? data.map((b: any) => {
    // Helper to fix a single URL
    const fix = (u: string) => {
      if (!u) return u;
      let url = u.trim();
      // 1. Fix malformed ".../ipfsbafy..." (missing slash)
      if (url.includes("/ipfsbafy") || url.includes("/ipfsQm")) {
        const split = url.includes("/ipfsbafy") ? "/ipfsbafy" : "/ipfsQm";
        const parts = url.split(split);
        if (parts.length >= 2) {
          const gateway = (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY) || "gateway.pinata.cloud";
          const host = gateway.replace(/^https?:\/\//, "").replace(/\/+$/, "");
          const cidPrefix = split.replace("/ipfs", "");
          return `https://${host}/ipfs/${cidPrefix}${parts[1]}`;
        }
      }
      // 2. Enforce preferred gateway
      if (url.includes("mypinata.cloud") || url.includes("pinata.cloud") || url.includes("/ipfs/")) {
        const gateway = (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY) || "gateway.pinata.cloud";
        const host = gateway.replace(/^https?:\/\//, "").replace(/\/+$/, "");
        return url.replace(/https?:\/\/[^/]+\/ipfs\//, `https://${host}/ipfs/`);
      }
      return url;
    };

    // Fix specific fields
    if (b.coverImage) b.coverImage = fix(b.coverImage);
    if (Array.isArray(b.images)) b.images = b.images.map(fix);
    if (Array.isArray(b.docs)) {
      b.docs = b.docs.map((d: any) => ({ ...d, url: fix(d.url), link: fix(d.link) }));
    }
    return b;
  }) : data;

  return NextResponse.json(fixed, { status: 200 });
}
