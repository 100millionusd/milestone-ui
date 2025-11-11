
// src/lib/auth.ts
'use client';
import { API_BASE } from '@/lib/apiBase';

async function getAddress(): Promise<string> {
  const eth: any = (globalThis as any).ethereum;
  if (!eth?.request) throw new Error('No wallet found');
  const accounts: string[] = await eth.request({ method: 'eth_requestAccounts' });
  if (!accounts?.length) throw new Error('Wallet not connected');
  return accounts[0].toLowerCase();
}

async function getNonce(address: string) {
  // Try GET first
  let r = await fetch(`${API_BASE}/auth/nonce?address=${address}`, { credentials: 'include' });
  if (r.status === 404) {
    // Fallback to POST
    r = await fetch(`${API_BASE}/auth/nonce`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
  }
  if (!r.ok) throw new Error(`nonce failed: ${r.status}`);
  return r.json() as Promise<{ nonce: string }>;
}

async function personalSign(address: string, message: string) {
  const eth: any = (globalThis as any).ethereum;
  return eth.request({ method: 'personal_sign', params: [message, address] });
}

// PUBLIC: do role-intent login
export async function loginAs(role: 'vendor' | 'proposer') {
  const address = await getAddress();
  const { nonce } = await getNonce(address);
  const signature = await personalSign(address, nonce);

  const resp = await fetch(`${API_BASE}/auth/login?role=${role}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, signature }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(t || `login failed: ${resp.status}`);
  }
  return resp.json(); // { token, role, roles }
}
