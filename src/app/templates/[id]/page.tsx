export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import FileUploader from './FileUploader';
import { redirect } from 'next/navigation';
import { getTemplate, createBidFromTemplate } from '@/lib/api';

type Props = { params: { id: string } };

async function startFromTemplate(formData: FormData) {
  'use server';

  const slugOrId = String(formData.get('id') || '');
  const proposalId = Number(formData.get('proposalId') || 0);
  const vendorName = String(formData.get('vendorName') || '');
  const walletAddress = String(formData.get('walletAddress') || '');
  const preferredStablecoin = String(formData.get('preferredStablecoin') || 'USDT') as 'USDT' | 'USDC';

  // Optional attachments (uploaded before creating the bid)
  const filesJson = String(formData.get('filesJson') || '[]');
  let files: string[] = [];
  try { files = JSON.parse(filesJson); } catch {}

  // Milestone meta (names + acceptance) comes from a hidden field rendered by the page
  const msMetaJson = String(formData.get('msMeta') || '[]');
  let meta: Array<{ idx: number; name: string; acceptance?: string[] }> = [];
  try { meta = JSON.parse(msMetaJson); } catch {}

  // Build vendor-entered milestones
  const now = Date.now();
  const milestones = meta.map((m) => {
    const amount = Number(formData.get(`amount_${m.idx}`) || 0); // USD entered by vendor
    const days   = Math.max(0, Number(formData.get(`days_${m.idx}`) || 0)); // editable ETA days
    return {
      name: m.name,
      amount,
      dueDate: new Date(now + days * 86400 * 1000).toISOString(),
      acceptance: Array.isArray(m.acceptance) ? m.acceptance : [],
      archived: false,
    };
  });

  const base =
    /^\d+$/.test(slugOrId)
      ? { templateId: Number(slugOrId) }
      : { slug: slugOrId };

  // Send vendor-defined milestone amounts (override template zeros)
  const res = await createBidFromTemplate({
    ...base,
    proposalId,
    vendorName,
    walletAddress,
    preferredStablecoin,
    milestones, // ← vendor-entered amounts & due dates
    files,
  });

  redirect(`/vendor/oversight?flash=bidCreated&bidId=${res.bidId}`);
}

export default async function TemplateDetailPage({ params }: Props) {
  const id = decodeURIComponent(params.id);
  const t = await getTemplate(id).catch(() => null);
  if (!t) return <div className="p-6">Template not found.</div>;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-sm text-gray-500 mt-1">
        {t.category || 'General'} • {t.locale}
      </p>
      {t.summary ? <p className="text-gray-700 mt-3">{t.summary}</p> : null}

      <h2 className="text-lg font-semibold mt-6 mb-2">Milestones (ingrese montos en USD)</h2>

      {/* Hidden meta so the server action knows names/acceptance */}
      <input
        type="hidden"
        name="msMeta"
        form="startFromTemplateForm"
        value={JSON.stringify(
          t.milestones.map(ms => ({ idx: ms.idx, name: ms.name, acceptance: ms.acceptance || [] }))
        )}
        readOnly
      />

      <form id="startFromTemplateForm" action={startFromTemplate} className="mt-4 space-y-4">
        <input type="hidden" name="id" value={t.slug || String(t.id)} />

        <div className="grid md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm">Proposal ID</span>
            <input name="proposalId" type="number" required className="mt-1 w-full border rounded-md px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm">Vendor Name</span>
            <input name="vendorName" required className="mt-1 w-full border rounded-md px-3 py-2" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm">Wallet (0x…)</span>
            <input
              name="walletAddress"
              required
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

        {/* Vendor inputs: amount (USD) + ETA (days) per milestone */}
        <ul className="space-y-2">
          {t.milestones.map((ms) => (
            <li key={ms.idx} className="border rounded-lg p-3">
              <div className="font-medium">{ms.idx}. {ms.name}</div>
              <div className="mt-2 grid sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm">Amount (USD)</span>
                  <input
                    name={`amount_${ms.idx}`}
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    className="mt-1 w-full border rounded-md px-3 py-2"
                    defaultValue={0} // vendor must fill
                  />
                </label>
                <label className="block">
                  <span className="text-sm">ETA (days)</span>
                  <input
                    name={`days_${ms.idx}`}
                    type="number"
                    min="0"
                    className="mt-1 w-full border rounded-md px-3 py-2"
                    defaultValue={ms.days_offset || 0}
                  />
                </label>
              </div>
              {Array.isArray(ms.acceptance) && ms.acceptance.length > 0 && (
                <ul className="list-disc pl-5 text-sm text-gray-700 mt-2">
                  {ms.acceptance.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>

        {/* Optional attachments uploaded before creating the bid */}
        <FileUploader apiBase={process.env.NEXT_PUBLIC_API_BASE || ''} />

        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700"
        >
          Use this template → Create bid
        </button>
      </form>
    </main>
  );
}
