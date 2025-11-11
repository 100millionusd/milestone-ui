// src/lib/auth.ts
'use client';

// If your API runs on the same domain, leave this empty string.
// Otherwise, set NEXT_PUBLIC_API_BASE in .env.local (see bottom).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

async function getWalletAddress(): Promise<string> {
  const eth = (globalThis as any).ethereum;
  if (!eth) throw new Error('No wallet found. Please install MetaMask or a compatible wallet.');
  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('Wallet not connected.');
  return accounts[0].toLowerCase();
}

export async function loginAs(role: 'vendor' | 'proposer') {
  const address = await getWalletAddress();

  // 1) get nonce
  const n = await fetch(`${API_BASE}/auth/nonce?address=${address}`, {
    credentials: 'include',
  });
  if (!n.ok) throw new Error('Failed to get nonce');
  const { nonce } = await n.json();

  // 2) sign nonce (EIP-191 personal_sign)
  const signature = await (globalThis as any).ethereum.request({
    method: 'personal_sign',
    params: [nonce, address],
  });

  // 3) login WITH role intent
  const resp = await fetch(`${API_BASE}/auth/login?role=${role}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Login failed: ${resp.status} ${t}`);
  }
  return resp.json(); // { token, role, roles }
}
