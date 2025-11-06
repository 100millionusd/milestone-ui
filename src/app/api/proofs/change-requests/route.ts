import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

function gatewayBase(): string {
  const gw = process.env.NEXT_PUBLIC_PINATA_GATEWAY
    ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ipfs`
    : (process.env.NEXT_PUBLIC_IPFS_GATEWAY
        ? String(process.env.NEXT_PUBLIC_IPFS_GATEWAY).replace(/\/+$/, '')
        : 'https://gateway.pinata.cloud/ipfs');
  return gw;
}

// Normalize checklist from many possible shapes (string[], JSON string, multiline string, bullets)
function parseChecklist(input: unknown): string[] {
  if (Array.isArray(input)) return input.map(String).filter(Boolean);
  if (input == null) return [];
  const s = String(input).trim();
  // Allow JSON arrays too
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map(String).filter(Boolean);
  } catch {}
  // Split on newlines / bullets / semicolons; strip leading bullets/numbers
  return s
    .replace(/\r\n/g, '\n')
    .split(/\n|;|•/g)
    .map(v => v.replace(/^\s*[-*•]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}

// Pull files back out of either filesJson or files; ensure {name,url,cid?}
function normalizeCRFiles(row: any): Array<{ name: string; url: string; cid?: string }> {
  const gateway = gatewayBase();
  const raw = Array.isArray(row?.filesJson) ? row.filesJson
    : (Array.isArray(row?.files) ? row.files : []);
  const out: Array<{ name: string; url: string; cid?: string }> = [];
  for (const f of raw as any[]) {
    const name = (f?.name && String(f.name)) || 'file';
    const cid  = (f?.cid && String(f.cid).trim()) || '';
    let url    = (f?.url && String(f.url).trim()) || '';
    if (!/^https?:\/\//i.test(url)) {
      if (cid) url = `${gateway}/${cid}`;
    }
    if (!url && cid) url = `${gateway}/${cid}`;
    if (url) out.push({ name, url, cid: cid || undefined });
  }
  return out;
}

/**
 * GET /api/proofs/change-requests?proposalId=NNN&include=responses&status=open|all
 * - Returns change requests.
 * - include=responses attaches BOTH:
 *   (A) vendor replies from proofChangeResponse (your /respond route)
 *   (B) files added to the Proof between requests (windowed by createdAt)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proposalId = Number(searchParams.get('proposalId'));
    const includeResponses = (searchParams.get('include') || '').toLowerCase().includes('responses');
    const statusParam = (searchParams.get('status') || 'open').toLowerCase(); // 'open' | 'all' | 'resolved' etc.
    const miParam = searchParams.get('milestoneIndex');

    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId required' }, { status: 400 });
    }

    // 1) Load requests (ASC so we can window proof files)
    const whereReq: any = { proposalId };
    if (statusParam !== 'all') whereReq.status = statusParam;
    if (miParam != null && miParam !== '') whereReq.milestoneIndex = Number(miParam);

    const rawReqs = await prisma.proofChangeRequest.findMany({
      where: whereReq,
      orderBy: [{ createdAt: 'asc' }],
    });

    // Normalize checklist so UI always gets string[]
    const requests = rawReqs.map((r: any) => ({
      ...r,
      checklist: parseChecklist((r as any).checklist),
    }));

    if (!includeResponses || requests.length === 0) {
      return NextResponse.json(requests);
    }

    // 2) For each milestone that has requests, load its Proof + ALL files (ASC by time)
    const msSet = Array.from(
      new Set(
        requests
          .map(r => (typeof r.milestoneIndex === 'number' ? r.milestoneIndex : null))
          .filter((n): n is number => n !== null)
      )
    );

    const proofByMs = new Map<number, { id: number; note: string | null; files: Array<{ id: number; createdAt: Date; url?: string; cid?: string; name?: string }> }>();

    for (const mi of msSet) {
      const p = await prisma.proof.findFirst({
        where: { proposalId, milestoneIndex: mi },
        include: { files: { orderBy: { createdAt: 'asc' } } },
      });
      if (p) {
        proofByMs.set(mi, {
          id: p.id,
          note: p.note || null,
          files: (p.files || []).map(f => ({
            id: f.id,
            createdAt: f.createdAt as unknown as Date,
            url: f.url ?? (f.cid ? `${gatewayBase()}/${f.cid}` : undefined),
            cid: f.cid || undefined,
            name: f.name || undefined,
          })),
        });
      } else {
        proofByMs.set(mi, { id: -1, note: null, files: [] });
      }
    }

    // 3) ALSO load all DB-stored vendor responses for these requests (your /respond route)
    const reqIds = requests.map(r => r.id);
    const dbResponses = await prisma.proofChangeResponse.findMany({
      where: { requestId: { in: reqIds } },
      orderBy: { createdAt: 'asc' },
    });

    // Group responses by requestId
    const respByReq = new Map<number, any[]>();
    for (const rr of dbResponses as any[]) {
      const arr = respByReq.get(rr.requestId) || [];
      arr.push(rr);
      respByReq.set(rr.requestId, arr);
    }

    // 4) Build responses per request:
    //    (A) DB replies (note := comment, files := filesJson/files)
    //    (B) Windowed proof files between this request and the next request of same milestone
    const out = requests.map((r, idx) => {
      const mi = (typeof r.milestoneIndex === 'number') ? r.milestoneIndex : null;
      const group: Array<{ id: number; createdAt: Date; note: string; files: Array<{ url?: string; cid?: string; name?: string }> }> = [];

      // (A) DB replies
      const stored = respByReq.get(r.id) || [];
      const proofIdForMs = mi !== null ? (proofByMs.get(mi)?.id ?? -1) : -1;
      for (const s of stored) {
        const files = normalizeCRFiles(s);
        group.push({
          id: proofIdForMs,
          createdAt: s.createdAt as unknown as Date,
          note: (s.comment ?? '') as string, // map comment -> note so UI shows text
          files,
        });
      }

      // (B) Windowed proof files (legacy path)
      if (mi !== null) {
        // find the "next" request for the same milestone (strictly later)
        let nextTs: Date | null = null;
        for (let j = idx + 1; j < requests.length; j++) {
          const r2 = requests[j];
          if (r2.milestoneIndex === mi) {
            nextTs = r2.createdAt as unknown as Date;
            break;
          }
        }
        const proof = proofByMs.get(mi);
        const files = proof?.files || [];
        const startTs = r.createdAt as unknown as Date;
        const endTs = nextTs;

        const windowed = files.filter(f => {
          const t = new Date(f.createdAt).getTime();
          const afterStart = t >= new Date(startTs).getTime();
          const beforeNext  = endTs ? t < new Date(endTs).getTime() : true;
          return afterStart && beforeNext;
        });

        if (windowed.length) {
          group.push({
            id: proof?.id ?? -1,
            createdAt: windowed[0].createdAt as unknown as Date,
            note: proof?.note || '',
            files: windowed.map(f => ({ url: f.url, cid: f.cid, name: f.name })),
          });
        }
      }

      // sort by createdAt just in case
      group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return { ...r, responses: group };
    });

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const proposalId = Number(body.proposalId);
    const milestoneIndex = Number(body.milestoneIndex);
    const comment = typeof body.comment === 'string' ? body.comment : null;
    const checklist = parseChecklist(body.checklist);

    if (!Number.isFinite(proposalId) || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
      return NextResponse.json(
        { error: 'bad_request', details: 'proposalId & milestoneIndex (>=0) required' },
        { status: 400 }
      );
    }

    const row = await prisma.proofChangeRequest.create({
      data: { proposalId, milestoneIndex, comment, checklist, status: 'open' },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
