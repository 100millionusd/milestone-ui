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

/**
 * GET /api/proofs/change-requests?proposalId=NNN&include=responses&status=open|all
 * - Returns change requests.
 * - When include=responses, attaches vendor replies by slicing ProofFile.createdAt
 *   between this request and the next request for the same milestone.
 *
 * Why: vendors append files to the SAME Proof row; Proof.createdAt doesn't change,
 * so we must look at ProofFile.createdAt to build the conversation accurately.
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

    const requests = await prisma.proofChangeRequest.findMany({
      where: whereReq,
      orderBy: [{ createdAt: 'asc' }],
    });

    if (!includeResponses || requests.length === 0) {
      // If the UI only needs the list of requests
      return NextResponse.json(requests);
    }

    // 2) For each milestone that has requests, load its Proof row + ALL files (ASC by time)
    const msSet = Array.from(new Set(requests
      .map(r => (typeof r.milestoneIndex === 'number' ? r.milestoneIndex : null))
      .filter((n): n is number => n !== null)));

    const proofByMs = new Map<number, { id: number; note: string | null; files: any[] }>();

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
            createdAt: f.createdAt,
            url: f.url ?? (f.cid ? `${gatewayBase()}/${f.cid}` : undefined),
            cid: f.cid || undefined,
            name: f.name || undefined,
          })),
        });
      } else {
        proofByMs.set(mi, { id: -1, note: null, files: [] });
      }
    }

    // 3) Build responses per request by slicing ProofFile.createdAt between request[i] and next request[i+1]
    //    for the same milestone.
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
          nextTs = r2.createdAt;
          break;
        }
      }

      const proof = proofByMs.get(mi);
      const files = proof?.files || [];

      const startTs = r.createdAt;
      const endTs = nextTs; // may be null (then slice until +∞)

      // files added between this request and the next request are the replies to this request
      const windowed = files.filter(f => {
        const t = new Date(f.createdAt).getTime();
        const afterStart = t >= new Date(startTs).getTime();
        const beforeNext  = endTs ? t < new Date(endTs).getTime() : true;
        return afterStart && beforeNext;
      });

      // Build a single "response" object for this request, containing all files added in the window.
      // (If you want one response per file, map windowed -> many items.)
      const responses = windowed.length ? [{
        // set createdAt = first file in the window
        id: proof?.id ?? -1,
        createdAt: windowed[0].createdAt,
        note: proof?.note || '', // schema doesn't keep per-reply notes; we surface the latest note if present
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
    const checklist =
      Array.isArray(body.checklist) ? body.checklist
      : (typeof body.checklist === 'string' && body.checklist.trim()
          ? body.checklist.split(',').map((s: string) => s.trim()).filter(Boolean)
          : []);

    if (!Number.isFinite(proposalId) || !Number.isFinite(milestoneIndex) || milestoneIndex < 0) {
      return NextResponse.json({ error: 'bad_request', details: 'proposalId & milestoneIndex (>=0) required' }, { status: 400 });
    }

    const row = await prisma.proofChangeRequest.create({
      data: { proposalId, milestoneIndex, comment, checklist, status: 'open' },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
