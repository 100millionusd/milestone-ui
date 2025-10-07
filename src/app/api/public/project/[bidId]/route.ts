// src/app/api/public/project/[bidId]/route.ts
import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

export const revalidate = 0;

function asNum(v: any) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

export async function GET(_: Request, { params }: { params: { bidId: string } }) {
  const bidId = asNum(params.bidId);
  if (!bidId) return NextResponse.json({ error: 'Invalid bidId' }, { status: 400 });

  const bidRes = await fetch(`${API_BASE}/bids/${bidId}?_ts=${Date.now()}`, { cache: 'no-store' });
  if (bidRes.status === 404) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!bidRes.ok) return NextResponse.json({ error: `HTTP ${bidRes.status}` }, { status: bidRes.status });
  const b = await bidRes.json();

  // proposal
  const proposalId = asNum(b?.proposalId ?? b?.proposal_id);
  let prop: any = {};
  if (proposalId) {
    const p = await fetch(`${API_BASE}/proposals/${proposalId}?_ts=${Date.now()}`, { cache: 'no-store' });
    if (p.ok) prop = await p.json();
  }

  // proofs (best effort)
  let proofs: any[] = [];
  try {
    const pr = await fetch(`${API_BASE}/proofs/${bidId}?_ts=${Date.now()}`, { cache: 'no-store' });
    if (pr.ok) proofs = await pr.json().then(a => (Array.isArray(a) ? a : []));
  } catch {}

  return NextResponse.json({
    bidId,
    proposalId,
    proposalTitle: prop?.public_title ?? prop?.title ?? '',
    orgName: prop?.orgName ?? prop?.org_name ?? '',
    vendorName: b?.vendorName ?? b?.vendor_name ?? '',
    priceUSD: asNum(b?.priceUSD ?? b?.price_usd ?? b?.price ?? 0),
    milestones: Array.isArray(b?.milestones) ? b.milestones.map((m: any, i: number) => ({
      name: m?.name ?? '',
      amount: asNum(m?.amount ?? 0),
      dueDate: m?.dueDate ?? m?.due_date ?? new Date().toISOString(),
      completed: !!m?.completed,
      index: i,
    })) : [],
    proofs: Array.isArray(proofs) ? proofs.map((p: any) => ({
      proofId: p?.proofId ?? p?.id,
      milestoneIndex: asNum(p?.milestoneIndex ?? p?.milestone_index ?? 0),
      title: p?.title ?? '',
      publicText: p?.publicText ?? p?.public_text ?? p?.description ?? '',
      files: Array.isArray(p?.public_files) ? p.public_files
           : Array.isArray(p?.files) ? p.files : [],
      submittedAt: p?.submittedAt ?? p?.submitted_at ?? null,
    })) : [],
    updatedAt: b?.updatedAt ?? b?.updated_at ?? null,
  }, { status: 200 });
}
