export type ProofFile = { url: string; name?: string };

export async function saveProof(params: {
  proposalId: number;
  milestoneIndex: number;      // ZERO-BASED (M1=0, M2=1, …)
  note?: string;
  files: ProofFile[];
}) {
  const res = await fetch('/api/proofs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`POST /api/proofs ${res.status} – ${txt}`);
  }
  return res.json();
}
