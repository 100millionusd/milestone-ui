// src/app/api/payouts/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnyObj = Record<string, any>;

function normalizePayouts(rows: any[]): AnyObj[] {
  return (rows || []).map((r: any) => ({
    id: r?.id ?? r?.payment_id ?? r?.payout_id ?? r?.transfer_id ?? r?.hash ?? r?.tx_hash ?? '—',
    bid_id: r?.bid_id ?? r?.bidId ?? r?.bid?.id ?? r?.bid ?? null,
    milestone_index: r?.milestone_index ?? r?.milestoneIndex ?? r?.milestone ?? r?.i ?? null,
    amount_usd:
      r?.amount_usd ??
      r?.amountUsd ??
      r?.usd ??
      (r?.usdCents != null ? r.usdCents / 100 : r?.amount ?? null),
    status: r?.status ?? r?.state ?? r?.payout_status ?? null,
    released_at: r?.released_at ?? r?.releasedAt ?? r?.paid_at ?? r?.created_at ?? r?.createdAt ?? null,
    tx_hash: r?.tx_hash ?? r?.transaction_hash ?? r?.hash ?? null,
    created_at: r?.created_at ?? r?.createdAt ?? null,
    updated_at: r?.updated_at ?? r?.updatedAt ?? null,
  }));
}

async function safeJson(res: Response) {
  try { return await res.json(); } catch { return null; }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const origin = url.origin;

    const headers: HeadersInit = {
      Accept: 'application/json',
      cookie: req.headers.get('cookie') || '',
      authorization: req.headers.get('authorization') || '',
    };

    const bidIdParam = url.searchParams.get('bidId');
    const mine = url.searchParams.get('mine') === '1';

    // --- Case 1: per-bid payouts ---
    if (bidIdParam) {
      const bidId = Number(bidIdParam);
      if (!Number.isFinite(bidId)) return NextResponse.json({ payouts: [] }, { status: 200 });

      // Try /api/bids/:id and look for payouts/payments on it (admin pattern)
      const r = await fetch(`${origin}/api/bids/${bidId}?t=${Date.now()}`, {
        cache: 'no-store', credentials: 'include', headers,
      });

      if (r.ok) {
        const jb = await safeJson(r);
        const arr =
          (Array.isArray(jb?.payouts) ? jb.payouts : null) ??
          (Array.isArray(jb?.payments) ? jb.payments : null) ?? [];
        return NextResponse.json({ payouts: normalizePayouts(arr) }, { status: 200 });
      }

      // If that endpoint isn’t available, return empty but keep UI stable
      return NextResponse.json({ payouts: [] }, { status: 200 });
    }

    // --- Case 2: mine=1 → get my bids, then aggregate per-bid payouts ---
    if (mine) {
      // Ask our own API for *my* bids (like admin pass-through)
      const rb = await fetch(`${origin}/api/bids?mine=1&t=${Date.now()}`, {
        cache: 'no-store', credentials: 'include', headers,
      });
      const bj = rb.ok ? await safeJson(rb) : null;
      const bidRows = Array.isArray(bj) ? bj : (bj?.bids ?? []);
      const bidIds = (bidRows || [])
        .map((b: any) => Number(b?.id ?? b?.bid_id ?? b?.bidId))
        .filter((n: number) => Number.isFinite(n));

      if (bidIds.length === 0) return NextResponse.json({ payouts: [] }, { status: 200 });

      const CONCURRENCY = 6;
      const results: any[] = [];
      let i = 0;

      async function runBatch() {
        const batch = bidIds.slice(i, i + CONCURRENCY);
        i += CONCURRENCY;

        const chunkLists = await Promise.all(batch.map(async (id) => {
          const r = await fetch(`${origin}/api/bids/${id}?t=${Date.now()}`, {
            cache: 'no-store', credentials: 'include', headers,
          });
          if (!r.ok) return [];
          const jb = await safeJson(r);
          const arr =
            (Array.isArray(jb?.payouts) ? jb.payouts : null) ??
            (Array.isArray(jb?.payments) ? jb.payments : null) ?? [];
          return arr;
        }));

        chunkLists.forEach(arr => { if (Array.isArray(arr)) results.push(...arr); });
        if (i < bidIds.length) await runBatch();
      }

      await runBatch();
      return NextResponse.json({ payouts: normalizePayouts(results) }, { status: 200 });
    }

    // --- Case 3: no params → try to aggregate from all bids (dev/admin helpful) ---
    // If you have /api/bids that lists all, do a broad aggregation:
    const rbAll = await fetch(`${origin}/api/bids?t=${Date.now()}`, {
      cache: 'no-store', credentials: 'include', headers,
    });
    const bjAll = rbAll.ok ? await safeJson(rbAll) : null;
    const allBids = Array.isArray(bjAll) ? bjAll : (bjAll?.bids ?? []);
    const allIds = (allBids || [])
      .map((b: any) => Number(b?.id ?? b?.bid_id ?? b?.bidId))
      .filter((n: number) => Number.isFinite(n));

    if (allIds.length === 0) return NextResponse.json({ payouts: [] }, { status: 200 });

    const CONCURRENCY = 6;
    const results: any[] = [];
    let j = 0;
    async function runAll() {
      const batch = allIds.slice(j, j + CONCURRENCY);
      j += CONCURRENCY;

      const chunkLists = await Promise.all(batch.map(async (id) => {
        const r = await fetch(`${origin}/api/bids/${id}?t=${Date.now()}`, {
          cache: 'no-store', credentials: 'include', headers,
        });
        if (!r.ok) return [];
        const jb = await safeJson(r);
        const arr =
          (Array.isArray(jb?.payouts) ? jb.payouts : null) ??
          (Array.isArray(jb?.payments) ? jb.payments : null) ?? [];
        return arr;
      }));

      chunkLists.forEach(arr => { if (Array.isArray(arr)) results.push(...arr); });
      if (j < allIds.length) await runAll();
    }

    await runAll();
    return NextResponse.json({ payouts: normalizePayouts(results) }, { status: 200 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[payouts API]', msg);
    return NextResponse.json({ payouts: [], error: msg }, { status: 200 });
  }
}
