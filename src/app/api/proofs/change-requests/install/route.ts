import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export async function POST() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProofChangeRequest" (
        "id" SERIAL PRIMARY KEY,
        "proposalId" INTEGER NOT NULL,
        "milestoneIndex" INTEGER NOT NULL,
        "comment" TEXT,
        "checklist" JSONB,
        "status" TEXT NOT NULL DEFAULT 'open',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "resolvedAt" TIMESTAMPTZ
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ProofChangeRequest_proposalId_idx"
      ON "ProofChangeRequest" ("proposalId");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ProofChangeRequest_proposalId_milestoneIndex_idx"
      ON "ProofChangeRequest" ("proposalId","milestoneIndex");
    `);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
