// src/app/templates/[id]/page.tsx
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { redirect } from 'next/navigation';
import {
  getTemplate,
  getVendorProfile,
  createBidFromTemplate,
  API_BASE,
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

/** ✅ Server action: normalize files, send BOTH files & docs + single `doc`, trigger Agent2 with that doc, poll, redirect */
async function startFromTemplate(formData: FormData) {
  'use server';

  const slugOrId = String(formData.get('id') || '');
  const proposalId = Number(formData.get('proposalId') || 0);
  const vendorName = String(formData.get('vendorName') || '');
  const walletAddress = String(formData.get('walletAddress') || '');
  const preferredStablecoin = String(formData.get('preferredStablecoin') || 'USDT') as 'USDT' | 'USDC';

  // attachments from client → normalize to real HTTP URLs
  const GW = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs';

  let filesArr: Array<{ url: string; name?: string }> = [];
  try {
    const raw = String(formData.get('filesJson') ?? '[]');
    const parsed = JSON.parse(raw);

    const toHttp = (x: any) => {
      if (!x) return null;

      // string → url
      if (typeof x === 'string') {
        let u = x;
        if (u.startsWith('ipfs://')) u = `${GW}/${u.slice('ipfs://'.length)}`;
        if (u.startsWith('blob:')) return null;
        return /^https?:\/\//.test(u) ? { url: u } : null;
      }

      // object → url|href|cid|hash
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

    filesArr = Array.isArray(parsed)
      ? (parsed.map(toHttp).filter(Boolean) as Array<{ url: string; name?: string }>)
      : [];
  } catch {}

  // SINGLE file for Agent2 (normal-bid parity)
  const doc: { url: string; name?: string } | null = filesArr[0] ?? null;

  // milestones from client
  let milestones: any[] = [];
  try {
    const raw = String(formData.get('milestonesJson') ?? '[]');
    const parsed = JSON.parse(raw);
    milestones = Array.isArray(parsed) ? parsed : [];
  } catch {}

  // slug or numeric template id
  const base = /^\d+$/.test(slugOrId)
    ? { templateId: Number(slugOrId) }
    : { slug: slugOrId };

  // 1) Create the bid with docs & a single doc (normal-bid shape)
  const created = await createBidFromTemplate({
    ...base,
    proposalId,
    vendorName,
    walletAddress,
    preferredStablecoin,
    milestones,
    files: filesArr,
    docs: filesArr,
    doc,
  });

  const bidId = Number((created as any)?.bidId ?? (created as any)?.bid_id);
  if (!bidId) {
    redirect(`/templates/${encodeURIComponent(slugOrId)}?error=template_create_failed`);
  }

  // 2) Force Agent2 to analyze THIS file (don’t rely on server picking doc)
  try {
    if (doc?.url) {
      await fetch(`${API_BASE}/bids/${encodeURIComponent(String(bidId))}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ doc }), // <— explicit single file, matches normal-bid analyzer input
      });
    }
  } catch { /* ignore */ }

  // 3) Poll until analysis appears (up to ~12s) so vendor page shows “parsed: Yes”
  const stopAt = Date.now() + 12000;
  while (Date.now() < stopAt) {
    try {
      const b = await getBid(bidId);
      const ai = (b as any)?.aiAnalysis ?? (b as any)?.ai_analysis;
      if (ai) break;
    } catch {}
    await new Promise(r => setTimeout(r, 900));
  }

  // 4) Redirect and auto-open Agent2
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
  const proposalFromQS = toNumber(searchParams?.proposalId);

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

      {/* Single horizontal client UI (must submit a <form> with hidden filesJson & milestonesJson) */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        <TemplateBidClient
          /** hidden input name="id" should be set by the client using this value */
          slugOrId={t.slug || String(t.id)}
          /** prefill like normal bids */
          initialProposalId={proposalFromQS}
          initialVendorName={preVendor}
          initialWallet={preWallet}
          /** 🔗 pass the server action; use it as <form action={startFromTemplate}> inside the client */
          startFromTemplateAction={startFromTemplate}
        />
      </div>
    </main>
  );
}
