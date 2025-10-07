// src/app/api/public/projects/route.ts
import { NextResponse } from 'next/server';

const DEFAULT_API_BASE = 'https://milestone-api-production.up.railway.app';
const API_BASE =
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  DEFAULT_API_BASE;

type Json = any;

function toNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(url || '');
}

async function fetchJSON(url: string) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export async function GET() {
  try {
    // 1) Get approved proposals
    const proposals: Json[] = await fetchJSON(`${API_BASE}/proposals?status=approved`);

    // 2) For each proposal, get its bids + proofs (images)
    const results = await Promise.all(
      proposals.map(async (p) => {
        const proposalId = p?.proposalId ?? p?.proposal_id ?? p?.id;
        if (!proposalId) return null;

        // bids for proposal
        const bids: Json[] = await fetchJSON(`${API_BASE}/bids?proposalId=${proposalId}`);

        // keep approved/completed
        const visibleBids = (bids || []).filter((b) =>
          ['approved', 'completed'].includes(String(b?.status || '').toLowerCase())
        );

        // normalize each bid
        const normalizedBids = await Promise.all(
          visibleBids.map(async (b) => {
            const bidId = b?.bidId ?? b?.bid_id ?? b?.id;
            const vendorName = b?.vendorName ?? b?.vendor_name ?? '';
            const priceUSD = toNumber(b?.priceUSD ?? b?.price_usd ?? b?.price);
            const status = String(b?.status || '');

            // milestones live in bids.milestones JSON
            const rawMilestones = Array.isArray(b?.milestones)
              ? b.milestones
              : (typeof b?.milestones === 'string' ? JSON.parse(b.milestones || '[]') : []);

            const milestones = (rawMilestones || []).map((m: any, i: number) => ({
              index: i,
              name: String(m?.name ?? ''),
              amount: toNumber(m?.amount ?? 0),
              dueDate: m?.dueDate ?? m?.due_date ?? null,
              completed: !!m?.completed,
              archived: !!m?.archived,
            }));

            // try to fetch proofs for images (best-effort)
            let images: string[] = [];
            try {
              const proofs: Json[] = await fetchJSON(`${API_BASE}/proofs/${bidId}`);
              const files = (proofs || []).flatMap((pr: any) => Array.isArray(pr?.files) ? pr.files : []);
              images = files
                .map((f: any) => String(f?.url || ''))
                .filter((u) => isImageUrl(u))
                .slice(0, 6); // cap thumbnails
            } catch {
              images = [];
            }

            return {
              bidId,
              vendorName,
              priceUSD,
              status,
              milestones,
              images,
            };
          })
        );

        return {
          proposalId,
          title: p?.title ?? '',
          summary: p?.summary ?? '',
          totalBudgetUSD: toNumber(p?.amountUSD ?? p?.amount_usd ?? p?.amount),
          bids: normalizedBids,
        };
      })
    );

    const projects = (results || []).filter(Boolean);

    return NextResponse.json({ projects });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load public projects' }, { status: 500 });
  }
}
