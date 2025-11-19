// src/components/AdminEntitiesTable.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  listProposers,
  listProposals,
  type Proposal,
  getAdminVendors as listAdminVendors,
  // use the admin helpers but alias to simple names for clarity
  adminArchiveEntity as archiveEntity,
  adminUnarchiveEntity as unarchiveEntity,
  adminDeleteEntity as deleteEntity,
} from '@/lib/api';

/* ---------- Types ---------- */

export type ProposerAgg = {
  id?: number | string | null;
  entity: string | null;

  /** Display-ready address string (never an object) */
  address: string | null;
  city: string | null;
  country: string | null;

  contactEmail: string | null;
  ownerEmail: string | null;
  email?: string | null;

  /** phone also used for WhatsApp */
  phone?: string | null;
  whatsapp?: string | null;

  /** Telegram */
  telegramUsername?: string | null;
  telegramChatId?: string | null;
  telegramConnected?: boolean;

  wallet: string | null;
  proposalsCount: number;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  /** Count of archived proposals for this entity */
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

// Guess an email from any key that contains "email" or "contact" and has an "@"
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

  // 1. If it's a string, it might contain JSON (e.g. '{"line1":...}')
  if (typeof addr === 'string') {
    let str = addr.trim();
    if (!str) return null;

    // Regex to find JSON-like structures: starts with { ends with }
    const jsonRegex = /\{.*?\}/g;

    // Replace any JSON blob found in the string with a formatted address
    const cleaned = str.replace(jsonRegex, (match) => {
      try {
        const parsed = JSON.parse(match);
        // Recursively call this function on the parsed object
        const fmt = addressToDisplay(parsed);
        return fmt || '';
      } catch {
        // If it looks like JSON but fails to parse, return it as is
        return match;
      }
    });

    // Clean up resulting string (remove double commas, trim)
    return cleaned
      .replace(/,\s*,/g, ', ')
      .replace(/^[\s,]+|[\s,]+$/g, '')
      .trim();
  }

  // 2. If it's an object, extract fields
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
    const s = parts.join(', ').replace(/\s+,/g, ',').replace(/,\s+,/g, ',').trim();
    return s || null;
  }

  // Fallback
  try {
    return String(addr).trim();
  } catch {
    return null;
  }
}

function normalizeRow(r: any): ProposerAgg {
  // prefer any non-empty value for email
  const contactEmail = pickNonEmpty(
    r.email, // backend alias
    r.primaryEmail,
    r.primary_email,
    r.contactEmail,
    r.contact_email,
    r.ownerEmail,
    r.owner_email,
    r.contact // some backends send `contact`
  );

  const ownerEmail = pickNonEmpty(r.ownerEmail, r.owner_email);
  const email = contactEmail || ownerEmail || guessEmail(r) || null;

  // Phone / WhatsApp (also look into profile)
  const ownerPhone = pickNonEmpty(
    r.ownerPhone,
    r.owner_phone,
    r.profile?.ownerPhone,
    r.profile?.owner_phone
  );
  const phone = pickNonEmpty(
    r.phone,
    r.whatsapp,
    r.profile?.phone,
    r.profile?.whatsapp,
    ownerPhone
  );

  // Telegram (top-level and profile, both owner and generic)
  const ownerTelegramUsername = pickNonEmpty(
    r.ownerTelegramUsername,
    r.owner_telegram_username,
    r.profile?.ownerTelegramUsername,
    r.profile?.owner_telegram_username
  );
  const ownerTelegramChatId = pickNonEmpty(
    r.ownerTelegramChatId,
    r.owner_telegram_chat_id,
    r.profile?.ownerTelegramChatId,
    r.profile?.owner_telegram_chat_id
  );
  // Map owner → generic so the UI can rely on telegramUsername/telegramChatId
  const telegramUsername = pickNonEmpty(
    r.telegramUsername,
    r.telegram_username,
    ownerTelegramUsername, // ← add owner
    r.profile?.telegramUsername,
    r.profile?.telegram_username
  );
  const telegramChatId = pickNonEmpty(
    r.telegramChatId,
    r.telegram_chat_id,
    ownerTelegramChatId, // ← add owner
    r.profile?.telegramChatId,
    r.profile?.telegram_chat_id
  );

  // Telegram "connected" flag (entities/proposers often only have this boolean)
  const telegramConnected = !!(
    r.telegramConnected ??
    r.profile?.telegramConnected ??
    r.profile?.telegram?.connected ??
    r.profile?.social?.telegram?.connected ??
    r.profile?.connections?.telegram?.connected
  );

  // Status counts
  const sc = r.statusCounts || r.status_counts || {};
  const approvedCount = Number(r.approvedCount ?? r.approved_count ?? sc.approved ?? r.proposals?.approved ?? 0);
  const pendingCount = Number(r.pendingCount ?? r.pending_count ?? sc.pending ?? r.proposals?.pending ?? 0);
  const rejectedCount = Number(r.rejectedCount ?? r.rejected_count ?? sc.rejected ?? r.proposals?.rejected ?? 0);
  const archivedCount = Number(r.archivedCount ?? r.archived_count ?? sc.archived ?? r.proposals?.archived ?? 0);

  const proposalsCount = Number(
    r.proposalsCount ??
      r.proposals_count ??
      sc.total ??
      approvedCount + pendingCount + rejectedCount + archivedCount
  );

  // ---- Address normalization ----
  const rawAddr =
    r.addr_display ??
    r.addressText ??
    r.address_text ??
    r.address ??
    r.profile?.address ??
    r.profile?.addressText ??
    r.profile?.address_text ??
    null;

  const addrDisplay = addressToDisplay(rawAddr);

  // City / Country: prefer explicit fields, otherwise derive from object
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

    // include entity_name from backend
    entity: pickNonEmpty(r.entityName, r.entity_name, r.orgName, r.entity, r.organization) || null,

    // display-only address string
    address: addrDisplay,
    city: city || null,
    country: country || null,

    // store email on the row in addition to contactEmail/ownerEmail
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
    totalBudgetUSD: Number(
      r.totalBudgetUSD ?? r.total_budget_usd ?? r.amountUSD ?? r.amount_usd ?? 0
    ),
    lastActivity:
      r.lastActivityAt ??
      r.last_activity_at ??
      r.lastProposalAt ??
      r.updatedAt ??
      r.updated_at ??
      r.createdAt ??
      r.created_at ??
      null,
    
    // Trust the 'archived' flag
    archived: !!r.archived,
  };
}

function aggregateFromProposals(props: Proposal[]): ProposerAgg[] {
  const byKey = new Map<string, ProposerAgg>();

  for (const p of props) {
    const org = (p.orgName || 'Unknown Org').trim();
    const key = `${org}|${p.contact || ''}|${p.ownerWallet || ''}`;

    const existing = byKey.get(key);
    const row: ProposerAgg =
      existing || {
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

    const st = (p.status || 'pending').toLowerCase();
    if (st === 'approved') row.approvedCount += 1;
    else if (st === 'rejected') row.rejectedCount += 1;
    else if (st === 'archived') row.archivedCount = (row.archivedCount || 0) + 1;
    else row.pendingCount += 1;

    const prev = row.lastActivity ? new Date(row.lastActivity).getTime() : 0;
    const cand = new Date(p.updatedAt || p.createdAt).getTime();
    if (cand > prev) row.lastActivity = p.updatedAt || p.createdAt;

    // infer archived if all proposals for this entity are archived
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

/** Contact deep links (Entities) */
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

        const resp = await listProposers({
          includeArchived: showArchived,
        });
        
        const arr: any[] = Array.isArray(resp) ? resp : [];

        let data = arr.map(normalizeRow);

        if (!data.length) {
          const proposals = await listProposals({ includeArchived: showArchived });
          data = aggregateFromProposals(proposals);
        }

        if (alive) setRows(data);
      } catch (e: any) {
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
        r.entity,
        r.address,
        r.city,
        r.country,
        (r as any).email,
        r.contactEmail,
        r.ownerEmail,
        r.wallet,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
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

  // Build proposals filter link
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

    setRows((prev) =>
      prev.map((x) => (keyOf(x) === k ? { ...x, archived: nextArchived } : x))
    );
    try {
      if (nextArchived) await archiveEntity(payload);
      else await unarchiveEntity(payload);
    } catch (e: any) {
      setRows((prev) =>
        prev.map((x) => (keyOf(x) === k ? { ...x, archived: !nextArchived } : x))
      );
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

  if (loading) return <div className="p-6 text-slate-500">Loading entities…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        
        {/* Header + Controls */}
        <div className="mb-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin — Entities</h1>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span className="font-medium text-slate-900">{filtered.length}</span> results
                    {showArchived && <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-100">Showing Archived</span>}
                </div>
            </div>

          <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
            
            {/* Search */}
            <div className="w-full lg:w-96 relative">
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search entity, email, wallet..."
                className="w-full pl-4 pr-10 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={showArchived}
                  onChange={(e) => {
                    setShowArchived(e.target.checked);
                    setPage(1);
                  }}
                />
                Show archived
              </label>

              <div className="flex items-center border border-slate-200 rounded-lg bg-slate-50 p-0.5">
                <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value as SortKey)}
                    className="bg-transparent border-none text-sm text-slate-700 py-2 pl-3 pr-8 focus:ring-0 font-medium cursor-pointer"
                >
                    <option value="entity">Sort: Name</option>
                    <option value="proposalsCount">Sort: Proposals</option>
                    <option value="approvedCount">Sort: Approved</option>
                    <option value="totalBudgetUSD">Sort: Budget</option>
                    <option value="lastActivity">Sort: Last Activity</option>
                </select>
                <button
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    className="p-2 hover:bg-white rounded-md shadow-sm transition-all text-slate-500"
                    title="Toggle sort direction"
                >
                    {sortDir === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <Th className="min-w-[200px]">Entity</Th>
                  <Th className="min-w-[180px]">Contact</Th>
                  <Th>Wallet</Th>
                  <Th className="text-right w-20">Props</Th>
                  <Th className="text-right w-20">Appr</Th>
                  <Th className="text-right w-20">Pend</Th>
                  <Th className="text-right w-20">Rej</Th>
                  <Th className="text-right min-w-[100px]">Budget</Th>
                  <Th className="min-w-[120px]">Activity</Th>
                  <Th className="text-right min-w-[160px]">Actions</Th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r, i) => {
                  const k = keyOf(r);
                  const isBusy = !!busy[k];
                  const email = r.email ?? r.contactEmail ?? r.ownerEmail ?? guessEmail(r as any) ?? null;
                  
                  return (
                    <tr
                      key={`${r.wallet || r.contactEmail || r.entity || ''}-${i}`}
                      className={`hover:bg-slate-50/80 transition-colors ${r.archived ? 'bg-slate-50/50 grayscale-[0.5]' : ''}`}
                    >
                      {/* Entity / Location */}
                      <Td>
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-[15px]">{r.entity || '—'}</span>
                                {r.archived && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 uppercase tracking-wide">
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
                            
                            {/* UPDATED: Removed truncate and max-w to allow full visibility */}
                            {r.address && (
                                <div className="text-[10px] text-slate-400 break-words">
                                    {r.address}
                                </div>
                            )}
                        </div>
                      </Td>

                      {/* Contact Info - Clean Stack */}
                      <Td>
                        <div className="flex flex-col gap-1.5 items-start">
                          {email ? (
                            <a
                              href={toMailto(email, 'Proposal contact')}
                              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-blue-600 transition-colors text-xs group"
                              title={email}
                            >
                              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              <span className="truncate max-w-[160px]">{email}</span>
                            </a>
                          ) : null}

                          {(r.telegramUsername || r.telegramChatId || r.ownerTelegramUsername || r.ownerTelegramChatId) ? (
                            <a
                              href={toTelegramLink(r.telegramUsername ?? r.ownerTelegramUsername ?? null, r.telegramChatId ?? r.ownerTelegramChatId ?? null) || '#'}
                              className="inline-flex items-center gap-1.5 text-slate-600 hover:text-sky-500 transition-colors text-xs group"
                              target="_blank" 
                              rel="noreferrer"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.361 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.781-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                              <span className="truncate max-w-[160px]">
                                {r.telegramUsername ?? r.ownerTelegramUsername 
                                    ? `@${String(r.telegramUsername ?? r.ownerTelegramUsername).replace(/^@/, '')}` 
                                    : 'Telegram'}
                              </span>
                            </a>
                          ) : null}

                          {(r.ownerPhone || r.whatsapp || r.phone) ? (
                             <a
                                href={toWhatsAppLink(r.ownerPhone ?? r.whatsapp ?? r.phone) || '#'}
                                className="inline-flex items-center gap-1.5 text-slate-600 hover:text-green-600 transition-colors text-xs group"
                                target="_blank"
                                rel="noreferrer"
                              >
                                <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.466c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                                <span className="truncate max-w-[160px]">{r.ownerPhone ?? r.whatsapp ?? r.phone}</span>
                              </a>
                          ) : null}
                        </div>
                      </Td>

                      {/* Wallet */}
                      <Td>
                        <div className="flex items-center gap-2 group">
                          <div 
                            className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded border border-slate-200 truncate max-w-[140px] group-hover:max-w-none group-hover:bg-white group-hover:absolute group-hover:z-10 group-hover:shadow-md transition-all cursor-default"
                            title={r.wallet || ''}
                          >
                            {r.wallet || '—'}
                          </div>
                          {r.wallet && (
                            <button
                              onClick={() => navigator.clipboard.writeText(r.wallet!)}
                              className="text-slate-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100"
                              title="Copy wallet"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            </button>
                          )}
                        </div>
                      </Td>

                      {/* Stats */}
                      <Td className="text-right text-slate-600 tabular-nums">{r.proposalsCount || '-'}</Td>
                      <Td className="text-right tabular-nums">
                        {r.approvedCount > 0 ? <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-100">{r.approvedCount}</span> : <span className="text-slate-400">-</span>}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {r.pendingCount > 0 ? <span className="text-slate-600">{r.pendingCount}</span> : <span className="text-slate-400">-</span>}
                      </Td>
                      <Td className="text-right tabular-nums">
                        {r.rejectedCount > 0 ? <span className="text-rose-600 font-medium">{r.rejectedCount}</span> : <span className="text-slate-400">-</span>}
                      </Td>
                      
                      <Td className="text-right font-medium text-slate-700 tabular-nums">
                        {r.totalBudgetUSD > 0 ? fmtMoney(r.totalBudgetUSD) : <span className="text-slate-400">—</span>}
                      </Td>

                      {/* Activity */}
                      <Td>
                        <div className="text-xs text-slate-500 flex flex-col">
                            {r.lastActivity ? (
                                <>
                                    <span className="text-slate-700">{new Date(r.lastActivity).toLocaleDateString()}</span>
                                    <span className="text-[10px] opacity-70">{new Date(r.lastActivity).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </>
                            ) : '—'}
                        </div>
                      </Td>

                      {/* Actions */}
                      <Td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link
                            href={proposalsHref(r)}
                            className="p-2 rounded-md hover:bg-slate-100 text-slate-500 hover:text-blue-600 transition-colors"
                            title="View Proposals"
                          >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                          </Link>

                          <button
                            onClick={() => onArchive(r, !r.archived)}
                            disabled={isBusy}
                            className={`p-2 rounded-md transition-colors ${r.archived ? 'hover:bg-emerald-50 text-emerald-600' : 'hover:bg-amber-50 text-slate-400 hover:text-amber-600'}`}
                            title={r.archived ? "Unarchive" : "Archive"}
                          >
                            {r.archived ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                            )}
                          </button>

                          <button
                            onClick={() => onDelete(r)}
                            disabled={isBusy}
                            className="p-2 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete Entity"
                          >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}

                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                            <svg className="w-12 h-12 mb-3 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                            <p>No entities found matching your criteria.</p>
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
              Showing <b>{start + 1}</b> to <b>{Math.min(start + pageSize, sorted.length)}</b> of <b>{sorted.length}</b>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

/* ---------- Small presentational helpers ---------- */

function Th({
  children,
  className = '',
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <th className={`px-4 py-3 text-left font-semibold ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
}: React.PropsWithChildren<{ className?: string }>) {
  return <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;
}