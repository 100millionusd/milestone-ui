import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

export const revalidate = 0; // no caching

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toMilestones(raw: any): any[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((m: any, idx: number) => ({
    name: m?.name ?? '',
    amount: asNum(m?.amount ?? 0),
    dueDate: m?.dueDate ?? m?.due_date ?? new Date().toISOString(),
    completed: !!m?.completed,
    completionDate: m?.completionDate ?? null,
    proof: m?.proof ?? '',
    paymentTxHash: m?.paymentTxHash ?? null,
    paymentDate: m?.paymentDate ?? null,
    archived: (m?.archived ?? m?.archived_flag ?? false) ? true : false,
    archivedAt: m?.archivedAt ?? m?.archived_at ?? null,
    archiveReason: m?.archiveReason ?? m?.archive_reason ?? null,
    index: idx,
  }));
}

async function fetchJSON(url: string) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

export async function GET() {
  try {
    // ✅ Use public proposals so the list works without auth
    const proposals = (await fetchJSON(`${API_BASE}/proposals?_ts=${Date.now()}`)) || [];
    const visible = (Array.isArray(proposals) ? proposals : []).filter((p: any) => {
      const s = String(p?.status || '').toLowerCase();
      return s !== 'archived' && s !== 'rejected';
    });

    // Best-effort: try to enrich from bids (may be auth-guarded; ignore failures)
    async function pickBidForProposal(proposalId: number) {
      const list = await fetchJSON(`${API_BASE}/bids?proposalId=${encodeURIComponent(String(proposalId))}&_ts=${Date.now()}`);
      const arr = Array.isArray(list) ? list : [];
      const approved = arr.find((x: any) => String(x?.status).toLowerCase() === 'approved');
      const best = approved || arr[0];
      if (!best) return null;
      return {
        bidId: asNum(best?.bidId ?? best?.id ?? best?.bid_id),
        vendorName: best?.vendorName ?? best?.vendor_name ?? '',
        priceUSD: asNum(best?.priceUSD ?? best?.price_usd ?? best?.price ?? 0),
        days: asNum(best?.days ?? 0),
        milestones: toMilestones(best?.milestones),
        updatedAt: best?.updatedAt ?? best?.updated_at ?? null,
        status: best?.status ?? 'pending',
      };
    }

    const out = await Promise.all(
      visible.map(async (p: any) => {
        const proposalId = asNum(p?.proposalId ?? p?.proposal_id ?? p?.id);
        const bid = await pickBidForProposal(proposalId).catch(() => null);
        return {
          // identifiers
          proposalId,
          bidId: bid?.bidId ?? null,

          // proposal fields (always public)
          orgName: p?.orgName ?? p?.org_name ?? '',
          proposalTitle: p?.public_title ?? p?.title ?? '',
          summary: p?.public_summary ?? p?.summary ?? p?.description ?? '',
          status: p?.status ?? 'pending',

          // optional bid enrichment
          vendorName: bid?.vendorName ?? '',
          priceUSD: bid?.priceUSD ?? 0,
          days: bid?.days ?? 0,
          milestones: bid?.milestones ?? [],

          // recency
          updatedAt: bid?.updatedAt ?? p?.updatedAt ?? p?.updated_at ?? null,
        };
      })
    );

    // Show freshest first
    out.sort((a: any, b: any) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
