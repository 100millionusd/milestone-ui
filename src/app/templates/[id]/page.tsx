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

/** Deep, defensive resolver that tries very hard to find a proposalId inside a template object */
function deepFindProposalId(obj: any): number {
  const seen = new Set<any>();
  const q: any[] = [obj];

  const idFromAny = (k: string, v: unknown): number => {
    // Accept numbers or numeric strings
    if (typeof v === 'number' && v > 0 && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
      // Extract from URLs like "...?proposalId=182"
      const m = v.match(/(?:\?|&)(?:proposalId|proposal_id|projectId|project_id)=(\d+)/i);
      if (m) return Number(m[1]);
    }
    // Nested objects with id field
    if (v && typeof v === 'object' && 'id' in (v as any)) {
      const id = Number((v as any).id);
      if (Number.isFinite(id) && id > 0) return id;
    }
    return 0;
  };

  while (q.length) {
    const cur = q.pop();
    if (!cur || typeof cur !== 'object' || seen.has(cur)) continue;
    seen.add(cur);

    // direct keys we care about
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (
        lk === 'proposalid' || lk === 'proposal_id' ||
        lk === 'projectid'  || lk === 'project_id' ||
        lk === 'proposal'   || lk === 'project'
      ) {
        const found = idFromAny(k, v);
        if (found) return found;
      }
      // also scan string values for ...?proposalId=123
      if (typeof v === 'string') {
        const found = idFromAny(k, v);
        if (found) return found;
      }
      // continue traversal
      if (v && typeof v === 'object') q.push(v);
    }
  }
  return 0;
}

/** ✅ Server action: match NORMAL BID flow exactly (send only {url,name}) */
async function startFromTemplate(formData: FormData) {
  'use server';

  const slugOrId = String(formData.get('id') || '');
  // 1) try proposalId from form
  let proposalId = Number(formData.get('proposalId') || 0);

  // 2) if missing, derive from template server-side (no guessing from client)
  if (!Number.isFinite(proposalId) || proposalId <= 0) {
    try {
      const tmpl = await getTemplate(slugOrId);
      proposalId =
        Number(
          (tmpl as any)?.proposalId ??
          (tmpl as any)?.proposal_id ??
          (tmpl as any)?.proposal?.id ??
          (tmpl as any)?.projectId ??
          (tmpl as any)?.project_id ??
          0
        ) || deepFindProposalId(tmpl);
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

  // ---- Files: normalize to real HTTP URLs ----
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

  // Resolve proposal id from URL -> template fields -> deep scan of template
  const proposalFromQS = toNumber(searchParams?.proposalId);
  const proposalFromTemplate = Number(
    (t as any)?.proposalId ??
    (t as any)?.proposal_id ??
    (t as any)?.proposal?.id ??
    (t as any)?.projectId ??
    (t as any)?.project_id ??
    0
  );
  const proposalFromDeep = proposalFromQS ? 0 : deepFindProposalId(t);
  const resolvedProposalId = proposalFromQS || proposalFromTemplate || proposalFromDeep;

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
          // You can ignore this on the client; leaving here is harmless
          startFromTemplateAction={startFromTemplate}
        />
      </div>
    </main>
  );
}
