// src/app/templates/[id]/page.tsx
// Runtime flags
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import { getTemplate, getVendorProfile, createBidFromTemplate } from '@/lib/api';
import FileUploader from './FileUploader';
import TemplateRenovationHorizontal from '@/components/TemplateRenovationHorizontal';

type Props = { params: { id: string } };

// ---- Server action ----
async function startFromTemplate(formData: FormData) {
  'use server';
  const slugOrId = String(formData.get('id') || '');
  const proposalId = Number(formData.get('proposalId') || 0);
  const vendorName = String(formData.get('vendorName') || '');
  const walletAddress = String(formData.get('walletAddress') || '');
  const preferredStablecoin = String(formData.get('preferredStablecoin') || 'USDT') as 'USDT'|'USDC';

  // optional attachments (from FileUploader)
  const filesJson = String(formData.get('filesJson') || '[]');
  let files: string[] = [];
  try { files = JSON.parse(filesJson); } catch {}

  // milestones from the horizontal template widget (calendar dates + amounts)
  const milestonesJson = String(formData.get('milestonesJson') || '[]');
  let milestones: any[] = [];
  try { milestones = JSON.parse(milestonesJson); } catch {}

  const base = /^\d+$/.test(slugOrId)
    ? { templateId: Number(slugOrId) }
    : { slug: slugOrId };

  const res = await createBidFromTemplate({
    ...base,
    proposalId,
    vendorName,
    walletAddress,
    preferredStablecoin,
    milestones, // ← vendor-defined (split payments), not template defaults
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

  const preVendor = String(profile?.vendorName || '');
  const preWallet = String(profile?.walletAddress || '');

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <div className="relative isolate overflow-hidden bg-gradient-to-r from-cyan-600 to-indigo-600">
        <div className="mx-auto max-w-6xl px-4 py-10 text-white">
          <h1 className="text-3xl font-semibold drop-shadow-sm">{t.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-white/90">
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              {t.category || 'General'}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              {t.locale}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              {t.milestones.length} milestones
            </span>
          </div>
          {t.summary ? <p className="mt-3 max-w-3xl text-white/90">{t.summary}</p> : null}
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Template preview (read-only suggestions) */}
        <section className="lg:col-span-2">
          <h2 className="text-base font-semibold mb-3">Milestones (vendor enters amounts & dates)</h2>
          <ol className="space-y-4">
            {t.milestones.map((m) => (
              <li key={m.idx} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">Step {m.idx}</div>
                    <h3 className="text-lg font-medium">{m.name}</h3>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>Suggested: ${m.amount || 0}</div>
                    <div>ETA: +{m.days_offset}d</div>
                  </div>
                </div>
                {Array.isArray(m.acceptance) && m.acceptance.length > 0 && (
                  <ul className="mt-3 grid gap-1 text-sm text-slate-700 list-disc pl-5">
                    {m.acceptance.map((a: string, i: number) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* Right: Form to instantiate bid from this template */}
        <aside className="lg:col-span-1">
          <form action={startFromTemplate} className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
            <input type="hidden" name="id" value={t.slug || String(t.id)} />

            <div className="grid gap-3">
              <label className="block">
                <span className="text-sm">Proposal ID</span>
                <input name="proposalId" type="number" required className="mt-1 w-full border rounded-md px-3 py-2" />
              </label>

              <label className="block">
                <span className="text-sm">Vendor Name</span>
                <input name="vendorName" required defaultValue={preVendor} className="mt-1 w-full border rounded-md px-3 py-2" />
              </label>

              <label className="block">
                <span className="text-sm">Wallet (0x…)</span>
                <input
                  name="walletAddress"
                  required
                  defaultValue={preWallet}
                  pattern="^0x[a-fA-F0-9]{40}$"
                  className="mt-1 w-full border rounded-md px-3 py-2"
                />
              </label>

              <label className="block">
                <span className="text-sm">Stablecoin</span>
                <select name="preferredStablecoin" className="mt-1 w-full border rounded-md px-3 py-2">
                  <option value="USDT">USDT</option>
                  <option value="USDC">USDC</option>
                </select>
              </label>
            </div>

            {/* HORIZONTAL template with emojis → writes milestonesJson */}
            <div className="pt-2">
              <TemplateRenovationHorizontal hiddenFieldName="milestonesJson" />
            </div>

            {/* Optional attachments */}
            <div className="pt-2">
              <FileUploader apiBase={process.env.NEXT_PUBLIC_API_BASE || ''} />
            </div>

            <button type="submit" className="w-full px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700">
              Use this template → Create bid
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
