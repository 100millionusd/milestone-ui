// src/app/templates/[id]/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";
import {
  getTemplate,
  getVendorProfile,
  createBidFromTemplate,
  analyzeBid,               // ← run Agent2 immediately
} from "@/lib/api";
import FileUploader from "./FileUploader";
import TemplateRenovationHorizontal from "@/components/TemplateRenovationHorizontal";

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { params: { id: string }; searchParams?: SearchParams };

function firstStr(v?: string | string[]) { return Array.isArray(v) ? v[0] : v ?? ""; }
function toNumber(v?: string | string[]) {
  const n = Number.parseInt(String(firstStr(v) || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---- Server action ----
async function startFromTemplate(formData: FormData) {
  "use server";

  const slugOrId = String(formData.get("id") || "");
  const proposalId = Number(formData.get("proposalId") || 0);
  const vendorName = String(formData.get("vendorName") || "");
  const walletAddress = String(formData.get("walletAddress") || "");
  const preferredStablecoin = String(formData.get("preferredStablecoin") || "USDT") as "USDT" | "USDC";

  // Files: keep objects (so admin list can render)
  const filesJson = String(formData.get("filesJson") || "[]");
  let files: Array<{ url: string; name?: string; cid?: string; mimetype?: string }> = [];
  try {
    const arr = JSON.parse(filesJson);
    files = Array.isArray(arr)
      ? arr
          .map((x: any) =>
            typeof x === "string"
              ? { url: x }
              : {
                  url: String(x?.url || ""),
                  name: x?.name || (String(x?.url || "").split("/").pop() || "file"),
                  cid: x?.cid,
                  mimetype: x?.mimetype || x?.contentType,
                }
          )
          .filter((f) => f.url)
      : [];
  } catch {}

  // Milestones
  const milestonesJson = String(formData.get("milestonesJson") || "[]");
  let milestones: any[] = [];
  try { milestones = JSON.parse(milestonesJson); } catch {}

  const base = /^\d+$/.test(slugOrId) ? { templateId: Number(slugOrId) } : { slug: slugOrId };

  // Send both files & docs so existing admin UI picks them up like normal bids
  const payload: any = {
    ...base,
    proposalId,
    vendorName,
    walletAddress,
    preferredStablecoin,
    milestones,
    files,           // new column many UIs read
    docs: files,     // legacy compatibility for attachments display
  };

  const res = await createBidFromTemplate(payload);
  // Kick Agent2 immediately so the vendor sees it on next page load
  try { await analyzeBid(res.bidId); } catch {}

  redirect(`/vendor/oversight?flash=bidCreated&agent2=open&bidId=${res.bidId}`);
}

// ---- Page ----
export default async function TemplateDetailPage({ params, searchParams }: Props) {
  const id = decodeURIComponent(params.id);
  const [t, profile] = await Promise.all([
    getTemplate(id).catch(() => null),
    getVendorProfile().catch(() => ({} as any)),
  ]);
  if (!t) return <div className="p-6">Template not found.</div>;

  const preVendor = String(profile?.vendorName || "");
  const preWallet = String(profile?.walletAddress || "");
  const proposalFromQS = toNumber(searchParams?.proposalId);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <div className="relative isolate overflow-hidden bg-gradient-to-r from-cyan-600 to-indigo-600">
        <div className="mx-auto max-w-7xl px-4 py-10 text-white">
          <h1 className="text-3xl font-semibold drop-shadow-sm">{t.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-white/90">
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              {t.category || "General"}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              {t.locale}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              vendor edits titles, descriptions, amounts & dates
            </span>
          </div>
          {t.summary ? <p className="mt-3 max-w-3xl text-white/90">{t.summary}</p> : null}
        </div>
      </div>

      {/* Single form — horizontal layout */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        <form action={startFromTemplate} className="space-y-6 rounded-2xl border bg-white p-4 shadow-sm">
          <input type="hidden" name="id" value={t.slug || String(t.id)} />

          {/* HORIZONTAL vendor basics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {/* Proposal: auto from query; hide input if present */}
            {proposalFromQS ? (
              <>
                <input type="hidden" name="proposalId" value={String(proposalFromQS)} />
                <div className="text-sm md:col-span-1">
                  <span className="block text-slate-500">Proposal</span>
                  <div className="mt-1 px-3 py-2 border rounded-md bg-slate-50">
                    #{proposalFromQS}
                  </div>
                </div>
              </>
            ) : (
              <label className="text-sm">
                <span className="block">Proposal ID</span>
                <input
                  name="proposalId"
                  type="number"
                  required
                  className="mt-1 w-full border rounded-md px-3 py-2"
                />
              </label>
            )}

            <label className="text-sm md:col-span-1">
              <span className="block">Stablecoin</span>
              <select name="preferredStablecoin" className="mt-1 w-full border rounded-md px-3 py-2" defaultValue="USDT">
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </label>

            <label className="text-sm md:col-span-1">
              <span className="block">Vendor Name</span>
              <input name="vendorName" required defaultValue={preVendor} className="mt-1 w-full border rounded-md px-3 py-2" />
            </label>

            <label className="text-sm md:col-span-1">
              <span className="block">Wallet (0x…)</span>
              <input
                name="walletAddress"
                required
                defaultValue={preWallet}
                pattern="^0x[a-fA-F0-9]{40}$"
                className="mt-1 w-full border rounded-md px-3 py-2"
              />
            </label>
          </div>

          {/* Scopes + editable milestones (no scrolling) */}
          <TemplateRenovationHorizontal milestonesInputName="milestonesJson" />

          {/* Optional attachments */}
          <div className="pt-1">
            <FileUploader apiBase={(process as any)?.env?.NEXT_PUBLIC_API_BASE || ""} />
          </div>

          {/* Submit under milestones */}
          <div className="flex justify-end">
            <button type="submit" className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm hover:bg-cyan-700">
              Use this template → Create bid
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
