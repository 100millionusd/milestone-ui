// src/app/api/public/projects/route.ts
import { NextResponse } from "next/server";
import { API_BASE } from "@/lib/api";

export const revalidate = 0; // no caching

function asNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toMilestones(raw: any): any[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((m: any, idx: number) => ({
    name: m?.name ?? "",
    amount: asNum(m?.amount ?? 0),
    dueDate: m?.dueDate ?? m?.due_date ?? new Date().toISOString(),
    completed: !!m?.completed,
    completionDate: m?.completionDate ?? null,
    proof: m?.proof ?? "",
    paymentTxHash: m?.paymentTxHash ?? null,
    paymentDate: m?.paymentDate ?? null,
    archived: (m?.archived ?? m?.archived_flag ?? false) ? true : false,
    archivedAt: m?.archivedAt ?? m?.archived_at ?? null,
    archiveReason: m?.archiveReason ?? m?.archive_reason ?? null,
    index: idx,
  }));
}

function pinataUrlFromCid(cid?: string | null) {
  if (!cid) return null;
  const gateway =
    (typeof process !== "undefined" &&
      (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY) ||
    "gateway.pinata.cloud";
  return `https://${gateway}/ipfs/${cid}`;
}

function extractImages(docs: any[]): string[] {
  if (!Array.isArray(docs)) return [];
  const urls: string[] = [];
  for (const d of docs) {
    const url = d?.url || d?.link || pinataUrlFromCid(d?.cid) || "";
    if (!url) continue;
    if (/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(url)) urls.push(url);
    if (
      String(d?.contentType || "").startsWith("image/") &&
      !urls.includes(url)
    ) {
      urls.push(url);
    }
  }
  return urls;
}

async function fetchJSON(url: string) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  try {
    return await r.json();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    // 1) Pull proposals (public) and filter out archived/rejected
    const proposals =
      (await fetchJSON(`${API_BASE}/proposals?_ts=${Date.now()}`)) || [];
    const visible = (Array.isArray(proposals) ? proposals : []).filter(
      (p: any) => {
        const s = String(p?.status || "").toLowerCase();
        return s !== "archived" && s !== "rejected";
      }
    );

    // 2) For each proposal, best-effort load bids (may be guarded; ignore failures)
    async function getBidsForProposal(proposalId: number) {
      const list = await fetchJSON(
        `${API_BASE}/bids?proposalId=${encodeURIComponent(
          String(proposalId)
        )}&_ts=${Date.now()}`
      );
      const arr = Array.isArray(list) ? list : [];
      return arr.map((b: any) => ({
        bidId: asNum(b?.bidId ?? b?.id ?? b?.bid_id),
        vendorName: b?.vendorName ?? b?.vendor_name ?? "",
        priceUSD: asNum(b?.priceUSD ?? b?.price_usd ?? b?.price ?? 0),
        days: asNum(b?.days ?? 0),
        status: b?.status ?? "pending",
        createdAt: b?.createdAt ?? b?.created_at ?? null,
        updatedAt: b?.updatedAt ?? b?.updated_at ?? null,
        milestones: toMilestones(b?.milestones),
      }));
    }

    // 3) Build rich objects
    const out = await Promise.all(
      visible.map(async (p: any) => {
        const proposalId = asNum(p?.proposalId ?? p?.proposal_id ?? p?.id);
        const bids =
          (await getBidsForProposal(proposalId).catch(() => [])) || [];

        const docs = Array.isArray(p?.docs) ? p.docs : [];
        const images = extractImages(docs);
        const coverImage = images[0] || null;

        const approved = bids.find(
          (b) => String(b.status).toLowerCase() === "approved"
        );
        const featured = approved || bids[0] || null;

        return {
          // identity
          proposalId,
          bidId: featured?.bidId ?? null,

          // proposal content
          orgName: p?.orgName ?? p?.org_name ?? "",
          proposalTitle: p?.public_title ?? p?.title ?? "",
          summary:
            p?.public_summary ?? p?.summary ?? p?.description ?? "",

          // media
          coverImage,
          images,

          // bids + milestones
          bids,

          // convenience fields (from featured bid)
          vendorName: featured?.vendorName ?? "",
          priceUSD: featured?.priceUSD ?? 0,
          days: featured?.days ?? 0,

          // recency
          updatedAt:
            featured?.updatedAt ??
            p?.updatedAt ??
            p?.updated_at ??
            p?.createdAt ??
            p?.created_at ??
            null,
          status: p?.status ?? "pending",
        };
      })
    );

    // newest first
    out.sort((a: any, b: any) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );

    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed" },
      { status: 500 }
    );
  }
}
