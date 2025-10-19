// src/app/vendor/dashboard/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ethers } from 'ethers';
import { getBids, getProofs, archiveProof } from '@/lib/api';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import SendFunds from '@/components/SendFunds';

// ✨ UI-only additions (no functional changes)
import { motion } from 'framer-motion';
import {
  Copy,
  LogOut,
  WalletMinimal,
  Search as SearchIcon,
  Building2,
  Layers,
  Archive,
  FileText,
  Rocket
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
  { key: 'active', label: 'Active' },      // pending or approved + not fully completed
  { key: 'awarded', label: 'Awarded' },    // approved
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <div className="animate-pulse space-y-6">
            <div className="h-24 bg-white/70 rounded-2xl shadow-sm"></div>
            <div className="h-20 bg-white/70 rounded-2xl shadow-sm"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-48 bg-white/70 rounded-2xl shadow-sm"></div>
              <div className="h-48 bg-white/70 rounded-2xl shadow-sm"></div>
            </div>
            <div className="h-64 bg-white/70 rounded-2xl shadow-sm"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(1000px_500px_at_50%_-100px,rgba(59,130,246,0.10),transparent)]" />

      <div className="max-w-6xl mx-auto px-6 py-10">
        {/* ===== Hero / Top Bar ===== */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/80 backdrop-blur rounded-2xl shadow-sm ring-1 ring-slate-200 p-6 mb-8"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <WalletMinimal className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
                  Vendor Dashboard
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Signed in as{' '}
                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
                    {shortAddr}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500 break-all">Wallet: {address}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(address || '')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition"
              >
                <Copy className="h-4 w-4" />
                <span>Copy Address</span>
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-950 active:scale-[.99] transition"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Balances */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <BalanceCard label="ETH" value={balances.ETH} />
            <BalanceCard label="USDT" value={balances.USDT} />
            <BalanceCard label="USDC" value={balances.USDC} />
          </div>
        </motion.div>

        {/* ===== Quick Actions (Send Funds) ===== */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white/80 backdrop-blur rounded-2xl shadow-sm ring-1 ring-slate-200 p-6 mb-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <Rocket className="h-4 w-4 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-900">Send Funds</h2>
          </div>
          <SendFunds />
        </motion.div>

        {/* ===== Controls: Tabs + Search ===== */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="sticky top-4 z-10 mb-6"
        >
          <div className="bg-white/90 backdrop-blur rounded-2xl ring-1 ring-slate-200 p-3">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={[
                      'px-3 py-1.5 rounded-full text-sm font-medium border transition',
                      tab === t.key
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-full md:w-80">
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search bids…"
                    className="w-full rounded-xl border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ===== Bid list (cards grid) ===== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((bid) => {
            const ms = Array.isArray(bid.milestones) ? bid.milestones : [];
            const done = ms.filter((m: any) => m.completed).length;
            const total = ms.length;
            const progress = total ? Math.round((done / total) * 100) : 0;

            // ✅ allow archive if not already archived
            const canArchive = bid.status !== 'archived';
            const isArchiving = archivingIds.has(bid.bidId);

            return (
              <motion.div
                key={bid.bidId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6"
              >
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-slate-900">{bid.title}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Layers className="h-4 w-4" />
                        <span className="font-medium">Bid ID:</span> {bid.bidId}
                      </span>
                      {bid.orgName && (
                        <span className="inline-flex items-center gap-1 text-slate-600">
                          <Building2 className="h-4 w-4" />
                          <span className="font-medium">Organization:</span> {bid.orgName}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusPill status={bid.status} label={computedStatusLabel(bid)} />
                </div>

                {/* Progress */}
                <div className="mb-5">
                  <div className="flex items-end justify-between mb-1">
                    <p className="text-sm text-slate-600">
                      Milestones: <span className="font-medium text-slate-900">{done}</span> / {total}
                    </p>
                    <p className="text-sm tabular-nums text-slate-600">{progress}%</p>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-blue-600 rounded-full transition-[width] duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-3 mb-5">
                  {/* NEW: open the vendor bid detail page with Agent 2 panel */}
                  <Link
                    href={`/vendor/bids/${bid.bidId}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition"
                    title="Open bid details and interact with Agent 2"
                  >
                    <FileText className="h-4 w-4" />
                    View / Agent 2
                  </Link>

                  {bid.status?.toLowerCase() === 'approved' && (
                    <>
                      <Link
                        href={`/vendor/proof/${bid.bidId}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 active:scale-[.99] transition"
                      >
                        <Rocket className="h-4 w-4" />
                        Submit Proof
                      </Link>
                      <button
                        onClick={() => navigator.clipboard.writeText(bid.walletAddress)}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition"
                        title="Copy vendor wallet address"
                      >
                        <Copy className="h-4 w-4" />
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
                        onArchive(bid.bidId); // Fixed: changed 'b.bidId' to 'bid.bidId'
                      }}
                      disabled={isArchiving}
                      className={[
                        'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition',
                        'border-amber-200 text-amber-800 hover:bg-amber-50 disabled:opacity-60 disabled:cursor-not-allowed',
                      ].join(' ')}
                      title="Move this bid to Archived"
                    >
                      <Archive className="h-4 w-4" />
                      {isArchiving ? 'Archiving…' : 'Move to Archived'}
                    </button>
                  )}
                </div>

                {/* Quick facts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoTile label="Your Bid" value={`$${Number(bid.priceUSD).toLocaleString()}`} accent="text-emerald-600" />
                  <InfoTile label="Timeline" value={`${bid.days} days`} />
                  <InfoTile label="Payment" value={`${bid.preferredStablecoin}`} helper={`to ${bid.walletAddress}`} />
                  <InfoTile label="Status" value={computedStatusLabel(bid)} />
                </div>

                {/* Submitted proofs */}
                {bid.proofs?.length > 0 && (
                  <div className="mt-6 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Submitted Proofs</h3>
                    <div className="grid gap-3">
                      {bid.proofs.map((p: any, i: number) => (
                        <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm text-slate-800 whitespace-pre-line">{p.description || 'No description'}</p>
                          {p.files?.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {p.files.map((f: any, j: number) => (
                                <li key={j} className="text-sm">
                                  <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline underline-offset-2"
                                  >
                                    {f.name}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                          <span
                            className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium
                              ${p.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.status === 'rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'}`}
                          >
                            {p.status || 'pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}

          {filtered.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-10 text-center col-span-full"
            >
              <div className="text-5xl mb-4">🗂️</div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">No bids in this view</h2>
              <p className="text-slate-600 mb-6">Try a different tab or clear your search.</p>
              <Link
                href="/projects"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 active:scale-[.99] transition"
              >
                Browse Projects
              </Link>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Presentation bits ---------------- */

function BalanceCard({ label, value }: { label: string; value?: string }) {
  const display = value ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—';
  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4">
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
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${cls}`}>{label}</span>;
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
