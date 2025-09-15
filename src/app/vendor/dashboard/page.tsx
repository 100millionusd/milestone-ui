'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBids } from '@/lib/api';
import { useWeb3Auth } from '@/providers/Web3AuthProvider';
import { ethers } from 'ethers';
import SendFunds from '@/components/SendFunds';

// ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Sepolia token addresses
const TOKENS: Record<string, string> = {
  USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

type Tab = 'pending' | 'approved' | 'rejected' | 'completed' | 'history';

export default function VendorDashboard() {
  const [bids, setBids] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<{ ETH?: string; USDT?: string; USDC?: string }>({});
  const [activeTab, setActiveTab] = useState<Tab>('pending');

  const { address, logout, provider } = useWeb3Auth();
  const router = useRouter();

  useEffect(() => {
    if (!address) {
      router.push('/vendor/login');
      return;
    }
    loadBids();
    loadBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const loadBids = async () => {
    try {
      const allBids = await getBids();
      const vendorBids = allBids
        .filter((bid: any) => bid.walletAddress?.toLowerCase() === address?.toLowerCase())
        .map((bid: any) => ({
          ...bid,
          proofs: bid.proofs || []
        }));

      setBids(vendorBids);
    } catch (error) {
      console.error('Error loading bids:', error);
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
        ethersProvider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth_sepolia');
      }

      // ETH balance
      const rawBalance = await ethersProvider.getBalance(address);
      const ethBal = ethers.formatEther(rawBalance);

      // ERC20 balances
      const results: any = { ETH: ethBal };
      for (const [symbol, tokenAddr] of Object.entries(TOKENS)) {
        try {
          const contract = new ethers.Contract(tokenAddr, ERC20_ABI, ethersProvider);
          const [raw, decimals] = await Promise.all([
            contract.balanceOf(address),
            contract.decimals()
          ]);
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

  const getBidStatusReadable = (bid: any) => {
    if (bid.status === 'completed') return 'Completed';
    if (bid.status === 'approved') {
      const completed = (bid.milestones || []).filter((m: any) => m.completed).length;
      const total = (bid.milestones || []).length;
      return `In Progress (${completed}/${total} milestones)`;
    }
    return String(bid.status || '').charAt(0).toUpperCase() + String(bid.status || '').slice(1);
  };

  const shortAddr = useMemo(() => {
    if (!address) return '';
    return address.slice(0, 6) + '…' + address.slice(-4);
  }, [address]);

  const counts = useMemo(() => {
    const pending = bids.filter(b => b.status === 'pending').length;
    const approved = bids.filter(b => b.status === 'approved').length;
    const rejected = bids.filter(b => b.status === 'rejected').length;
    const completed = bids.filter(b => b.status === 'completed').length;
    const history = rejected + completed;
    return { pending, approved, rejected, completed, history, total: bids.length };
  }, [bids]);

  const filteredBids = useMemo(() => {
    if (activeTab === 'history') {
      // Rejected + Completed, most recent first
      return [...bids]
        .filter(b => b.status === 'rejected' || b.status === 'completed')
        .sort((a, b) => {
          const da = Date.parse(a.createdAt || a.updatedAt || a.date || 0);
          const db = Date.parse(b.createdAt || b.updatedAt || b.date || 0);
          return db - da;
        });
    }
    return bids.filter(b => b.status === activeTab);
  }, [bids, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="max-w-5xl mx-auto px-4 py-16">
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Top Bar Card */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
                Vendor Dashboard
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Signed in as <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{shortAddr}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500 break-all">Wallet: {address}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigator.clipboard.writeText(address || '')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition"
              >
                <span>Copy Address</span>
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-900 active:scale-[.99] transition"
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* Balances */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <BalanceCard label="ETH" value={balances.ETH} />
            <BalanceCard label="USDT" value={balances.USDT} />
            <BalanceCard label="USDC" value={balances.USDC} />
          </div>
        </div>

        {/* Send Funds UI (unchanged functionality) */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Send Funds</h2>
          <SendFunds />
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-4 mb-6">
          <div className="flex flex-wrap gap-4 border-b">
            {([
              { key: 'pending', label: 'Pending', count: counts.pending },
              { key: 'approved', label: 'Approved', count: counts.approved },
              { key: 'rejected', label: 'Rejected', count: counts.rejected },
              { key: 'completed', label: 'Completed', count: counts.completed },
              { key: 'history', label: 'History', count: counts.history },
            ] as { key: Tab; label: string; count: number }[]).map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`pb-2 px-3 text-sm font-medium border-b-2 -mb-[1px] ${
                  activeTab === t.key
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t.label}
                <span className="ml-1 text-xs text-slate-400">({t.count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Filtered Bid List */}
        <div className="space-y-6">
          {filteredBids.map((bid) => {
            const milestones = Array.isArray(bid.milestones) ? bid.milestones : [];
            const completed = milestones.filter((m: any) => m.completed).length;
            const total = milestones.length;
            const progress = total ? Math.round((completed / total) * 100) : 0;

            const projectTitle =
              bid.title || bid.proposalTitle || `Proposal #${bid.proposalId}`;
            const orgName = bid.orgName || bid.organization || '—';

            return (
              <div key={bid.bidId} className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
                  <div className="space-y-1">
                    <h2 className="text-xl font-semibold text-slate-900">{projectTitle}</h2>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-slate-600">
                        <span className="font-medium">Bid ID:</span> {bid.bidId}
                      </span>
                      <span className="text-slate-600">
                        <span className="font-medium">Organization:</span> {orgName}
                      </span>
                    </div>
                  </div>
                  <StatusPill status={bid.status} label={getBidStatusReadable(bid)} />
                </div>

                {/* Progress */}
                <div className="mb-5">
                  <div className="flex items-end justify-between mb-1">
                    <p className="text-sm text-slate-600">
                      Milestones: <span className="font-medium text-slate-900">{completed}</span> / {total}
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

                {/* Actions when approved */}
                {String(bid.status || '').toLowerCase() === 'approved' && (
                  <div className="flex flex-wrap gap-3 mb-5">
                    <Link
                      href={`/vendor/proof/${bid.bidId}`}
                      className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 active:scale-[.99] transition"
                    >
                      Submit Proof
                    </Link>
                    <button
                      onClick={() => navigator.clipboard.writeText(bid.walletAddress)}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition"
                    >
                      Copy Wallet Address
                    </button>
                  </div>
                )}

                {/* Quick facts */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
                  <InfoTile label="Your Bid" value={`$${Number(bid.priceUSD).toLocaleString()}`} accent="text-emerald-600" />
                  <InfoTile label="Timeline" value={`${bid.days} days`} />
                  <InfoTile
                    label="Payment"
                    value={`${bid.preferredStablecoin}`}
                    helper={`to ${bid.walletAddress}`}
                  />
                  <InfoTile
                    label="Status"
                    value={getBidStatusReadable(bid)}
                  />
                </div>

                {/* Submitted proofs */}
                {Array.isArray(bid.proofs) && bid.proofs.length > 0 && (
                  <div className="mt-6 border-t border-slate-200 pt-4">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">Submitted Proofs</h3>
                    <div className="grid gap-3">
                      {bid.proofs.map((proof: any, idx: number) => (
                        <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <p className="text-sm text-slate-800 whitespace-pre-line">
                            {proof.description || 'No description'}
                          </p>
                          {proof.files?.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {proof.files.map((f: any, i: number) => (
                                <li key={i} className="text-sm">
                                  <a
                                    href={f.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
                                  >
                                    {f.name}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                          <span
                            className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium
                              ${proof.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : proof.status === 'rejected'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'}`}
                          >
                            {proof.status || 'pending'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {filteredBids.length === 0 && (
            <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200 p-10 text-center">
              <div className="text-5xl mb-4">💼</div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">
                {activeTab === 'history' ? 'No History Yet' : `No ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Bids`}
              </h2>
              <p className="text-slate-600 mb-6">
                {activeTab === 'history'
                  ? 'You do not have any rejected or completed bids yet.'
                  : `You don’t have any ${activeTab} bids right now.`}
              </p>
              <Link
                href="/projects"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 active:scale-[.99] transition"
              >
                Browse Projects
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------- Presentational subcomponents (purely visual) ------- */

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
      : 'bg-amber-100 text-amber-800';
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${cls}`}>
      {label}
    </span>
  );
}

function InfoTile({
  label,
  value,
  helper,
  accent
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
