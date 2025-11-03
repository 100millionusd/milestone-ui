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

/** ✅ Server action: match NORMAL BID flow exactly */
async function startFromTemplate(formData: FormData) {
  'use server';

  const slugOrId = String(formData.get('id') || '');
  const proposalId = Number(formData.get('proposalId') || 0);
  const vendorName = String(formData.get('vendorName') || '');
  const walletAddress = String(formData.get('walletAddress') || '');
  const preferredStablecoin = String(formData.get('preferredStablecoin') || 'USDT') as 'USDT' | 'USDC';

  // Get files - ensure they have proper structure for Agent2
  let filesArr: Array<{ url: string; name?: string; mimetype?: string; size?: number }> = [];
  try {
    const raw = String(formData.get('filesJson') ?? '[]');
    const parsed = JSON.parse(raw);
    
    // Normalize file objects for Agent2 compatibility
    filesArr = (Array.isArray(parsed) ? parsed : []).map(file => ({
      url: file.url || file.href || '',
      name: file.name || 'document',
      mimetype: file.mimetype || file.type || 'application/pdf',
      size: file.size || 0
    }));

    console.log('🔍 DEBUG - Files being sent to createBidFromTemplate:', {
      filesCount: filesArr.length,
      firstFile: filesArr[0],
      allFiles: filesArr
    });
  } catch (error) {
    console.error('❌ Error parsing filesJson:', error);
  }

  // Get milestones
  let milestones: any[] = [];
  try {
    const raw = String(formData.get('milestonesJson') ?? '[]');
    const parsed = JSON.parse(raw);
    milestones = Array.isArray(parsed) ? parsed : [];
  } catch {}

  const base = /^\d+$/.test(slugOrId)
    ? { templateId: Number(slugOrId) }
    : { slug: slugOrId };

  console.log('🔄 Server action creating template bid:', {
    slugOrId,
    proposalId,
    vendorName,
    filesCount: filesArr.length,
    fileStructure: filesArr[0]
  });

  // 🚀 Create bid using EXACT NORMAL BID structure
  const res = await createBidFromTemplate({
    ...base,
    proposalId,
    vendorName,
    walletAddress,
    preferredStablecoin,
    milestones,
    files: filesArr,
    docs: filesArr,
    doc: filesArr[0] || null, // Single doc for Agent2
  });

  const bidId = Number(res?.bidId);
  if (!bidId) {
    console.error('❌ Template bid creation failed:', res);
    redirect(`/templates/${encodeURIComponent(slugOrId)}?error=template_create_failed`);
  }

  console.log('✅ Template bid created:', bidId);

  // 🎯 DEBUG: Let's check what the created bid actually has
  try {
    const createdBid = await getBid(bidId);
    console.log('🔍 DEBUG - Created bid structure:', {
      bidId,
      hasDoc: !!createdBid.doc,
      hasDocs: Array.isArray(createdBid.docs) ? createdBid.docs.length : 0,
      hasFiles: Array.isArray(createdBid.files) ? createdBid.files.length : 0,
      docStructure: createdBid.doc,
      docsStructure: createdBid.docs?.[0],
      filesStructure: createdBid.files?.[0]
    });
  } catch (error) {
    console.error('❌ Error checking created bid:', error);
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

      {/* Single horizontal client UI */}
      <div className="mx-auto max-w-7xl px-4 py-8">
        <TemplateBidClient
          slugOrId={t.slug || String(t.id)}
          initialProposalId={proposalFromQS}
          initialVendorName={preVendor}
          initialWallet={preWallet}
          startFromTemplateAction={startFromTemplate}
        />
      </div>
    </main>
  );
}