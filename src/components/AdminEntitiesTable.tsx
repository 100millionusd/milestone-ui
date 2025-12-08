// src/components/AdminEntitiesTable.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  listProposals, // Keep this for fallback logic
  type Proposal,
  adminArchiveEntity as archiveEntity,
  adminUnarchiveEntity as unarchiveEntity,
  adminDeleteEntity as deleteEntity,
  listProposers,
} from '@/lib/api';

/* ---------- Configuration ---------- */
// ⚠️ Direct API URL to bypass filtering/mapping issues in the library function
const API_BASE = "https://milestone-api-production.up.railway.app";

/* ---------- Types ---------- */

export type ProposerAgg = {
  id?: number | string | null;
  entity: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  contactEmail: string | null;
  ownerEmail: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  telegramUsername?: string | null;
  telegramChatId?: string | null;
  telegramConnected?: boolean;
  wallet: string | null;
  proposalsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  archivedCount?: number;
  totalBudgetUSD: number;
  lastActivity: string | null;
  archived?: boolean;
  ownerPhone?: string | null;
  ownerTelegramUsername?: string | null;
  ownerTelegramChatId?: string | null;
};

type SortKey =
  | 'entity'
  | 'proposalsCount'
  | 'approvedCount'
  | 'pendingCount'
  | 'rejectedCount'
  | 'totalBudgetUSD'
  | 'lastActivity';

type Props = { initial?: ProposerAgg[] };

/* ---------- Helpers ---------- */

const pickNonEmpty = (...vals: any[]) => {
  for (const v of vals) {
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return null;
};

const guessEmail = (obj: any): string | null => {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of Object.keys(obj)) {
    if (!/email|contact/i.test(k)) continue;
    const v = (obj as any)[k];
    if (typeof v === 'string') {
      const s = v.trim();
      if (s && s.includes('@')) return s;
    }
  }
  return null;
};

function addressToDisplay(addr: any): string | null {
  if (!addr) return null;
  if (typeof addr === 'string') {
    let str = addr.trim();
    if (!str) return null;
    const jsonRegex = /\{.*?\}/g;
    const cleaned = str.replace(jsonRegex, (match) => {
      try {
        const parsed = JSON.parse(match);
        const fmt = addressToDisplay(parsed);
        return fmt || '';
      } catch {
        return match;
      }
    });
    return cleaned.replace(/,\s*,/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '').trim();
  }
  if (typeof addr === 'object') {
    const pickLoose = (obj: any, exact: string[], loose: RegExp[]) => {
      for (const k of exact) {
        const v = obj?.[k];
        if (v !== undefined && v !== null) {
          const sv = String(v).trim();
          if (sv) return sv;
        }
      }
      const keys = Object.keys(obj || {});
      for (const rx of loose) {
        const hit = keys.find((k) => rx.test(k));
        if (hit) {
          const v = obj[hit];
          if (v !== undefined && v !== null) {
            const sv = String(v).trim();
            if (sv) return sv;
          }
        }
      }
      return null;
    };
    const line1 = pickLoose(addr, ['line1', 'address1', 'address_line1'], [/line.?1/i, /address/i]);
    const city = pickLoose(addr, ['city', 'town'], [/city|town/i]);
    const state = pickLoose(addr, ['state', 'province', 'region'], [/state|prov|region/i]);
    const postal = pickLoose(addr, ['postalCode', 'postal_code', 'zip', 'zipCode'], [/post|zip/i]);
    const country = pickLoose(addr, ['country'], [/country/i]);
    const parts = [line1, city, state, postal, country].filter(Boolean) as string[];
    return parts.join(', ').replace(/\s+,/g, ',').replace(/,\s+,/g, ',').trim() || null;
  }
  try { return String(addr).trim(); } catch { return null; }
}

function normalizeRow(r: any): ProposerAgg {
  const contactEmail = pickNonEmpty(r.email, r.primaryEmail, r.primary_email, r.contactEmail, r.contact_email, r.ownerEmail, r.owner_email, r.contact);
  const ownerEmail = pickNonEmpty(r.ownerEmail, r.owner_email);
  const email = contactEmail || ownerEmail || guessEmail(r) || null;

  const ownerPhone = pickNonEmpty(r.ownerPhone, r.owner_phone, r.profile?.ownerPhone, r.profile?.owner_phone);
  const phone = pickNonEmpty(r.phone, r.whatsapp, r.profile?.phone, r.profile?.whatsapp, ownerPhone);

  const ownerTelegramUsername = pickNonEmpty(r.ownerTelegramUsername, r.owner_telegram_username, r.profile?.ownerTelegramUsername, r.profile?.owner_telegram_username);
  const ownerTelegramChatId = pickNonEmpty(r.ownerTelegramChatId, r.owner_telegram_chat_id, r.profile?.ownerTelegramChatId, r.profile?.owner_telegram_chat_id);
  const telegramUsername = pickNonEmpty(r.telegramUsername, r.telegram_username, ownerTelegramUsername, r.profile?.telegramUsername, r.profile?.telegram_username);
  const telegramChatId = pickNonEmpty(r.telegramChatId, r.telegram_chat_id, ownerTelegramChatId, r.profile?.telegramChatId, r.profile?.telegram_chat_id);
  const telegramConnected = !!(r.telegramConnected ?? r.profile?.telegramConnected ?? r.profile?.telegram?.connected ?? r.profile?.social?.telegram?.connected ?? r.profile?.connections?.telegram?.connected);

  const sc = r.statusCounts || r.status_counts || {};

  // AGGRESSIVE MAPPING: Check every possible key variation for the count
  const approvedCount = Number(r.approvedCount ?? r.approved_count ?? sc.approved ?? r.proposals?.approved ?? 0);
  const pendingCount = Number(r.pendingCount ?? r.pending_count ?? sc.pending ?? r.proposals?.pending ?? 0);
  const rejectedCount = Number(r.rejectedCount ?? r.rejected_count ?? sc.rejected ?? r.proposals?.rejected ?? 0);
  const archivedCount = Number(r.archivedCount ?? r.archived_count ?? sc.archived ?? r.proposals?.archived ?? 0);

  const proposalsCount = Number(r.proposalsCount ?? r.proposals_count ?? sc.total ?? (approvedCount + pendingCount + rejectedCount + archivedCount));

  const rawAddr = r.addr_display ?? r.addressText ?? r.address_text ?? r.address ?? r.profile?.address ?? r.profile?.addressText ?? r.profile?.address_text ?? null;
  const addrDisplay = addressToDisplay(rawAddr);

  let city = pickNonEmpty(r.city, r.town);
  let country = pickNonEmpty(r.country);
  if (!city || !country) {
    if (rawAddr && typeof rawAddr === 'object') {
      city = city || pickNonEmpty(rawAddr.city, rawAddr.town);
      country = country || pickNonEmpty(rawAddr.country);
    }
  }

  return {
    id: r.id ?? r.entityId ?? r.proposerId ?? null,
    entity: pickNonEmpty(r.entityName, r.entity_name, r.orgName, r.entity, r.organization) || null,
    address: addrDisplay,
    city: city || null,
    country: country || null,
    email,
    contactEmail,
    ownerEmail,
    phone,
    whatsapp: phone,
    telegramUsername,
    telegramChatId,
    ownerTelegramUsername,
    ownerTelegramChatId,
    telegramConnected,
    wallet: r.wallet ?? r.walletAddress ?? r.wallet_address ?? r.ownerWallet ?? r.owner_wallet ?? null,
    proposalsCount,
    approvedCount,
    pendingCount,
    rejectedCount,
    archivedCount,
    totalBudgetUSD: Number(r.totalBudgetUSD ?? r.total_budget_usd ?? r.amountUSD ?? r.amount_usd ?? 0),
    lastActivity: r.lastActivityAt ?? r.last_activity_at ?? r.lastProposalAt ?? r.updatedAt ?? r.updated_at ?? r.createdAt ?? r.created_at ?? null,
    archived: !!r.archived,
  };
}

function aggregateFromProposals(props: Proposal[]): ProposerAgg[] {
  const byKey = new Map<string, ProposerAgg>();
  for (const p of props) {
    const org = (p.orgName || 'Unknown Org').trim();
    const key = `${org}|${p.contact || ''}|${p.ownerWallet || ''}`;
    const existing = byKey.get(key);
    const row: ProposerAgg = existing || {
      id: null,
      entity: org || null,
      address: addressToDisplay(p.address) || null,
      city: p.city || null,
      country: p.country || null,
      contactEmail: p.contact || p.ownerEmail || null,
      ownerEmail: p.ownerEmail || null,
      wallet: p.ownerWallet || null,
      proposalsCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      archivedCount: 0,
      totalBudgetUSD: 0,
      lastActivity: null,
      archived: false,
    };

    row.proposalsCount += 1;
    row.totalBudgetUSD += Number(p.amountUSD) || 0;
    const st = (p.status || 'pending').toLowerCase().trim();
    if (['approved', 'funded', 'completed'].includes(st)) {
      row.approvedCount += 1;
    } else if (st === 'rejected') {
      row.rejectedCount += 1;
    } else if (st === 'archived') {
      row.archivedCount = (row.archivedCount || 0) + 1;
    } else {
      row.pendingCount += 1;
    }

    const prev = row.lastActivity ? new Date(row.lastActivity).getTime() : 0;
    const cand = new Date(p.updatedAt || p.createdAt).getTime();
    if (cand > prev) row.lastActivity = p.updatedAt || p.createdAt;
    const active = row.approvedCount + row.pendingCount + row.rejectedCount;
    row.archived = !!(row.archived || ((row.archivedCount || 0) > 0 && active === 0));
    byKey.set(key, row);
  }
  return Array.from(byKey.values());
}

function fmtMoney(n: number) {
  return `$${Number(n || 0).toLocaleString()}`;
}

function keyOf(r: ProposerAgg) {
  return `${r.id ?? ''}|${r.entity ?? ''}|${r.contactEmail ?? ''}|${r.wallet ?? ''}`;
}

function toMailto(email: string, subject?: string) {
  const s = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${email}${s}`;
}
function onlyDigits(s?: string | null) {
  if (!s) return null;
  const d = String(s).replace(/[^\d]/g, '');
  return d || null;
}
function toWhatsAppLink(phone?: string | null, text?: string) {
  const d = onlyDigits(phone);
  if (!d) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${d}${q}`;
}
function toTelegramLink(username?: string | null, chatId?: string | null) {
  if (username) return `https://t.me/${String(username).replace(/^@/, '')}`;
  if (chatId) return `tg://user?id=${String(chatId)}`;
  return null;
}

interface EntitySelector {
  id?: number | string | null;
  entity?: string | null;
  contactEmail?: string | null;
  wallet?: string | null;
}

/* ---------- Component ---------- */

export default function AdminEntitiesTable({ initial = [] }: Props) {
  const [rows, setRows] = useState<ProposerAgg[]>(initial);
  const [loading, setLoading] = useState(initial.length === 0);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('entity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const pageSize = 10;

  // per-row busy state
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // INITIAL LOAD
  useEffect(() => {
    if (initial.length) {
      setRows(initial);
      setLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // ✅ 1. Use Direct Fetch with Credentials to bypass any filtering in lib/api
        // This ensures we get the RAW data where approved_count = 1
        const url = `${API_BASE}/admin/entities?includeArchived=${showArchived}`;
        const res = await fetch(url, {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });

        let data: ProposerAgg[] = [];

        if (res.ok) {
          const resp = await res.json();
          // ✅ 2. Unpack response correctly
          const rawItems = resp?.items || resp;
          const arr: any[] = Array.isArray(rawItems) ? rawItems : [];
          // ✅ 3. Map using the normalized function
          data = arr.map(normalizeRow);
        }

        // Fallback if fetch fails or returns empty
        if (!data.length) {
          const proposals = await listProposals({ includeArchived: showArchived });
          data = aggregateFromProposals(proposals);
        }

        if (alive) setRows(data);
      } catch (e: any) {
        console.error(e);
        if (alive) setError(e?.message || 'Failed to load entities');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [initial.length, showArchived]);

  // Search + archived filter
  const filtered = useMemo(() => {
    const base = showArchived ? rows : rows.filter((r) => !r.archived);
    const n = q.trim().toLowerCase();
    if (!n) return base;
    return base.filter((r) => {
      const hay = [
        r.entity, r.address, r.city, r.country, (r as any).email, r.contactEmail, r.ownerEmail, r.wallet,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(n);
    });
  }, [rows, q, showArchived]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'entity') {
        const av = (a.entity || '').toLowerCase();
        const bv = (b.entity || '').toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      if (sortKey === 'lastActivity') {
        const av = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
        const bv = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
        return av === bv ? 0 : av < bv ? -1 * dir : 1 * dir;
      }
      const numA = Number((a as any)[sortKey] || 0);
      const numB = Number((b as any)[sortKey] || 0);
      return numA === numB ? 0 : numA < numB ? -1 * dir : 1 * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  function proposalsHref(r: ProposerAgg) {
    const sp = new URLSearchParams();
    if (r.entity) sp.set('org', r.entity);
    if (r.contactEmail) sp.set('contactEmail', r.contactEmail);
    if (r.ownerEmail) sp.set('ownerEmail', r.ownerEmail);
    if (r.wallet) sp.set('wallet', r.wallet);
    return `/admin/proposals?${sp.toString()}`;
  }

  function toIdOrKey(r: ProposerAgg): EntitySelector {
    if (r.id != null) return { id: r.id };
    return {
      entity: r.entity ?? null,
      contactEmail: r.contactEmail ?? null,
      wallet: r.wallet ?? null,
    };
  }

  async function onArchive(r: ProposerAgg, nextArchived: boolean) {
    const k = keyOf(r);
    setBusy((b) => ({ ...b, [k]: true }));
    const payload = toIdOrKey(r);
    setRows((prev) => prev.map((x) => (keyOf(x) === k ? { ...x, archived: nextArchived } : x)));
    try {
      if (nextArchived) await archiveEntity(payload);
      else await unarchiveEntity(payload);
    } catch (e: any) {
      setRows((prev) => prev.map((x) => (keyOf(x) === k ? { ...x, archived: !nextArchived } : x)));
      alert(e?.message || 'Failed to update archive state');
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  }

  async function onDelete(r: ProposerAgg) {
    if (!confirm(`Delete "${r.entity || '—'}"? This cannot be undone.`)) return;
    const k = keyOf(r);
    setBusy((b) => ({ ...b, [k]: true }));
    const payload = toIdOrKey(r);
    const prev = rows;
    setRows((p) => p.filter((x) => keyOf(x) !== k));
    try {
      await deleteEntity(payload, 'hard');
    } catch (e: any) {
      setRows(prev);
      alert(e?.message || 'Failed to delete entity');
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  }

  // UI

  // Stats Calculation
  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter(r => !r.archived).length;
    const totalBudget = rows.reduce((acc, r) => acc + r.totalBudgetUSD, 0);
    const totalProposals = rows.reduce((acc, r) => acc + r.proposalsCount, 0);
    return { total, active, totalBudget, totalProposals };
  }, [rows]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50/50 p-8 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-slate-500 font-medium">Loading entities...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50/50 p-8 flex items-center justify-center">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-rose-100 max-w-md text-center">
        <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Failed to load entities</h3>
        <p className="text-slate-600 mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-medium">
          Retry
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Header & Stats */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-6">Entities Overview</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500 mb-1">Total Entities</p>
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500 mb-1">Active Entities</p>
              <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500 mb-1">Total Budget Managed</p>
              <p className="text-2xl font-bold text-slate-900">{fmtMoney(stats.totalBudget)}</p>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-sm font-medium text-slate-500 mb-1">Total Proposals</p>
              <p className="text-2xl font-bold text-blue-600">{stats.totalProposals}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white p-4 rounded-t-xl border border-slate-200 border-b-0 shadow-sm flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
          <div className="w-full lg:w-96 relative group">
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search entity, email, wallet..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all text-slate-800 placeholder-slate-400 bg-slate-50 focus:bg-white"
            />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors pointer-events-none">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                checked={showArchived}
                onChange={(e) => { setShowArchived(e.target.checked); setPage(1); }}
              />
              Show archived
            </label>

            <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="bg-transparent border-none text-sm text-slate-700 py-2 pl-3 pr-8 focus:ring-0 font-medium cursor-pointer focus:outline-none"
              >
                <option value="entity">Sort: Name</option>
                <option value="proposalsCount">Sort: Proposals</option>
                <option value="approvedCount">Sort: Approved</option>
                <option value="totalBudgetUSD">Sort: Budget</option>
                <option value="lastActivity">Sort: Last Activity</option>
              </select>
              <button
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="p-2 hover:bg-white rounded-md shadow-sm transition-all text-slate-500 hover:text-cyan-600"
                title="Toggle sort direction"
              >
                {sortDir === 'asc' ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h5m4 0l4 4m0 0l4-4m-4 4V3" /></svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px] backdrop-blur-sm sticky top-0 z-10">
                <tr>
                  <Th className="w-[20%] pl-6">Entity</Th>
                  <Th className="w-[15%]">Contact</Th>
                  <Th className="w-[12%]">Wallet</Th>
                  <Th className="text-right w-[6%]">Props</Th>
                  <Th className="text-right w-[6%]">Appr</Th>
                  <Th className="text-right w-[6%]">Pend</Th>
                  <Th className="text-right w-[6%]">Rej</Th>
                  <Th className="text-right w-[10%]">Budget</Th>
                  <Th className="w-[10%]">Activity</Th>
                  <Th className="text-right w-auto pr-6">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r, i) => {
                  const k = keyOf(r);
                  const isBusy = !!busy[k];
                  const email = r.email ?? r.contactEmail ?? r.ownerEmail ?? guessEmail(r as any) ?? null;
                  const initial = (r.entity || '?').charAt(0).toUpperCase();

                  return (
                    <tr key={`${r.wallet || r.contactEmail || r.entity || ''}-${i}`} className={`group hover:bg-slate-50/80 transition-colors ${r.archived ? 'bg-slate-50/50 grayscale-[0.5]' : ''}`}>
                      <Td className="pl-6">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm shrink-0 ${r.archived ? 'bg-slate-200 text-slate-500' : 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white'}`}>
                            {initial}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-[15px]">{r.entity || '—'}</span>
                              {r.archived && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase tracking-wide border border-slate-300">
                                  Archived
                                </span>
                              )}
                            </div>
                            {(r.city || r.country) && (
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                {[r.city, r.country].filter(Boolean).join(', ')}
                              </div>
                            )}
                            {r.address && <div className="text-xs text-slate-500 break-words leading-relaxed max-w-[200px] mt-0.5">{r.address}</div>}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex flex-col gap-2 items-start">
                          {email && (
                            <a href={toMailto(email, 'Proposal contact')} className="inline-flex items-center gap-2 text-slate-700 hover:text-cyan-600 transition-colors text-xs group/link font-medium bg-slate-50 px-2 py-1 rounded border border-slate-200 hover:border-cyan-200 hover:bg-cyan-50" title={email}>
                              <svg className="w-3.5 h-3.5 text-slate-400 group-hover/link:text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              <span className="truncate max-w-[140px]">{email}</span>
                            </a>
                          )}
                          <div className="flex gap-2">
                            {(r.telegramUsername || r.telegramChatId || r.ownerTelegramUsername || r.ownerTelegramChatId) && (
                              <a href={toTelegramLink(r.telegramUsername ?? r.ownerTelegramUsername ?? null, r.telegramChatId ?? r.ownerTelegramChatId ?? null) || '#'} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sky-50 text-sky-600 hover:bg-sky-100 hover:scale-105 transition-all border border-sky-100" target="_blank" rel="noreferrer" title="Telegram">
                                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.361 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.781-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" /></svg>
                              </a>
                            )}
                            {(r.ownerPhone || r.whatsapp || r.phone) && (
                              <a href={toWhatsAppLink(r.ownerPhone ?? r.whatsapp ?? r.phone) || '#'} className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-50 text-green-600 hover:bg-green-100 hover:scale-105 transition-all border border-green-100" target="_blank" rel="noreferrer" title="WhatsApp">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.466c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                              </a>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2 group/wallet">
                          <div className="font-mono text-[11px] text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200 truncate max-w-[120px] group-hover/wallet:max-w-none group-hover/wallet:bg-white group-hover/wallet:absolute group-hover/wallet:z-20 group-hover/wallet:shadow-lg group-hover/wallet:border-slate-300 transition-all cursor-default" title={r.wallet || ''}>
                            {r.wallet || '—'}
                          </div>
                          {r.wallet && (
                            <button onClick={() => navigator.clipboard.writeText(r.wallet!)} className="text-slate-400 hover:text-cyan-600 transition-colors opacity-0 group-hover/wallet:opacity-100" title="Copy wallet">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </button>
                          )}
                        </div>
                      </Td>
                      <Td className="text-right text-slate-900 tabular-nums font-medium">{r.proposalsCount || <span className="text-slate-300">-</span>}</Td>
                      <Td className="text-right tabular-nums">
                        {r.approvedCount > 0 ? <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">{r.approvedCount}</span> : <span className="text-slate-300">-</span>}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {r.pendingCount > 0 ? <span className="text-amber-600 font-bold">{r.pendingCount}</span> : <span className="text-slate-300">-</span>}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {r.rejectedCount > 0 ? <span className="text-rose-600 font-bold">{r.rejectedCount}</span> : <span className="text-slate-300">-</span>}
                      </Td>
                      <Td className="text-right font-bold text-slate-900 tabular-nums">
                        {r.totalBudgetUSD > 0 ? fmtMoney(r.totalBudgetUSD) : <span className="text-slate-300">—</span>}
                      </Td>
                      <Td>
                        <div className="text-xs text-slate-500 flex flex-col">
                          {r.lastActivity ? (
                            <>
                              <span className="text-slate-900 font-medium">{new Date(r.lastActivity).toLocaleDateString()}</span>
                              <span className="text-[10px] text-slate-400">{new Date(r.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </>
                          ) : '—'}
                        </div>
                      </Td>
                      <Td className="text-right pr-6">
                        <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                          <Link href={proposalsHref(r)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-cyan-50 text-slate-500 hover:text-cyan-700 transition-colors text-xs font-medium border border-transparent hover:border-cyan-100" title="View Proposals">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            View
                          </Link>
                          <button onClick={() => onArchive(r, !r.archived)} disabled={isBusy} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md transition-colors text-xs font-medium border border-transparent ${r.archived ? 'hover:bg-emerald-50 text-emerald-600 hover:border-emerald-100' : 'hover:bg-amber-50 text-slate-500 hover:text-amber-700 hover:border-amber-100'}`} title={r.archived ? "Unarchive" : "Archive"}>
                            {r.archived ? (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                Restore
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                Archive
                              </>
                            )}
                          </button>
                          <button onClick={() => onDelete(r)} disabled={isBusy} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover:bg-rose-50 text-slate-500 hover:text-rose-700 transition-colors text-xs font-medium border border-transparent hover:border-rose-100" title="Delete Entity">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Delete
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-24 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                          <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">No entities found</h3>
                        <p className="text-slate-500 max-w-sm mx-auto">We couldn't find any entities matching your search criteria. Try adjusting your filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
            <div className="text-sm text-slate-500">
              Showing <span className="font-semibold text-slate-900">{start + 1}</span> to <span className="font-semibold text-slate-900">{Math.min(start + pageSize, sorted.length)}</span> of <span className="font-semibold text-slate-900">{sorted.length}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:text-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:text-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Th({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <th className={`px-4 py-3 text-left font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: React.PropsWithChildren<{ className?: string }>) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}