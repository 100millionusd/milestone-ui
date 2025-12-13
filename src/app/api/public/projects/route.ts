// src/app/api/public/projects/route.ts
import { NextResponse } from "next/server";
import { API_BASE } from "@/lib/api";

export const revalidate = 0; // no caching

// Optional read-only token for server-to-server reads (set in Netlify env)
// e.g. PUBLIC_READ_BEARER="eyJhbGciOi..." (a normal JWT that can read bids)
const PUBLIC_READ_BEARER = process.env.PUBLIC_READ_BEARER || "";

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

function fixUrl(url: string) {
  if (!url) return "";
  let u = url.trim();

  // 1. Fix malformed ".../ipfsbafy..." (missing slash)
  if (u.includes("/ipfsbafy") || u.includes("/ipfsQm")) {
    const split = u.includes("/ipfsbafy") ? "/ipfsbafy" : "/ipfsQm";
    const parts = u.split(split);
    if (parts.length >= 2) {
      const gateway = (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY) || "gateway.pinata.cloud";
      const host = gateway.replace(/^https?:\/\//, "").replace(/\/+$/, "");
      const cidPrefix = split.replace("/ipfs", "");
      return `https://${host}/ipfs/${cidPrefix}${parts[1]}`;
    }
  }

  // 2. Enforce preferred gateway if it's a Pinata/IPFS URL
  if (u.includes("mypinata.cloud") || u.includes("pinata.cloud") || u.includes("/ipfs/")) {
    const gateway = (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_PINATA_GATEWAY) || "gateway.pinata.cloud";
    const host = gateway.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    // Replace the domain part
    return u.replace(/https?:\/\/[^/]+\/ipfs\//, `https://${host}/ipfs/`);
  }

  return u;
}

function extractImagesFromDocs(docs: any[]): string[] {
  if (!Array.isArray(docs)) return [];
  const urls: string[] = [];
  for (const d of docs) {
    const raw = d?.url || d?.link || pinataUrlFromCid(d?.cid) || "";
    const url = fixUrl(raw);
    if (!url) continue;
    if (/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(url)) urls.push(url);
    if (String(d?.contentType || "").startsWith("image/") && !urls.includes(url)) {
      urls.push(url);
    }
  }
  return urls;
}

function getSiteOrigin(): string {
  const raw =
    (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_SITE_URL) ||
    (typeof process !== "undefined" && (process as any).env?.URL) ||
    (typeof process !== "undefined" && (process as any).env?.DEPLOY_PRIME_URL) ||
    (typeof process !== "undefined" && (process as any).env?.VERCEL_URL) ||
    "";
  const s = String(raw).trim().replace(/\/+$/, "");
  if (!s) return "";
  return s.startsWith("http") ? s : `https://${s}`;
}

async function fetchJSON(url: string, init: RequestInit = {}) {
  const r = await fetch(url, { cache: "no-store", ...init });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

// Adds Authorization if PUBLIC_READ_BEARER is set
function authInit(): RequestInit {
  if (!PUBLIC_READ_BEARER) return {};
  return { headers: { Authorization: `Bearer ${PUBLIC_READ_BEARER}` } };
}

export async function GET() {
  try {
    // 1) Proposals (public)
    const proposals =
      (await fetchJSON(`${API_BASE}/proposals?_ts=${Date.now()}`)) || [];
    const visible = (Array.isArray(proposals) ? proposals : []).filter((p: any) => {
      const s = String(p?.status || "").toLowerCase();
      return s !== "archived" && s !== "rejected";
    });

    // 2) For each proposal:
    //    a) Try to load bids from backend (with optional bearer)
    //    b) Also pull images/files from our own Next API store
    const siteOrigin = getSiteOrigin();

    const getBidsForProposal = async (proposalId: number) => {
      const url = `${API_BASE}/bids?proposalId=${encodeURIComponent(String(proposalId))}&_ts=${Date.now()}`;
      const list = await fetchJSON(url, authInit());
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
    };

    const getProjectFilesFromNext = async (proposalId: number, siteOrigin: string) => {
      if (!siteOrigin) return [];
      // This hits your own Next API store that powers the Files tab
      const url = `${siteOrigin}/api/proofs?proposalId=${encodeURIComponent(String(proposalId))}`;
      const list = await fetchJSON(url);
      const arr = Array.isArray(list) ? list : [];
      // Flatten files arrays and keep only images
      const images: string[] = [];
      for (const row of arr) {
        const files = Array.isArray(row?.files) ? row.files : [];
        for (const f of files) {
          const raw = f?.url || "";
          const u = fixUrl(raw);
          if (!u) continue;
          if (/\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(u)) images.push(u);
        }
      }
      // De-dup
      return Array.from(new Set(images));
    };

    const out = await Promise.all(
      visible.map(async (p: any) => {
        const proposalId = asNum(p?.proposalId ?? p?.proposal_id ?? p?.id);

        const [bids, imagesFromNext] = await Promise.all([
          getBidsForProposal(proposalId).catch(() => []),
          getProjectFilesFromNext(proposalId, siteOrigin).catch(() => []),
        ]);

        // images from proposal.docs + images from Next Files store
        const docs = Array.isArray(p?.docs) ? p.docs : [];
        const images = Array.from(
          new Set([...(extractImagesFromDocs(docs) || []), ...(imagesFromNext || [])])
        );
        const coverImage = images[0] || null;

        const approved = bids.find((b) => String(b.status).toLowerCase() === "approved");
        const featured = approved || bids[0] || null;

        return {
          // identity
          proposalId,
          bidId: featured?.bidId ?? null,

          // proposal content
          orgName: p?.orgName ?? p?.org_name ?? "",
          proposalTitle: p?.public_title ?? p?.title ?? "",
          summary: p?.public_summary ?? p?.summary ?? p?.description ?? "",

          // media
          coverImage,
          images,

          // bids + milestones
          bids,

          // convenience from featured bid
          vendorName: featured?.vendorName ?? "",
          priceUSD: featured?.priceUSD ?? 0,
          days: featured?.days ?? 0,

          // recency + status
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
    return NextResponse.json({ error: e?.message || "failed" }, { status: 500 });
  }
}
