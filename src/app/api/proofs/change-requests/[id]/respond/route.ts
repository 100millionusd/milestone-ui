// src/app/api/proofs/change-requests/[id]/respond/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id);
  const body = await req.json();

  // Create a response (your table might be ProofChangeResponse or ProofChangeReply)
  // Adjust model/field names if needed:
  const created = await prisma.proofChangeResponse.create({
    data: {
      changeRequestId: id,
      authorRole: body.authorRole || 'vendor',
      authorAddress: body.authorAddress ?? null,
      message: body.comment ?? body.message ?? '',
      files: Array.isArray(body.files) ? body.files : [],
    },
  });

  // Return the FULL, ordered thread
  const thread = await prisma.proofChangeRequest.findUnique({
    where: { id },
    include: {
      responses: { orderBy: { createdAt: 'asc' } },
      replies:   { orderBy: { createdAt: 'asc' } },
    },
  });

  const out: any = thread
    ? {
        ...thread,
        responses: Array.isArray((thread as any).responses)
          ? (thread as any).responses
          : Array.isArray((thread as any).replies)
          ? (thread as any).replies
          : [],
      }
    : null;

  return NextResponse.json(out ?? { ok: true });
}
