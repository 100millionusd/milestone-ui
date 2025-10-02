import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = Number(ctx?.params?.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json(
        { error: 'bad_request', details: 'id must be a number' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const comment = typeof body.comment === 'string' ? body.comment : '';
    const files = Array.isArray(body.files) ? body.files : [];

    // Ensure request exists
    const cr = await prisma.proofChangeRequest.findUnique({ where: { id } });
    if (!cr) {
      return NextResponse.json(
        { error: 'not_found', details: 'change request not found' },
        { status: 404 }
      );
    }

    // Try to write response with files JSON (handle both possible column names),
    // then fall back to comment-only if schema doesn't have a JSON files column.
    let saved: any;
    try {
      // Attempt with filesJson
      saved = await (prisma as any).proofChangeResponse.create({
        data: {
          requestId: id,
          comment,
          filesJson: files,         // <-- if your model has filesJson JSON column
          createdBy: 'vendor',
        },
      });
    } catch {
      try {
        // Attempt with files
        saved = await (prisma as any).proofChangeResponse.create({
          data: {
            requestId: id,
            comment,
            files,                  // <-- if your model has files JSON column
            createdBy: 'vendor',
          },
        });
      } catch {
        // Final fallback: comment only
        saved = await prisma.proofChangeResponse.create({
          data: {
            requestId: id,
            comment,
            createdBy: 'vendor',
          },
        });
      }
    }

    // Do NOT auto-approve here. Keep request open until admin approves/requests again.
    return NextResponse.json({ ok: true, response: saved }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'server_error', message: String(e?.message || e) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 });
}
