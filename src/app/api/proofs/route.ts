import { NextResponse } from 'next/server';

type ProofFile = { url?: string; cid?: string; name?: string; path?: string };
type ProofRecord = {
  proposalId: number;
  bidId?: number | null;
  milestoneIndex?: number | null; // 0-based
  files: ProofFile[];
  note?: string | null;
};

// 🔧 QUICK BOOTSTRAP: put sample rows here so it works today.
// Replace with DB code in Step 3.
const BOOTSTRAP: Record<number, ProofRecord[]> = {
  110: [
    {
      proposalId: 110,
      milestoneIndex: 0,
      files: [
        {
          url: 'https://sapphire-given-snake-741.mypinata.cloud/ipfs/QmXPxvvQSy19QTzNvoPtZc1P7SdCqEuMuNkBs9y4A94n6L',
          name: 'image (10).jpg',
        },
        {
          url: 'https://sapphire-given-snake-741.mypinata.cloud/ipfs/QmRqJGEmMdTjRNxyqWfj7TxymGkM8zNuKthdo4aa5ydgz9',
          name: 'image (11).jpg',
        },
      ],
      note: 'M1 proof upload',
    },
  ],
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const pidRaw = url.searchParams.get('proposalId');
    if (!pidRaw) {
      return NextResponse.json({ error: 'proposalId is required' }, { status: 400 });
    }
    const proposalId = Number(pidRaw);
    if (!Number.isFinite(proposalId)) {
      return NextResponse.json({ error: 'proposalId must be a number' }, { status: 400 });
    }

    // Optional: filter by milestoneIndex if provided
    const miRaw = url.searchParams.get('milestoneIndex');
    const mi = miRaw === null ? null : Number(miRaw);
    const hasMi = miRaw !== null && Number.isFinite(mi);

    // TODO (optional): check auth/role here using cookies/headers if needed.

    const rows = (BOOTSTRAP[proposalId] || []).filter(r =>
      hasMi ? r.milestoneIndex === mi : true
    );

    // Always return an array (UI expects it)
    return NextResponse.json(rows, { headers: { 'cache-control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'server_error' }, { status: 500 });
  }
}

// Optional: reject other verbs
export function POST() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}
