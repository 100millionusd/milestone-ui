// src/app/templates/[id]/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import {
  getTemplate,
  getVendorProfile,
  createBidFromTemplate,
  getBid,
} from '@/lib/api';
import TemplateBidClient from './TemplateBidClient';

type SearchParams = Record<string, string | string[] | undefined>;
type Props = { params: { id: string }, searchParams?: SearchParams };

function firstStr(v?: string | string[]) { return Array.isArray(v) ? v[0] : v ?? ''; }
function toNumber(v?: string | string[]) {
  const n = Number.parseInt(String(firstStr(v) || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * ✅ Server action:
 * - Do NOT rely on form 'proposalId' being present
 * - Resolve proposalId from form → else from template(slug/id) → else fail gracefully
 * - Normalize files to {url,name}
 * - Send both files/docs and single doc (normal-bid parity)
 */
async function startFromTemplate(
  ctx: { slugOrId: string },               // we bind this at render-time below
  formData: FormData
) {
  'use server';

  // slug / id from bound context (never rely on client adding a hidden input)
  const slugOrId = String(ctx?.slugOrId || '');

  // try proposalId from form first
  let proposalId = Number(formData.get('proposalId') || 0);

  // if missing/invalid, resolve from template
  if (!Number.isFinite(proposalId) || proposalId <= 0) {
    try {
      const tmpl = await getTemplate(slugOrId);
      proposalId = Number(
        (tmpl as any)?.proposalId ??
        (tmpl as any)?.proposal_id ??
        (tmpl as any)?.proposal?.id ??
        (tmpl as any)?.projectId ??
        (tmpl as any)?.project_id ??
        0
      );
    } catch {
      // ignore; handled below
    }
  }

  if (!Number.isFinite(proposalId) || proposalId <= 0) {
    redirect(`/templates/${encodeURIComponent(slugOrId)}?error=missing_proposal`);
  }

  const vendorName = String(formData.get('vendorName') || '');
  const walletAddress = String(formData.get('walletAddress') || '');
  const preferredStablecoin = String(formData.get('preferredStablecoin') || 'USDT') as 'USDT' | 'USDC';
  const vendorNotes = String(formData.get('notes') || '');

  // ---- Files: normalize to real HTTP URLs (only {url,name})
  const GW = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

  let docsClean: Array<{ url: string; name?: string }> = [];
  try {
    const raw = String(formData.get('filesJson') ?? '[]');
    const parsed: any[] = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];

    const toHttp = (x: any) => {
      if (!x) return null;

      if (typeof x === 'string') {
        let u = x;
        if (u.startsWith('ipfs://')) u = `${GW}/${u.slice('ipfs://'.length)}`;
        if (u.startsWith('blob:')) return null;
        if (!/^https?:\/\//.test(u)) return null;
        return { url: u };
      }

      let u: string | null =
        (typeof x.url === 'string' && x.url) ||
        (typeof x.href === 'string' && x.href) ||
        (typeof x.cid === 'string' && `${GW}/${x.cid}`) ||
        (typeof x.hash === 'string' && `${GW}/${x.hash}`) ||
        null;

      if (!u) return null;
      if (u.startsWith('ipfs://')) u = `${GW}/${u.slice('ipfs://'.length)}`;
      if (u.startsWith('blob:')) return null;
      if (!/^https?:\/\//.test(u)) return null;

      return { url: String(u), name: x.name ? String(x.name) : undefined };
    };

    docsClean = parsed.map(toHttp).filter(Boolean) as Array<{ url: string; name?: string }>;
  } catch {
    docsClean = [];
  }

  // Single doc for Agent2 parity with normal bids
  const doc = docsClean[0] ?? null;

  // ---- Milestones
  let milestones: any[] = [];
  try {
    const raw = String(formData.get('milestonesJson') ?? '[]');
    const parsed = JSON.parse(raw);
    milestones = Array.isArray(parsed) ? parsed : [];
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
    milestones,
    files: docsClean,
    docs: docsClean,
    doc,
    notes: vendorNotes,
  });

  const bidId = Number((res as any)?.bidId);
  if (!bidId) {
    redirect(`/templates/${encodeURIComponent(slugOrId)}?error=template_create_failed`);
  }

  redirect(`/vendor/bids/${bidId}?flash=agent2`);
}

export default async function TemplateDetailPage({ params, searchParams }: Props) {
  const id = decodeURIComponent(params.id);
  const [t, profile] = await Promise.all([
    getTemplate(id).catch(() => null),
    getVendorProfile().catch(() => ({} as any)),
  ]);
  if (!t) return <div className="p-6">Template not found.</div>;

  const preVendor = String(profile?.vendorName || '');
  const preWallet = String(profile?.walletAddress || '');

  // Resolve proposal id from URL or from the template itself
  const proposalFromQS = toNumber(searchParams?.proposalId);
  const proposalFromTemplate = Number(
    (t as any)?.proposalId ??
    (t as any)?.proposal_id ??
    (t as any)?.proposal?.id ??
    (t as any)?.projectId ??
    (t as any)?.project_id ??
    0
  );
  const resolvedProposalId = proposalFromQS || proposalFromTemplate;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <div className="relative isolate overflow-hidden bg-gradient-to-r from-cyan-600 to-indigo-600">
        <div className="mx-auto max-w-7xl px-4 py-10 text-white">
          <h1 className="text-3xl font-semibold drop-shadow-sm">{t.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-white/90">
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              {t.category || 'General'}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              {t.locale}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs ring-1 ring-white/30">
              vendor defines amounts & dates
            </span>
          </div>
          {t.summary ? <p className="mt-3 max-w-3xl text-white/90">{t.summary}</p> : null}
        </div>
      </div>

      {/* Single horizontal client UI */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        <TemplateBidClient
          slugOrId={t.slug || String(t.id)}
          initialProposalId={resolvedProposalId}
          initialVendorName={preVendor}
          initialWallet={preWallet}
          // Bind slug/id so the server action can always resolve template + proposalId
          startFromTemplateAction={startFromTemplate.bind(null, { slugOrId: t.slug || String(t.id) })}
        />
      </div>
    </main>
  );
}
