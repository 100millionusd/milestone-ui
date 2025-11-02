// src/app/templates/[id]/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import TemplateRenovationHorizontal from '@/components/TemplateRenovationHorizontal';
import FileUploader from './FileUploader'; // optional; keep if you already have it
import { getTemplate, createBidFromTemplate } from '@/lib/api';

type Props = { params: { id: string } };

async function startFromTemplate(formData: FormData) {
  'use server';
  const slugOrId = String(formData.get('id') || '');
  const proposalId = Number(formData.get('proposalId') || 0);
  const vendorName = String(formData.get('vendorName') || '');
  const walletAddress = String(formData.get('walletAddress') || '');
  const preferredStablecoin = String(formData.get('preferredStablecoin') || 'USDT').toUpperCase() as 'USDT'|'USDC';

  // Milestones coming from the horizontal widget
  const milestonesJson = String(formData.get('milestonesJson') || '[]');
  let milestones: Array<{ name: string; amount: number; dueDate: string; acceptance?: string[]; archived?: boolean }> = [];
  try { milestones = JSON.parse(milestonesJson); } catch {}

  // Optional attachments uploaded before creating the bid
  const filesJson = String(formData.get('filesJson') || '[]');
  let files: string[] = [];
  try { files = JSON.parse(filesJson); } catch {}

  const base =
    /^\d+$/.test(slugOrId) ? { templateId: Number(slugOrId) } : { slug: slugOrId };

  const res = await createBidFromTemplate({
    ...base,
    proposalId,
    vendorName,
    walletAddress,
    preferredStablecoin,
    milestones,   // ← override amounts & dates with vendor inputs
    // @ts-ignore if your API accepts files: string[]; otherwise remove it
    files,
  });

  redirect(`/vendor/oversight?flash=bidCreated&bidId=${res.bidId}`);
}

export default async function TemplateDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  const t = await getTemplate(id).catch(() => null);
  if (!t) return <div className="p-6">Template not found.</div>;

  return (
    <main className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <header className="flex items-end justify-between gap-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">{t.title}</h1>
          <p className="text-sm text-slate-600 mt-1">{(t.category || 'General')} • {t.locale || ''}</p>
          {t.summary ? <p className="text-slate-700 mt-2 max-w-3xl">{t.summary}</p> : null}
        </div>
      </header>

      {/* FORM */}
      <form action={startFromTemplate} className="space-y-6">
        <input type="hidden" name="id" value={t.slug || String(t.id)} />

        {/* Vendor basics */}
        <section className="rounded-2xl border bg-white shadow-sm p-4">
          <h2 className="text-base font-semibold mb-3">Vendor details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">Proposal ID
              <input name="proposalId" type="number" required className="mt-1 w-full border rounded-md px-3 py-2" />
            </label>
            <label className="text-sm">Stablecoin
              <select name="preferredStablecoin" className="mt-1 w-full border rounded-md px-3 py-2">
                <option value="USDT">USDT</option>
                <option value="USDC">USDC</option>
              </select>
            </label>
            <label className="text-sm md:col-span-2">Vendor Name
              <input name="vendorName" required className="mt-1 w-full border rounded-md px-3 py-2" />
            </label>
            <label className="text-sm md:col-span-2">Wallet (0x…)
              <input name="walletAddress" required pattern="^0x[a-fA-F0-9]{40}$" className="mt-1 w-full border rounded-md px-3 py-2" />
            </label>
          </div>
        </section>

        {/* Horizontal template widget (writes milestonesJson) */}
        <TemplateRenovationHorizontal hiddenFieldName="milestonesJson" />

        {/* Optional attachments uploader (keeps filesJson up to date) */}
        <FileUploader apiBase={process.env.NEXT_PUBLIC_API_BASE || ''} />

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button type="submit" className="rounded-xl bg-cyan-600 text-white px-4 py-2 text-sm hover:bg-cyan-700">
            Use this template → Create bid
          </button>
        </div>
      </form>
    </main>
  );
}
