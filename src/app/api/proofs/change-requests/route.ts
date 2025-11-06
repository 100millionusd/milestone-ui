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

/**
 * GET /api/proofs/change-requests?proposalId=NNN&include=responses&status=open|all
 * - Returns change requests.
 * - When include=responses, attaches vendor replies by slicing ProofFile.createdAt
 *   between this request and the next request for the same milestone.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const proposalId = Number(searchParams.get('proposalId'));
    const includeResponses = (searchParams.get('include') || '').toLowerCase().includes('responses');
    const statusParam = (searchParams.get('status') || 'open').toLowerCase(); // 'open' | 'all' | 'resolved' etc.

    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId required' }, { status: 400 });
    }

    // 1) Load requests (ASC by time so we can window replies between requests)
    const whereReq: any = { proposalId };
    if (statusParam !== 'all') whereReq.status = statusParam;

    const raw = await prisma.proofChangeRequest.findMany({
      where: whereReq,
      orderBy: [{ createdAt: 'asc' }],
    });

    // Normalize checklist so UI always gets string[]
    const requests = raw.map((r: any) => ({
      ...r,
      checklist: parseChecklist((r as any).checklist),
    }));

    if (!includeResponses || requests.length === 0) {
      return NextResponse.json(requests);
    }

    // 2) For each milestone that has requests, load its Proof row + ALL files (ASC by time)
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

    // 3) Build responses per request by slicing ProofFile.createdAt between request[i] and next request[i+1] for the same milestone.
    const out = requests.map((r, idx) => {
      const mi = (typeof r.milestoneIndex === 'number') ? r.milestoneIndex : null;
      if (mi === null) {
        return { ...r, responses: [] as any[] };
      }

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
      const endTs = nextTs; // may be null (then slice until +∞)

      // files added between this request and the next request are the replies to this request
      const windowed = files.filter(f => {
        const t = new Date(f.createdAt).getTime();
        const afterStart = t >= new Date(startTs).getTime();
        const beforeNext  = endTs ? t < new Date(endTs).getTime() : true;
        return afterStart && beforeNext;
      });

      // Single response object per window (can be expanded to one-per-file if desired)
      const responses = windowed.length ? [{
        id: proof?.id ?? -1,
        createdAt: windowed[0].createdAt,
        note: proof?.note || '',
        files: windowed.map(f => ({ url: f.url, cid: f.cid, name: f.name })),
      }] : [];

      return { ...r, responses };
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
