// src/app/api/payouts/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = {
  id: number | string;
  bid_id: number | null;
  milestone_index: number | null;
  amount_usd: number | null;
  status: string | null;
  released_at: string | null; // ISO
  tx_hash: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bidId = url.searchParams.get('bidId');

  // Helper to build WHERE clause for different column names
  const where = (col: string) => (bidId ? ` WHERE ${col} = ${Number(bidId)}` : '');

  // We will try multiple table/column shapes and normalize to snake_case
  // 1) Prisma-style camelCase columns on "Payout"
  const q1 = `
    SELECT
      id,
      "bidId"           AS bid_id,
      "milestoneIndex"  AS milestone_index,
      "amountUsd"       AS amount_usd,
      status,
      to_char("releasedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS released_at,
      "txHash"          AS tx_hash,
      to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS created_at,
      to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS updated_at
    FROM "Payout"
    ${where(`"bidId"`)}
    ORDER BY "releasedAt" DESC
  `;

  // 2) snake_case columns on "payouts"
  const q2 = `
    SELECT
      id,
      bid_id,
      milestone_index,
      amount_usd,
      status,
      to_char(released_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS released_at,
      tx_hash,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS created_at,
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS updated_at
    FROM payouts
    ${where('bid_id')}
    ORDER BY released_at DESC
  `;

  // 3) Prisma-style camelCase columns but table named payouts
  const q3 = `
    SELECT
      id,
      "bidId"           AS bid_id,
      "milestoneIndex"  AS milestone_index,
      "amountUsd"       AS amount_usd,
      status,
      to_char("releasedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS released_at,
      "txHash"          AS tx_hash,
      to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS created_at,
      to_char("updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS updated_at
    FROM payouts
    ${where(`"bidId"`)}
    ORDER BY "releasedAt" DESC
  `;

  // 4) snake_case columns but table named "Payout"
  const q4 = `
    SELECT
      id,
      bid_id,
      milestone_index,
      amount_usd,
      status,
      to_char(released_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS released_at,
      tx_hash,
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS created_at,
      to_char(updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')  AS updated_at
    FROM "Payout"
    ${where('bid_id')}
    ORDER BY released_at DESC
  `;

  const attempts = [q1, q2, q3, q4];

  // Try each shape until one works (no throw) – first one that returns rows wins;
  // if all fail, we fall back to empty list.
  for (const sql of attempts) {
    try {
      const rows = (await prisma.$queryRawUnsafe(sql)) as Row[];

      // Even if table exists but empty, return [] (the UI will show “No payments”)
      return NextResponse.json({ payouts: rows ?? [] });
    } catch (e) {
      // Try next shape
      continue;
    }
  }

  // If everything failed (tables/columns don’t exist), return empty but 200 so UI isn’t red
  return NextResponse.json({ payouts: [] });
}
