export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import FileUploader from './FileUploader';
import { redirect } from 'next/navigation';
import { getTemplate, createBidFromTemplate, getVendorProfile } from '@/lib/api';

type Props = {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function toNumber(v: string | string[] | undefined): number {
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number.parseInt(String(s ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function startFromTemplate(formData: FormData) {
  'use server';
  const slugOrId = String(formData.get('id') || '');
  const proposalId = Number(formData.get('proposalId') || 0);
  const vendorName = String(formData.get('vendorName') || '');
  const walletAddress = String(formData.get('walletAddress') || '');
  const preferredStablecoin = String(formData.get('preferredStablecoin') || 'USDT') as 'USDT' | 'USDC';

  // Optional attachments uploaded before creating the bid
  const filesJson = String(formData.get('filesJson') || '[]');
  let files: string[] = [];
  try { files = JSON.parse(filesJson); } catch {}

  const base =
    /^\d+$/.test(slugOrId)
      ? { templateId: Number(slugOrId) }
      : { slug: slugOrId };

  const res = await createBidFromTemplate({
    ...base,
    proposalId,
    vendorName,
    walletAddress,
    preferredStablecoin,
    files,
  });

  redirect(`/vendor/oversight?flash=bidCreated&bidId=${res.bidId}`);
}

export default async function TemplateDetailPage({ params, searchParams }: Props) {
  const id = decodeURIComponent(params.id);
  const t = await getTemplate(id).catch(() => null);
  if (!t) return <div className="p-6">Template not found.</div>;

  // ✅ Prefill like the normal bid page
  const proposalIdDefault = toNumber(searchParams?.proposalId);
  const profile = await getVendorProfile().catch(() => ({} as any));
  const vendorNameDefault =
    profile?.vendorName || profile?.name || '';
  const walletDefault =
    profile?.walletAddress || profile?.address || '';
  const stableDefault: 'USDT' | 'USDC' =
    (String(profile?.preferredStablecoin || 'USDT').toUpperCase() === 'USDC' ? 'USDC' : 'USDT');

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-sm text-gray-500 mt-1">
        {t.category || 'General'} • {t.locale}
      </p>
      {t.summary ? <p className="text-gray-700 mt-3">{t.summary}</p> : null}

      <h2 className="text-lg font-semibold mt-6 mb-2">Milestones (ingrese montos en USD)</h2>

      {/* List the template milestones (amounts are zero; vendor will set them later) */}
      <ul className="space-y-2 mb-4">
        {t.milestones.map((ms) => (
          <li key={ms.idx} className="border rounded-lg p-3">
            <div className="font-medium">
              {ms.idx}. {ms.name}
            </div>
            <div className="text-sm text-gray-600">
              Monto sugerido: $0 • ETA: +{ms.days_offset}d
            </div>
            {Array.isArray(ms.acceptance) && ms.acceptance.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-gray-700 mt-1">
                {ms.acceptance.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <form action={startFromTemplate} className="mt-4 space-y-3">
        {/* ID/slug used by the server action */}
        <input type="hidden" name="id" value={t.slug || String(t.id)} />

        <div className="grid md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm">Proposal ID</span>
            <input
              name="proposalId"
              type="number"
              required
              defaultValue={proposalIdDefault || ''}
              className="mt-1 w-full border rounded-md px-3 py-2"
            />
            {proposalIdDefault ? (
              <span className="text-xs text-gray-500">Prefilled from URL.</span>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm">Vendor Name</span>
            <input
              name="vendorName"
              required
              defaultValue={vendorNameDefault}
              className="mt-1 w-full border rounded-md px-3 py-2"
            />
            {vendorNameDefault ? (
              <span className="text-xs text-gray-500">Prefilled from your profile.</span>
            ) : null}
          </label>

          <label className="block md:col-span-2">
            <span className="text-sm">Wallet (0x…)</span>
            <input
              name="walletAddress"
              required
              pattern="^0x[a-fA-F0-9]{40}$"
              defaultValue={walletDefault}
              className="mt-1 w-full border rounded-md px-3 py-2"
            />
            {walletDefault ? (
              <span className="text-xs text-gray-500">Prefilled from your profile.</span>
            ) : null}
          </label>

          <label className="block">
            <span className="text-sm">Preferred Stablecoin</span>
            <select
              name="preferredStablecoin"
              defaultValue={stableDefault}
              className="mt-1 w-full border rounded-md px-3 py-2"
            >
              <option value="USDT">USDT</option>
              <option value="USDC">USDC</option>
            </select>
          </label>
        </div>

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
