// src/app/api/public/projects/route.ts
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
    // 1) Get ALL bids (publicly visible on your backend). No status filter here.
    const bids = (await fetchJSON(`${API_BASE}/bids?_ts=${Date.now()}`)) || [];
    const visible = (Array.isArray(bids) ? bids : []).filter((b: any) => {
      const s = String(b?.status || '').toLowerCase();
      return s !== 'archived' && s !== 'rejected';
    });

    // 2) Fetch proposals for titles/org names
    const proposalIds = Array.from(
      new Set(
        visible
          .map((b: any) => b?.proposalId ?? b?.proposal_id)
          .filter((v: any) => v != null)
      )
    );

    const proposals = new Map<number, any>();
    await Promise.all(
      proposalIds.map(async (id: any) => {
        const p = await fetchJSON(`${API_BASE}/proposals/${encodeURIComponent(String(id))}?_ts=${Date.now()}`);
        if (p) proposals.set(Number(id), p);
      })
    );

    // 3) Proofs per bid (best effort; ignore if endpoint is restricted)
    async function fetchProofs(bidId: number) {
      const p = await fetchJSON(`${API_BASE}/proofs/${encodeURIComponent(String(bidId))}?_ts=${Date.now()}`);
      const arr = Array.isArray(p) ? p : [];
      return arr.map((r: any) => ({
        proofId: r?.proofId ?? r?.id,
        milestoneIndex: asNum(r?.milestoneIndex ?? r?.milestone_index ?? 0),
        title: r?.title ?? '',
        publicText: r?.publicText ?? r?.public_text ?? r?.description ?? '',
        files: Array.isArray(r?.public_files) ? r.public_files
             : Array.isArray(r?.files) ? r.files
             : [],
        submittedAt: r?.submittedAt ?? r?.submitted_at ?? null,
      }));
    }

    // 4) Build public objects
    const out = await Promise.all(
      visible.map(async (b: any) => {
        const bidId = asNum(b?.bidId ?? b?.bid_id ?? b?.id);
        const proposalId = asNum(b?.proposalId ?? b?.proposal_id);
        const prop = proposals.get(proposalId) || {};
        const proofs = await fetchProofs(bidId).catch(() => []);

        return {
          bidId,
          proposalId,
          proposalTitle: prop?.public_title ?? prop?.title ?? '',
          orgName: prop?.orgName ?? prop?.org_name ?? '',
          vendorName: b?.vendorName ?? b?.vendor_name ?? '',
          priceUSD: asNum(b?.priceUSD ?? b?.price_usd ?? b?.price ?? 0),
          publicTitle: prop?.public_title ?? null,
          publicSummary: prop?.public_summary ?? null,
          milestones: toMilestones(b?.milestones),
          proofs,
          updatedAt: b?.updatedAt ?? b?.updated_at ?? null,
        };
      })
    );

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
