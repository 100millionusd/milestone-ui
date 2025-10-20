'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ethers } from 'ethers';
import { getBids, getProofs, archiveProof } from '@/lib/api';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import SendFunds from '@/components/SendFunds';
import AgentDigestWidget from "@/components/AgentDigestWidget";

// ---- RPC (read-only) ----
// Uses env when present (NEXT_PUBLIC_SEPOLIA_RPC) and falls back to public Sepolia.
const RPC_URL =
  (process.env.NEXT_PUBLIC_SEPOLIA_RPC || '').replace(/\/{1,}$/, '') ||
  'https://rpc.ankr.com/eth_sepolia';

// --- ERC20 and Tokens (unchanged) ---
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];
const TOKENS: Record<string, string> = {
  USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
};

// --- Tabs ---
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' }, // pending or approved and not fully completed
  { key: 'awarded', label: 'Awarded' }, // approved
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'archived', label: 'Archived' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function VendorDashboard() {
  const router = useRouter();
  const { address, logout, provider } = useWeb3Auth();

  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<{ ETH?: string; USDT?: string; USDC?: string }>({});
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  // Track archiving state per-bid to disable button and show "Archiving…"
  const [archivingIds, setArchivingIds] = useState<Set<number>>(new Set());
  // Slide-over control for SendFunds (UI only)
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    if (!address) {
      router.push('/vendor/login');
      return;
    }
    loadBids();
    loadBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function archiveAnyProofForBid(bidId: number) {
    // Load proofs for this bid (vendor-safe)
    const proofs = await getProofs(bidId);

    // Pick a proof we’re allowed to archive (not pending, not already archived)
    const target = proofs.find((p) => p.status !== 'pending' && p.status !== 'archived') ?? proofs[0];

    if (!target?.proofId && !target?.proof_id) {
      throw new Error('No proofs to archive for this bid.');
    }

    const proofId = target.proofId ?? target.proof_id;

    // Vendor-safe endpoint → POST /proofs/:proofId/archive
    return await archiveProof(proofId);
  }

  const loadBids = async () => {
    try {
      const all = await getBids();
      const mine = all
        .filter((b: any) => b?.walletAddress?.toLowerCase() === address?.toLowerCase())
        .map((b: any) => ({ ...b, proofs: b.proofs || [] }));
      setBids(mine);
    } catch (e) {
      console.error('Error loading bids:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadBalances = async () => {
    if (!address) return;
    try {
      let ethersProvider: ethers.Provider;
      if (provider) {
        ethersProvider = new ethers.BrowserProvider(provider as any);
      } else {
        ethersProvider = new ethers.JsonRpcProvider(RPC_URL);
      }

      const rawBalance = await ethersProvider.getBalance(address);
      const ethBal = ethers.formatEther(rawBalance);

      const results: any = { ETH: ethBal };
      for (const [symbol, tokenAddr] of Object.entries(TOKENS)) {
        try {
          const contract = new ethers.Contract(tokenAddr, ERC20_ABI, ethersProvider);
          const [raw, decimals] = await Promise.all([contract.balanceOf(address), contract.decimals()]);
          results[symbol] = ethers.formatUnits(raw, decimals);
        } catch (err) {
          console.error(`Error fetching ${symbol} balance:`, err);
        }
      }
      setBalances(results);
    } catch (err) {
      console.error('Error fetching balances:', err);
      setBalances({});
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/vendor/login');
  };

  const shortAddr = useMemo(() => (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : ''), [address]);

  const isBidCompleted = (bid: any) => {
    if (bid?.status === 'completed') return true;
    const ms = Array.isArray(bid?.milestones) ? bid.milestones : [];
    return ms.length > 0 && ms.every((m: any) => !!m.completed);
  };

  const computedStatusLabel = (bid: any) => {
    if (bid.status === 'completed' || isBidCompleted(bid)) return 'Completed';
    if (bid.status === 'approved') {
      const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
      const done = ms.filter((m: any) => m.completed).length;
      return `In Progress (${done}/${ms.length || 0})`;
    }
    if (bid.status === 'archived') return 'Archived';
    const status = bid.status ?? '';
    return status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : status;
  };

  const filtered = useMemo(() => {
    const lowerQ = query.trim().toLowerCase();
    const base = bids.filter((b) => {
      if (!lowerQ) return true;
      const hay = `${b.title || ''} ${b.orgName || ''} ${b.vendorName || ''} ${b.notes || ''}`.toLowerCase();
      return hay.includes(lowerQ);
    });

    switch (tab) {
      case 'active':
        return base.filter((b) => b.status === 'pending' || (b.status === 'approved' && !isBidCompleted(b)));
      case 'awarded':
        return base.filter((b) => b.status === 'approved');
      case 'completed':
        return base.filter((b) => b.status === 'completed' || isBidCompleted(b));
      case 'rejected':
        return base.filter((b) => b.status === 'rejected');
      case 'archived':
        return base.filter((b) => b.status === 'archived');
      default:
        return base;
    }
  }, [bids, tab, query]);

  const onArchive = async (bidId: number) => {
    const ok = window.confirm('Move this bid to Archived? You can still view it under the "Archived" tab.');
    if (!ok) return;

    setArchivingIds((prev) => new Set(prev).add(bidId));
    try {
      await archiveAnyProofForBid(bidId); // archives a proof (vendor-safe)
      await loadBids(); // refresh the list; don't replace a bid with a proof
    } catch (e: any) {
      alert(`Failed to archive: ${e?.message || 'Unknown error'}`);
    } finally {
      setArchivingIds((prev) => {
        const next = new Set(prev);
        next.delete(bidId);
        return next;
      });
    }
  };

  // --------- Layouts ---------
  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="h-5 w-32 animate-pulse rounded bg-slate-200" />
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {[0, 1, 2].map((key) => (
                  <div key={key} className="rounded border border-slate-200 bg-slate-50 p-4">
                    <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                    <div className="mt-3 h-6 w-3/4 animate-pulse rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((key) => (
                  <div key={key} className="h-32 rounded border border-slate-200 bg-slate-50" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-slate-900">Vendor Dashboard</h1>
            <p className="mt-0.5 text-sm text-slate-500">Manage your bids, proofs, and payouts.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSendOpen(true)}
              className="inline-flex items-center justify-center rounded-md bg-teal-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
              title="Start a transfer"
            >
              New Transfer
            </button>
            <div className="hidden text-right sm:block">
              <div className="text-xs text-slate-500">Signed in</div>
              <div className="font-mono text-sm text-slate-700">{shortAddr}</div>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(address || '')}
              className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              title="Copy wallet address"
            >
              Copy Address
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-black"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Agent 2 — What’s New */}
<section className="mb-6">
  <AgentDigestWidget />
</section>

        {/* Overview */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Balances</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Wallet: <span className="break-all font-mono text-xs text-slate-500">{address}</span>
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <BalanceCard label="ETH" value={balances.ETH} />
              <BalanceCard label="USDT" value={balances.USDT} />
              <BalanceCard label="USDC" value={balances.USDC} />
            </div>
          </div>

          {/* PAYMENT: Strongly contrasted tile */}
          <div className="rounded-xl bg-gradient-to-br from-teal-600 to-teal-700 p-6 text-white shadow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">Quick Transfer</h2>
                <p className="mt-1 text-sm text-white/80">Fast payouts from your connected wallet.</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/20">
                Secure
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                onClick={() => setSendOpen(true)}
                className="inline-flex items-center justify-center rounded-md bg-white/10 px-3.5 py-2 text-sm font-semibold text-white hover:bg-white/20 ring-1 ring-inset ring-white/20"
                title="Open transfer panel"
              >
                Send Funds
              </button>
              <span className="text-xs text-white/70">USDT / USDC</span>
            </div>
          </div>
        </section>

        {/* Toolbar */}
        <section className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={[
                    'inline-flex items-center rounded-full px-4 py-2 text-sm font-medium ring-1 ring-inset',
                    tab === t.key ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                  ].join(' ')}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="w-full md:w-80">
              <label className="relative block">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">🔍</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search bids…"
                  className="w-full rounded-md border border-slate-200 bg-white px-9 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </label>
            </div>
          </div>
        </section>

        {/* Projects & Milestones header */}
        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Projects & Milestones</h2>
        </div>

        {/* Bid list */}
        <section className="mt-3 space-y-6">
          {filtered.map((bid) => {
            const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
            const done = ms.filter((m: any) => m.completed).length;
            const total = ms.length;
            const progress = total ? Math.round((done / total) * 100) : 0;

            // ✅ allow archive if not already archived
            const canArchive = bid.status !== 'archived';
            const isArchiving = archivingIds.has(bid.bidId);

            return (
              <div key={bid.bidId} className="rounded-lg border border-slate-200 bg-white p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <h3 className="truncate text-lg font-semibold text-slate-900">{bid.title}</h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      <span className="font-mono text-xs text-slate-400">#{bid.bidId}</span>
                      {bid.orgName && (
                        <span>
                          <span className="text-slate-400">Organization:</span> {bid.orgName}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusPill status={bid.status} label={computedStatusLabel(bid)} />
                </div>

                {/* Milestones */}
                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Milestones</h4>
                    <p className="font-mono text-xs text-slate-500">{progress}%</p>
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                    <p>
                      Completed <span className="font-medium text-slate-900">{done}<span className="text-slate-400"> / {total}</span></span>
                    </p>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-900 transition-[width] duration-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    href={`/vendor/bids/${bid.bidId}`}
                    className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                    title="Open bid details and interact with Agent 2"
                  >
                    View / Agent 2
                  </Link>

                  {bid.status?.toLowerCase() === 'approved' && (
                    <>
                      <Link
                        href={`/vendor/proof/${bid.bidId}`}
                        className="inline-flex items-center justify-center rounded-md bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        Submit Proof
                      </Link>
                      <button
                        onClick={() => navigator.clipboard.writeText(bid.walletAddress)}
                        className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Copy Wallet Address
                      </button>
                    </>
                  )}

                  {canArchive && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onArchive(bid.bidId);
                      }}
                      disabled={isArchiving}
                      className="inline-flex items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Move this bid to Archived"
                    >
                      {isArchiving ? 'Archiving…' : 'Move to Archived'}
                    </button>
                  )}
                </div>

                {/* Quick facts */}
                <div className="mt-6 grid gap-4 md:grid-cols-4">
                  <InfoTile label="Your Bid" value={`$${Number(bid.priceUSD).toLocaleString()}`} accent="text-slate-900" />
                  <InfoTile label="Timeline" value={`${bid.days} days`} />
                  <InfoTile label="Payment" value={`${bid.preferredStablecoin}`} helper={`to ${bid.walletAddress}`} />
                  <InfoTile label="Status" value={computedStatusLabel(bid)} />
                </div>

                {/* Submitted proofs */}
                {bid.proofs?.length > 0 && (
                  <div className="mt-6 border-t border-slate-200 pt-5">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Submitted Proofs</h4>
                    <div className="mt-3 grid gap-3">
                      {bid.proofs.map((p: any, i: number) => (
                        <div key={i} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                          <p className="whitespace-pre-line text-sm text-slate-700">{p.description || 'No description'}</p>
                          {p.files?.length > 0 && (
                            <ul className="mt-3 space-y-1">
                              {p.files.map((f: any, j: number) => (
                                <li key={j} className="text-sm">
                                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-slate-900 underline-offset-4 hover:underline">
                                    {f.name}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                          <span
                            className={`mt-4 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                              p.status === 'approved'
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                                : p.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
                                : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                            }`}
                          >
                            {p.status || 'pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
              <div className="mb-3 text-4xl">🗂️</div>
              <h3 className="mb-1 text-lg font-semibold text-slate-900">No bids in this view</h3>
              <p className="mb-6 text-sm text-slate-500">Try a different tab or clear your search.</p>
              <Link href="/projects" className="inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-black">
                Browse Projects
              </Link>
            </div>
          )}
        </section>
      </main>

      {/* Slide-over for SendFunds (compact) */}
      {sendOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setSendOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Send Funds</h3>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">Secure</span>
              </div>
              <button
                onClick={() => setSendOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-4 text-sm">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                {/* Keep original component; we just contain & scale the visuals */}
                <div className="text-[13px] leading-5">
                  <SendFunds />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Presentation bits ---------------- */

function BalanceCard({ label, value }: { label: string; value?: string }) {
  const display = value ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—';
  return (
    <div className="rounded-md border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label} Balance</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{display}</div>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const cls =
    status === 'approved'
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
      : status === 'completed'
      ? 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200'
      : status === 'rejected'
      ? 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200'
      : status === 'archived'
      ? 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200'
      : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200';
  return <span className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function InfoTile({ label, value, helper, accent }: { label: string; value: string; helper?: string; accent?: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={[`mt-2 text-lg font-semibold`, accent || 'text-slate-900'].join(' ')}>{value}</p>
      {helper && <p className="mt-1 break-all text-xs text-slate-500">{helper}</p>}
    </div>
  );
}
