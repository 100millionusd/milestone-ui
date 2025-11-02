// src/app/templates/[id]/page.tsx
// Runtime flags
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";
import { getTemplate, getVendorProfile, createBidFromTemplate } from "@/lib/api";
import FileUploader from "./FileUploader";
import TemplateRenovationHorizontal from "@/components/TemplateRenovationHorizontal";

type Props = { params: { id: string } };

// ---- Server action ----
async function startFromTemplate(formData: FormData) {
  "use server";
  const slugOrId = String(formData.get("id") || "");
  const proposalId = Number(formData.get("proposalId") || 0);
  const vendorName = String(formData.get("vendorName") || "");
  const walletAddress = String(formData.get("walletAddress") || "");
  const preferredStablecoin = String(
    formData.get("preferredStablecoin") || "USDT"
  ) as "USDT" | "USDC";

  // optional attachments (from FileUploader)
  const filesJson = String(formData.get("filesJson") || "[]");
  let files: string[] = [];
  try {
    files = JSON.parse(filesJson);
  } catch {}

  // milestones from the horizontal emoji/milestones UI
  const milestonesJson = String(formData.get("milestonesJson") || "[]");
  let milestones: any[] = [];
  try {
    milestones = JSON.parse(milestonesJson);
  } catch {}

  const base = /^\d+$/.test(slugOrId)
    ? { templateId: Number(slugOrId) }
    : { slug: slugOrId };

  const res = await createBidFromTemplate({
    ...base,
    proposalId,
    vendorName,
    walletAddress,
    preferredStablecoin,
    milestones, // ← vendor-defined (split payments)
    files,
  });

  redirect(`/vendor/oversight?flash=bidCreated&bidId=${res.bidId}`);
}

// ---- Page ----
export default async function TemplateDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  const [t, profile] = await Promise.all([
    getTemplate(id).catch(() => null),
    getVendorProfile().catch(() => ({} as any)),
  ]);
  if (!t) return <div className="p-6">Template not found.</div>;

  const preVendor = String(profile?.vendorName || "");
  const preWallet = String(profile?.walletAddress || "");

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
              vendor defines amounts & dates
            </span>
          </div>
          {t.summary ? (
            <p className="mt-3 max-w-3xl text-white/90">{t.summary}</p>
          ) : null}
        </div>
      </div>

      {/* Form (everything horizontal per your spec) */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        <form
          action={startFromTemplate}
          className="space-y-6 rounded-2xl border bg-white p-4 shadow-sm"
        >
          <input type="hidden" name="id" value={t.slug || String(t.id)} />

          {/* >>> Vendor basics BAR (HORIZONTAL) <<< */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="text-sm">
              <span className="block">Proposal ID</span>
              <input
                name="proposalId"
                type="number"
                required
                className="mt-1 w-full border rounded-md px-3 py-2"
              />
            </label>

            <label className="text-sm md:col-span-1">
              <span className="block">Stablecoin</span>
              <select
                name="preferredStablecoin"
                className="mt-1 w-full border rounded-md px-3 py-2"
                defaultValue="USDT"
              >
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </label>

            <label className="text-sm md:col-span-1">
              <span className="block">Vendor Name</span>
              <input
                name="vendorName"
                required
                defaultValue={preVendor}
                className="mt-1 w-full border rounded-md px-3 py-2"
              />
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

          {/* >>> Horizontal scopes + non-scrolling milestones <<< */}
          <TemplateRenovationHorizontal milestonesInputName="milestonesJson" />

          {/* Optional attachments */}
          <div className="pt-1">
            <FileUploader
              // your API base will be read by the component, but we keep prop parity
              apiBase={(process as any)?.env?.NEXT_PUBLIC_API_BASE || ""}
            />
          </div>

          {/* Submit lives UNDER the milestones */}
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm hover:bg-cyan-700"
            >
              Use this template → Create bid
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
