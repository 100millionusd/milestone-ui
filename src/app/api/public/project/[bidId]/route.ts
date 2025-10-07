// src/app/api/public/project/[bidId]/route.ts
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

export async function GET(
  _req: Request,
  { params }: { params: { bidId: string } }
) {
  const bidId = Number(params.bidId);
  if (!Number.isFinite(bidId)) {
    return NextResponse.json({ error: 'Invalid bidId' }, { status: 400 });
  }

  try {
    const bid: Json = await fetchJSON(`${API_BASE}/bids/${bidId}`);
    const proposalId = bid?.proposalId ?? bid?.proposal_id;

    let proposal: Json | null = null;
    try { proposal = proposalId ? await fetchJSON(`${API_BASE}/proposals/${proposalId}`) : null; } catch {}

    // milestones from bid JSON
    const rawMilestones = Array.isArray(bid?.milestones)
      ? bid.milestones
      : (typeof bid?.milestones === 'string' ? JSON.parse(bid.milestones || '[]') : []);

    const milestones = (rawMilestones || []).map((m: any, i: number) => ({
      index: i,
      name: String(m?.name ?? ''),
      amount: toNumber(m?.amount ?? 0),
      dueDate: m?.dueDate ?? m?.due_date ?? null,
      completed: !!m?.completed,
      archived: !!m?.archived,
    }));

    // proofs (for images)
    let images: string[] = [];
    let proofs: any[] = [];
    try {
      const list: Json[] = await fetchJSON(`${API_BASE}/proofs/${bidId}`);
      proofs = (list || []).map((pr: any) => ({
        proofId: pr?.proofId ?? pr?.id,
        title: pr?.title ?? '',
        description: pr?.description ?? '',
        files: Array.isArray(pr?.files) ? pr.files : [],
      }));
      images = proofs
        .flatMap((pr) => pr.files)
        .map((f: any) => String(f?.url || ''))
        .filter((u) => isImageUrl(u))
        .slice(0, 12);
    } catch {
      proofs = [];
      images = [];
    }

    return NextResponse.json({
      bidId,
      proposalId: proposalId ?? null,
      vendorName: bid?.vendorName ?? bid?.vendor_name ?? '',
      status: String(bid?.status || ''),
      title: proposal?.title ?? `Project #${proposalId ?? '—'}`,
      summary: proposal?.summary ?? '',
      milestones,
      images,
      proofs, // full file list available for the details page
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Not found' }, { status: 404 });
  }
}
