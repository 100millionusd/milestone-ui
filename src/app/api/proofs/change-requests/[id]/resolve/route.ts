import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: 'bad_request', details: 'id must be a number' }, { status: 400 });
    }

    const updated = await prisma.proofChangeRequest.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });

    return NextResponse.json({ ok: true, request: updated });
  } catch (e: any) {
    return NextResponse.json({ error: 'db_error', message: String(e?.message || e) }, { status: 500 });
  }
}
