'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ethers } from 'ethers';
import { getBids, getProofs, archiveProof } from '@/lib/api';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import SendFunds from '@/components/SendFunds';
import {
  LayoutGrid,
  ShieldCheck,
  Layers,
  FileText,
  Rocket,
  Building2,
  Coins,
  Search,
  Copy,
  LogOut,
  Archive as ArchiveIcon,
  ArrowRight,
  Wallet,
} from 'lucide-react';

// ---- RPC (read-only) ----
// Uses env when present (NEXT_PUBLIC_SEPOLIA_RPC) and falls back to public Sepolia.
const RPC_URL =
  (process.env.NEXT_PUBLIC_SEPOLIA_RPC || '').replace(/\/+$/, '') ||
  'https://rpc.ankr.com/eth_sepolia';

// --- ERC20 + Tokens (unchanged) ---
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
  { key: 'active', label: 'Active' }, // pending or approved + not fully completed
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

  // Track archiving state per-bid to disable button + show "Archiving…"
  const [archivingIds, setArchivingIds] = useState<Set<number>>(new Set());

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
    const target =
      proofs.find(p => p.status !== 'pending' && p.status !== 'archived') ??
      proofs[0];

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

  const shortAddr = useMemo(() => (address ? address.slice(0, 6) + '…' + address.slice(-4) : ''), [address]);

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
    return bid.status?.charAt(0).toUpperCase() + bid.status?.slice(1);
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
        return base.filter(
          (b) => b.status === 'pending' || (b.status === 'approved' && !isBidCompleted(b))
        );
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

    setArchivingIds(prev => new Set(prev).add(bidId));
    try {
      await archiveAnyProofForBid(bidId);  // archives a proof (vendor-safe)
      await loadBids();                    // refresh the list; don't replace a bid with a proof
    } catch (e: any) {
      alert('Failed to archive: ' + (e?.message || 'Unknown error'));
    } finally {
      setArchivingIds(prev => {
        const next = new Set(prev);
        next.delete(bidId);
        return next;
      });
    }
  };

  // ——— Metrics (pure UI) ———
  const metrics = useMemo(() => {
    const total = bids.length;
    const awarded = bids.filter((b: any) => b.status === 'approved').length;
    const active = bids.filter((b: any) => b.status === 'pending' || (b.status === 'approved' && !isBidCompleted(b))).length;
    const completed = bids.filter((b: any) => b.status === 'completed' || isBidCompleted(b)).length;
    const rejected = bids.filter((b: any) => b.status === 'rejected').length;
    const archived = bids.filter((b: any) => b.status === 'archived').length;
    const totalUsd = bids.reduce((sum: number, b: any) => sum + (Number(b.priceUSD) || 0), 0);
    return { total, awarded, active, completed, rejected, archived, totalUsd };
  }, [bids]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="animate-pulse space-y-6">
            <div className="h-24 bg-white/70 rounded-3xl shadow-sm"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="h-28 bg-white/70 rounded-3xl shadow-sm"></div>
              <div className="h-28 bg-white/70 rounded-3xl shadow-sm"></div>
              <div className="h-28 bg-white/70 rounded-3xl shadow-sm"></div>
              <div className="h-28 bg-white/70 rounded-3xl shadow-sm"></div>
            </div>
            <div className="h-96 bg-white/70 rounded-3xl shadow-sm"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Grid layout: sidebar | main | rail */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_360px] gap-6">
          {/* ——— Sidebar ——— */}
          <aside className="hidden lg:block">
            <nav className="sticky top-8 space-y-2">
              <NavItem icon={<LayoutGrid className="h-4 w-4" />} label="Dashboard" active />
              <NavItem icon={<Layers className="h-4 w-4" />} label="Bids" href="#bids" />
              <NavItem icon={<ShieldCheck className="h-4 w-4" />} label="Compliance" disabled />
              <NavItem icon={<FileText className="h-4 w-4" />} label="Documents" disabled />
              <div className="pt-4">
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-4 ring-1 ring-black/5">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    <span className="text-sm/5">{shortAddr}</span>
                  </div>
                  <p className="text-xs/5 text-white/70 break-all mt-1">{address}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(address || '')}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/10 ring-1 ring-white/20 hover:bg-white/20"
                    >
                      <Copy className="inline h-3.5 w-3.5 mr-1" /> Copy
                    </button>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white text-slate-900 hover:bg-slate-100"
                    >
                      <LogOut className="inline h-3.5 w-3.5 mr-1" /> Sign out
                    </button>
                  </div>
                </div>
              </div>
            </nav>
          </aside>

          {/* ——— Main content ——— */}
          <main>
            {/* Hero */}
            <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white ring-1 ring-black/5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Vendor Dashboard</h1>
                  <p className="mt-1 text-sm text-white/80">Welcome back. Track bids, milestones, and payouts in one place.</p>
                </div>
                <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
                  <StatCard title="Total Value" value={`$${metrics.totalUsd.toLocaleString()}`} />
                  <StatCard title="Active" value={String(metrics.active)} />
                  <StatCard title="Completed" value={String(metrics.completed)} />
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={[
                      'px-3 py-1.5 rounded-full text-sm font-medium border transition',
                      tab === t.key ? 'bg-slate-900 text-white border-slate-900 shadow' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-full md:w-96 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search bids by title, org, or notes…"
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                />
              </div>
            </div>

            {/* Bids table */}
            <section id="bids" className="mt-6">
              {filtered.length > 0 ? (
                <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-white">
                  <div className="hidden md:grid grid-cols-12 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50"> 
                    <div className="col-span-5">Bid</div>
                    <div className="col-span-2">Value</div>
                    <div className="col-span-3">Milestones</div>
                    <div className="col-span-2">Actions</div>
                  </div>
                  <ul className="divide-y divide-slate-200">
                    {filtered.map((bid) => {
                      const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
                      const done = ms.filter((m: any) => m.completed).length;
                      const total = ms.length;
                      const progress = total ? Math.round((done / total) * 100) : 0;
                      const canArchive = bid.status !== 'archived';
                      const isArchiving = archivingIds.has(bid.bidId);

                      return (
                        <li key={bid.bidId} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-12 md:items-center gap-4">
                            {/* Bid + org */}
                            <div className="md:col-span-5">
                              <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center ring-1 ring-slate-200">
                                  <FileText className="h-5 w-5 text-slate-500" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">{bid.title}
                                    <StatusPill status={bid.status} label={computedStatusLabel(bid)} />
                                  </h3>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                    <span><span className="font-medium">Bid ID:</span> {bid.bidId}</span>
                                    {bid.orgName && (
                                      <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-slate-400" /> {bid.orgName}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Value */}
                            <div className="md:col-span-2">
                              <div className="text-sm font-semibold text-slate-900 tabular-nums">${Number(bid.priceUSD).toLocaleString()}</div>
                              <div className="text-xs text-slate-500">{bid.preferredStablecoin}</div>
                            </div>

                            {/* Milestones */}
                            <div className="md:col-span-3">
                              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                <span>Completed</span>
                                <span className="tabular-nums">{done}/{total} · {progress}%</span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-600 rounded-full transition-[width] duration-500" style={{ width: `${progress}%` }} />
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="md:col-span-2 flex flex-wrap md:justify-end gap-2">
                              <Link
                                href={`/vendor/bids/${bid.bidId}`}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                title="Open bid details and interact with Agent 2"
                              >
                                View / Agent 2 <ArrowRight className="h-3.5 w-3.5" />
                              </Link>

                              {bid.status?.toLowerCase() === 'approved' && (
                                <>
                                  <Link
                                    href={`/vendor/proof/${bid.bidId}`}
                                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                                  >
                                    Submit Proof
                                  </Link>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(bid.walletAddress)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    title="Copy recipient wallet"
                                  >
                                    <Copy className="h-3.5 w-3.5" /> Copy Wallet
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
                                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 text-amber-800 px-3 py-1.5 text-xs font-medium hover:bg-amber-50 disabled:opacity-60"
                                  title="Move this bid to Archived"
                                >
                                  <ArchiveIcon className="h-3.5 w-3.5" /> {isArchiving ? 'Archiving…' : 'Archive'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Proofs */}
                          {bid.proofs?.length > 0 && (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-slate-400" /> Submitted Proofs</h4>
                              <div className="grid gap-2">
                                {bid.proofs.map((p: any, i: number) => (
                                  <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-sm text-slate-800 whitespace-pre-line">{p.description || 'No description'}</p>
                                    {p.files?.length > 0 && (
                                      <ul className="mt-2 space-y-1">
                                        {p.files.map((f: any, j: number) => (
                                          <li key={j} className="text-sm">
                                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline underline-offset-2">{f.name}</a>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                    <span className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : p.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{p.status || 'pending'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="bg-white rounded-3xl shadow-sm ring-1 ring-slate-200 p-12 text-center">
                  <div className="text-5xl mb-4">🗂️</div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">No bids in this view</h2>
                  <p className="text-slate-600 mb-6">Try a different tab or clear your search.</p>
                  <Link href="/projects" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
                    <Rocket className="h-4 w-4" /> Browse Projects
                  </Link>
                </div>
              )}
            </section>
          </main>

          {/* ——— Right rail ——— */}
          <aside className="space-y-6">
            {/* Quick Account */}
            <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6">
              <div className="flex items-center gap-2 text-slate-900 font-semibold mb-2">
                <Wallet className="h-5 w-5 text-slate-500" /> Account
              </div>
              <p className="text-xs text-slate-500 break-all">{address}</p>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <BalanceCard label="ETH" value={balances.ETH} />
                <BalanceCard label="USDT" value={balances.USDT} />
                <BalanceCard label="USDC" value={balances.USDC} />
              </div>
            </div>

            {/* Send Funds */}
            <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Rocket className="h-4 w-4" /> Send Funds</h2>
              </div>
              <SendFunds />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Presentation bits ---------------- */

function NavItem({ icon, label, href, active, disabled }: { icon: React.ReactNode; label: string; href?: string; active?: boolean; disabled?: boolean }) {
  const className = [
    'w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium',
    active ? 'bg-slate-900 text-white shadow' : 'text-slate-700 hover:bg-slate-100',
    disabled ? 'opacity-50 pointer-events-none' : '',
  ].join(' ');
  if (href) return <Link href={href} className={className}>{icon}{label}</Link>;
  return <button className={className} type="button">{icon}{label}</button>;
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-white/70">{title}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function BalanceCard({ label, value }: { label: string; value?: string }) {
  const display = value ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—';
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label} Balance</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{display}</div>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const cls =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'completed'
      ? 'bg-blue-100 text-blue-800'
      : status === 'rejected'
      ? 'bg-rose-100 text-rose-800'
      : status === 'archived'
      ? 'bg-slate-200 text-slate-700'
      : 'bg-amber-100 text-amber-800';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function InfoTile({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-semibold text-slate-900 ${accent || ''}`}>{value}</p>
      {helper && <p className="mt-0.5 text-xs text-slate-500 break-all">{helper}</p>}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ethers } from 'ethers';
import { getBids, getProofs, archiveProof } from '@/lib/api';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import SendFunds from '@/components/SendFunds';
import {
  LayoutGrid,
  ShieldCheck,
  Layers,
  FileText,
  Rocket,
  Building2,
  Coins,
  Search,
  Copy,
  LogOut,
  Archive as ArchiveIcon,
  ArrowRight,
  Wallet,
} from 'lucide-react';

// ---- RPC (read-only) ----
// Uses env when present (NEXT_PUBLIC_SEPOLIA_RPC) and falls back to public Sepolia.
const RPC_URL =
  (process.env.NEXT_PUBLIC_SEPOLIA_RPC || '').replace(/\/+$/, '') ||
  'https://rpc.ankr.com/eth_sepolia';

// --- ERC20 + Tokens (unchanged) ---
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
  { key: 'active', label: 'Active' }, // pending or approved + not fully completed
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

  // Track archiving state per-bid to disable button + show "Archiving…"
  const [archivingIds, setArchivingIds] = useState<Set<number>>(new Set());

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
    const target =
      proofs.find(p => p.status !== 'pending' && p.status !== 'archived') ??
      proofs[0];

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

  const shortAddr = useMemo(() => (address ? address.slice(0, 6) + '…' + address.slice(-4) : ''), [address]);

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
    return bid.status?.charAt(0).toUpperCase() + bid.status?.slice(1);
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
        return base.filter(
          (b) => b.status === 'pending' || (b.status === 'approved' && !isBidCompleted(b))
        );
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

    setArchivingIds(prev => new Set(prev).add(bidId));
    try {
      await archiveAnyProofForBid(bidId);  // archives a proof (vendor-safe)
      await loadBids();                    // refresh the list; don't replace a bid with a proof
    } catch (e: any) {
      alert('Failed to archive: ' + (e?.message || 'Unknown error'));
    } finally {
      setArchivingIds(prev => {
        const next = new Set(prev);
        next.delete(bidId);
        return next;
      });
    }
  };

  // ——— Metrics (pure UI) ———
  const metrics = useMemo(() => {
    const total = bids.length;
    const awarded = bids.filter((b: any) => b.status === 'approved').length;
    const active = bids.filter((b: any) => b.status === 'pending' || (b.status === 'approved' && !isBidCompleted(b))).length;
    const completed = bids.filter((b: any) => b.status === 'completed' || isBidCompleted(b)).length;
    const rejected = bids.filter((b: any) => b.status === 'rejected').length;
    const archived = bids.filter((b: any) => b.status === 'archived').length;
    const totalUsd = bids.reduce((sum: number, b: any) => sum + (Number(b.priceUSD) || 0), 0);
    return { total, awarded, active, completed, rejected, archived, totalUsd };
  }, [bids]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="animate-pulse space-y-6">
            <div className="h-24 bg-white/70 rounded-3xl shadow-sm"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="h-28 bg-white/70 rounded-3xl shadow-sm"></div>
              <div className="h-28 bg-white/70 rounded-3xl shadow-sm"></div>
              <div className="h-28 bg-white/70 rounded-3xl shadow-sm"></div>
              <div className="h-28 bg-white/70 rounded-3xl shadow-sm"></div>
            </div>
            <div className="h-96 bg-white/70 rounded-3xl shadow-sm"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Grid layout: sidebar | main | rail */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_360px] gap-6">
          {/* ——— Sidebar ——— */}
          <aside className="hidden lg:block">
            <nav className="sticky top-8 space-y-2">
              <NavItem icon={<LayoutGrid className="h-4 w-4" />} label="Dashboard" active />
              <NavItem icon={<Layers className="h-4 w-4" />} label="Bids" href="#bids" />
              <NavItem icon={<ShieldCheck className="h-4 w-4" />} label="Compliance" disabled />
              <NavItem icon={<FileText className="h-4 w-4" />} label="Documents" disabled />
              <div className="pt-4">
                <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 text-white p-4 ring-1 ring-black/5">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    <span className="text-sm/5">{shortAddr}</span>
                  </div>
                  <p className="text-xs/5 text-white/70 break-all mt-1">{address}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => navigator.clipboard.writeText(address || '')}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white/10 ring-1 ring-white/20 hover:bg-white/20"
                    >
                      <Copy className="inline h-3.5 w-3.5 mr-1" /> Copy
                    </button>
                    <button
                      onClick={handleLogout}
                      className="px-3 py-1.5 text-xs rounded-lg bg-white text-slate-900 hover:bg-slate-100"
                    >
                      <LogOut className="inline h-3.5 w-3.5 mr-1" /> Sign out
                    </button>
                  </div>
                </div>
              </div>
            </nav>
          </aside>

          {/* ——— Main content ——— */}
          <main>
            {/* Hero */}
            <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-6 text-white ring-1 ring-black/5 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Vendor Dashboard</h1>
                  <p className="mt-1 text-sm text-white/80">Welcome back. Track bids, milestones, and payouts in one place.</p>
                </div>
                <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
                  <StatCard title="Total Value" value={`$${metrics.totalUsd.toLocaleString()}`} />
                  <StatCard title="Active" value={String(metrics.active)} />
                  <StatCard title="Completed" value={String(metrics.completed)} />
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={[
                      'px-3 py-1.5 rounded-full text-sm font-medium border transition',
                      tab === t.key ? 'bg-slate-900 text-white border-slate-900 shadow' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-full md:w-96 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search bids by title, org, or notes…"
                  className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 bg-white"
                />
              </div>
            </div>

            {/* Bids table */}
            <section id="bids" className="mt-6">
              {filtered.length > 0 ? (
                <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200 bg-white">
                  <div className="hidden md:grid grid-cols-12 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50"> 
                    <div className="col-span-5">Bid</div>
                    <div className="col-span-2">Value</div>
                    <div className="col-span-3">Milestones</div>
                    <div className="col-span-2">Actions</div>
                  </div>
                  <ul className="divide-y divide-slate-200">
                    {filtered.map((bid) => {
                      const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
                      const done = ms.filter((m: any) => m.completed).length;
                      const total = ms.length;
                      const progress = total ? Math.round((done / total) * 100) : 0;
                      const canArchive = bid.status !== 'archived';
                      const isArchiving = archivingIds.has(bid.bidId);

                      return (
                        <li key={bid.bidId} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-12 md:items-center gap-4">
                            {/* Bid + org */}
                            <div className="md:col-span-5">
                              <div className="flex items-start gap-3">
                                <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center ring-1 ring-slate-200">
                                  <FileText className="h-5 w-5 text-slate-500" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">{bid.title}
                                    <StatusPill status={bid.status} label={computedStatusLabel(bid)} />
                                  </h3>
                                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                                    <span><span className="font-medium">Bid ID:</span> {bid.bidId}</span>
                                    {bid.orgName && (
                                      <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5 text-slate-400" /> {bid.orgName}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Value */}
                            <div className="md:col-span-2">
                              <div className="text-sm font-semibold text-slate-900 tabular-nums">${Number(bid.priceUSD).toLocaleString()}</div>
                              <div className="text-xs text-slate-500">{bid.preferredStablecoin}</div>
                            </div>

                            {/* Milestones */}
                            <div className="md:col-span-3">
                              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                <span>Completed</span>
                                <span className="tabular-nums">{done}/{total} · {progress}%</span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-emerald-500 to-blue-600 rounded-full transition-[width] duration-500" style={{ width: `${progress}%` }} />
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="md:col-span-2 flex flex-wrap md:justify-end gap-2">
                              <Link
                                href={`/vendor/bids/${bid.bidId}`}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                title="Open bid details and interact with Agent 2"
                              >
                                View / Agent 2 <ArrowRight className="h-3.5 w-3.5" />
                              </Link>

                              {bid.status?.toLowerCase() === 'approved' && (
                                <>
                                  <Link
                                    href={`/vendor/proof/${bid.bidId}`}
                                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                                  >
                                    Submit Proof
                                  </Link>
                                  <button
                                    onClick={() => navigator.clipboard.writeText(bid.walletAddress)}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    title="Copy recipient wallet"
                                  >
                                    <Copy className="h-3.5 w-3.5" /> Copy Wallet
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
                                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 text-amber-800 px-3 py-1.5 text-xs font-medium hover:bg-amber-50 disabled:opacity-60"
                                  title="Move this bid to Archived"
                                >
                                  <ArchiveIcon className="h-3.5 w-3.5" /> {isArchiving ? 'Archiving…' : 'Archive'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Proofs */}
                          {bid.proofs?.length > 0 && (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                              <h4 className="text-xs font-semibold text-slate-900 mb-2 flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-slate-400" /> Submitted Proofs</h4>
                              <div className="grid gap-2">
                                {bid.proofs.map((p: any, i: number) => (
                                  <div key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-sm text-slate-800 whitespace-pre-line">{p.description || 'No description'}</p>
                                    {p.files?.length > 0 && (
                                      <ul className="mt-2 space-y-1">
                                        {p.files.map((f: any, j: number) => (
                                          <li key={j} className="text-sm">
                                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline underline-offset-2">{f.name}</a>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                    <span className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : p.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>{p.status || 'pending'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="bg-white rounded-3xl shadow-sm ring-1 ring-slate-200 p-12 text-center">
                  <div className="text-5xl mb-4">🗂️</div>
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">No bids in this view</h2>
                  <p className="text-slate-600 mb-6">Try a different tab or clear your search.</p>
                  <Link href="/projects" className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
                    <Rocket className="h-4 w-4" /> Browse Projects
                  </Link>
                </div>
              )}
            </section>
          </main>

          {/* ——— Right rail ——— */}
          <aside className="space-y-6">
            {/* Quick Account */}
            <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6">
              <div className="flex items-center gap-2 text-slate-900 font-semibold mb-2">
                <Wallet className="h-5 w-5 text-slate-500" /> Account
              </div>
              <p className="text-xs text-slate-500 break-all">{address}</p>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <BalanceCard label="ETH" value={balances.ETH} />
                <BalanceCard label="USDT" value={balances.USDT} />
                <BalanceCard label="USDC" value={balances.USDC} />
              </div>
            </div>

            {/* Send Funds */}
            <div className="rounded-3xl bg-white ring-1 ring-slate-200 p-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2"><Rocket className="h-4 w-4" /> Send Funds</h2>
              </div>
              <SendFunds />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Presentation bits ---------------- */

function NavItem({ icon, label, href, active, disabled }: { icon: React.ReactNode; label: string; href?: string; active?: boolean; disabled?: boolean }) {
  const className = [
    'w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium',
    active ? 'bg-slate-900 text-white shadow' : 'text-slate-700 hover:bg-slate-100',
    disabled ? 'opacity-50 pointer-events-none' : '',
  ].join(' ');
  if (href) return <Link href={href} className={className}>{icon}{label}</Link>;
  return <button className={className} type="button">{icon}{label}</button>;
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-white/70">{title}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function BalanceCard({ label, value }: { label: string; value?: string }) {
  const display = value ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—';
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label} Balance</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{display}</div>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const cls =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-800'
      : status === 'completed'
      ? 'bg-blue-100 text-blue-800'
      : status === 'rejected'
      ? 'bg-rose-100 text-rose-800'
      : status === 'archived'
      ? 'bg-slate-200 text-slate-700'
      : 'bg-amber-100 text-amber-800';
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function InfoTile({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-base font-semibold text-slate-900 ${accent || ''}`}>{value}</p>
      {helper && <p className="mt-0.5 text-xs text-slate-500 break-all">{helper}</p>}
    </div>
  );
}
