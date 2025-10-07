import { NextResponse } from "next/server";
import { API_BASE } from "@/lib/api";

export const revalidate = 0;

function asNum(v: any) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

async function fetchJSON(url: string) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch { return null; }
}

/**
 * Tries a few likely backend endpoints. If none exist yet,
 * returns an empty shape the UI can render gracefully.
 */
export async function GET(_: Request, { params }: { params: { proposalId: string } }) {
  const proposalId = asNum(params.proposalId);
  if (!Number.isFinite(proposalId)) {
    return NextResponse.json({ error: "bad proposalId" }, { status: 400 });
  }

  // Try a few candidates your backend might expose later
  const candidates = [
    `${API_BASE}/audit?itemType=proposal&itemId=${proposalId}`,
    `${API_BASE}/audit?proposalId=${proposalId}`,
    `${API_BASE}/public/audit?proposalId=${proposalId}`,
  ];

  let events: any[] = [];
  for (const u of candidates) {
    const j = await fetchJSON(u);
    if (Array.isArray(j)) { events = j; break; }
    if (j && Array.isArray(j.events)) { events = j.events; break; }
  }

  // normalize a minimal structure
  const rows = (events || []).map((e: any) => ({
    createdAt: e?.created_at ?? e?.createdAt ?? null,
    action: e?.action ?? "",
    actorRole: e?.actor_role ?? e?.actorRole ?? "",
    actorAddress: e?.actor_address ?? e?.actorAddress ?? "",
    changedFields: Array.isArray(e?.changed_fields) ? e.changed_fields : (Array.isArray(e?.changedFields) ? e.changedFields : []),
    ipfsCid: e?.ipfs_cid ?? e?.ipfsCid ?? null,
    // optional anchoring info (if/when backend writes it)
    batch: e?.batch || null,
    merkleIndex: e?.merkle_index ?? e?.merkleIndex ?? null,
    proof: Array.isArray(e?.merkle_proof) ? e.merkle_proof : (Array.isArray(e?.proof) ? e.proof : []),
  }));

  // summary (latest anchor if present)
  const latestWithBatch = rows.find(r => r.batch && (r.batch.tx_hash || r.batch.txHash));
  const summary = latestWithBatch ? {
    anchored: true,
    txHash: latestWithBatch.batch.tx_hash ?? latestWithBatch.batch.txHash,
    periodId: latestWithBatch.batch.period_id ?? latestWithBatch.batch.periodId ?? null,
    contract: latestWithBatch.batch.contract_addr ?? latestWithBatch.batch.contract ?? null,
    chainId: latestWithBatch.batch.chain_id ?? latestWithBatch.batch.chainId ?? null,
    anchoredAt: latestWithBatch.batch.anchored_at ?? latestWithBatch.batch.anchoredAt ?? null,
  } : { anchored: false };

  return NextResponse.json({ events: rows, summary }, { status: 200 });
}
