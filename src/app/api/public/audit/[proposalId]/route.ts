import { NextResponse } from "next/server";
import { API_BASE } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchJSON(url: string) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

async function fetchProposalById(id: number) {
  // Try /proposals/:id first; fall back to /proposals (and pick by id)
  const byId = await fetchJSON(`${API_BASE}/proposals/${id}`);
  if (byId && (byId.proposal_id || byId.id || byId.slug || byId.cid !== undefined)) return byId;

  const list = await fetchJSON(`${API_BASE}/proposals`);
  if (Array.isArray(list)) {
    return list.find(
      (p: any) =>
        p?.proposal_id === id || p?.id === id || Number(p?.proposalId) === id
    );
  }
  return null;
}

/**
 * Returns audit events + summary for a proposal.
 * Anchored = Boolean(cid)  (primary), with txHash/anchoredAt as secondary signals.
 */
export async function GET(_: Request, { params }: { params: { proposalId: string } }) {
  const proposalId = asNum(params.proposalId);
  if (!Number.isFinite(proposalId) || proposalId <= 0) {
    return NextResponse.json({ error: "bad proposalId" }, { status: 400 });
  }

  // 1) Load audit events from any of the likely backend endpoints
  const candidates = [
    `${API_BASE}/audit?itemType=proposal&itemId=${proposalId}`,
    `${API_BASE}/audit?proposalId=${proposalId}`,
    `${API_BASE}/public/audit?proposalId=${proposalId}`,
  ];

  let events: any[] = [];
  for (const u of candidates) {
    const j = await fetchJSON(u);
    if (Array.isArray(j)) {
      events = j;
      break;
    }
    if (j && Array.isArray(j.events)) {
      events = j.events;
      break;
    }
  }

  const rows = (events || []).map((e: any) => ({
    createdAt: e?.created_at ?? e?.createdAt ?? null,
    action: e?.action ?? "",
    actorRole: e?.actor_role ?? e?.actorRole ?? "",
    actorAddress: e?.actor_address ?? e?.actorAddress ?? "",
    changedFields: Array.isArray(e?.changed_fields)
      ? e.changed_fields
      : Array.isArray(e?.changedFields)
      ? e.changedFields
      : [],
    ipfsCid: e?.ipfs_cid ?? e?.ipfsCid ?? null,
    batch: e?.batch || null,
    merkleIndex: e?.merkle_index ?? e?.merkleIndex ?? null,
    proof: Array.isArray(e?.merkle_proof)
      ? e.merkle_proof
      : Array.isArray(e?.proof)
      ? e.proof
      : [],
  }));

  // Prefer the latest event that has batch/tx info (if any)
  const latestWithBatch =
    [...rows]
      .reverse()
      .find((r) => r.batch && (r.batch.tx_hash || r.batch.txHash)) || null;

  // 2) Load the proposal so we can read cid (source of truth for "anchored")
  const proposal = await fetchProposalById(proposalId);
  const cid: string | null = proposal?.cid ?? null;

  const txHash =
    latestWithBatch?.batch?.tx_hash ?? latestWithBatch?.batch?.txHash ?? null;
  const anchoredAt =
    latestWithBatch?.batch?.anchored_at ??
    latestWithBatch?.batch?.anchoredAt ??
    null;

  // FINAL truth: anchored if we have a CID; fall back to tx/anchoredAt if present
  const anchored = Boolean(cid || txHash || anchoredAt);

  const summary = {
    anchored,
    cid,
    ipfsHref: cid ? `${IPFS_GATEWAY}/${cid}` : null,
    txHash,
    periodId:
      latestWithBatch?.batch?.period_id ??
      latestWithBatch?.batch?.periodId ??
      null,
    contract:
      latestWithBatch?.batch?.contract_addr ??
      latestWithBatch?.batch?.contract ??
      null,
    chainId:
      latestWithBatch?.batch?.chain_id ?? latestWithBatch?.batch?.chainId ?? null,
    anchoredAt,
  };

  return NextResponse.json({ events: rows, summary }, { status: 200 });
}
