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

// ⬇️ drop-in replacement: tolerant of odd keys and JSON strings
function addressToDisplay(addr: any): string | null {
  if (!addr) return null;

  // If it's a string, try to parse JSON first (e.g., '{"line1":"..."}')
  if (typeof addr === 'string') {
    const s = addr.trim();
    if (!s) return null;

    // Try JSON parse if it looks like an object
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('{"') && s.endsWith('}'))) {
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === 'object') {
          return addressToDisplay(parsed);
        }
      } catch {
        // fall through and return the raw string
      }
    }
    return s;
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
    const s = parts.join(', ').replace(/\s+,/g, ',').replace(/,\s+,/g, ',').trim();
    return s || null;
  }

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
  const approvedCount = Number(r.approvedCount ?? r.approved_count ?? sc.approved ?? 0);
  const pendingCount = Number(r.pendingCount ?? r.pending_count ?? sc.pending ?? 0);
  const rejectedCount = Number(r.rejectedCount ?? r.rejected_count ?? sc.rejected ?? 0);
  const archivedCount = Number(r.archivedCount ?? r.archived_count ?? sc.archived ?? 0);

  const proposalsCount = Number(
    r.proposalsCount ??
      r.proposals_count ??
      sc.total ??
      approvedCount + pendingCount + rejectedCount + archivedCount
  );

  const inferredArchived = archivedCount > 0 && (approvedCount + pendingCount + rejectedCount) === 0;

  // ---- Address normalization ----
  // Try all likely locations where backend might send address
  // ---- Address normalization ----
  // Try all likely locations where backend might send address
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

    archived: !!(r.archived ?? r.is_archived ?? inferredArchived),
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
  const pageSize = 5;

  // per-row busy state
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // INITIAL LOAD: get entities from server (proposers), fallback to proposals
  useEffect(() => {
    // if server rendered with initial rows, just use them
    if (initial.length) {
      setRows(initial);
      setLoading(false);
      return;
    }

    let alive = true;
    (async () => {
      try {
        setLoading(true);

        // Try listProposers (accepts array or {items:[]})
        let resp: any;
        try {
          resp = await (listProposers as unknown as (p?: any) => Promise<any>)({
            includeArchived: true,
          });
        } catch {
          resp = await listProposers();
        }

        const arr: any[] = Array.isArray(resp) ? resp : Array.isArray(resp?.items) ? resp.items : [];

        let data = arr.map(normalizeRow);

        // Fallback: aggregate from proposals if empty
        if (!data.length) {
          const proposals = await listProposals({ includeArchived: true });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.length]);

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

  // Payload for backend (id if present, otherwise the normalized triple)
// ✅ NEW - CORRECT KEY
function toIdOrKey(r: ProposerAgg) {
  if (r.id != null) return { id: r.id };
  return {
    entity: r.entity ?? null,         // <--- FIX
    contact: r.contactEmail ?? null,
    owner_wallet: r.wallet ?? null,
  };
}

  async function onArchive(r: ProposerAgg, nextArchived: boolean) {
    const k = keyOf(r);
    setBusy((b) => ({ ...b, [k]: true }));
    const payload = toIdOrKey(r);

    // optimistic
    setRows((prev) =>
      prev.map((x) => (keyOf(x) === k ? { ...x, archived: nextArchived } : x))
    );
    try {
      if (nextArchived) await archiveEntity(payload);
      else await unarchiveEntity(payload);
    } catch (e: any) {
      // revert on error
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

    // optimistic
    const prev = rows;
    setRows((p) => p.filter((x) => keyOf(x) !== k));
    try {
      await deleteEntity(payload, 'hard');
    } catch (e: any) {
      setRows(prev); // revert
      alert(e?.message || 'Failed to delete entity');
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  }

  // UI

  if (loading) return <div className="p-6">Loading entities…</div>;
  if (error) return <div className="p-6 text-red-600">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 py-10">
        {/* Header + Controls */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <h1 className="text-2xl font-bold">Admin — Entities</h1>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="w-full sm:w-72">
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Search entities, email, wallet…"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>

            {/* Show archived toggle */}
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 select-none">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={showArchived}
                onChange={(e) => {
                  setShowArchived(e.target.checked);
                  setPage(1);
                }}
              />
              Show archived
            </label>

            <div className="flex items-center gap-2">
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm bg-white"
              >
                <option value="entity">Sort: Entity</option>
                <option value="proposalsCount">Sort: Proposals</option>
                <option value="approvedCount">Sort: Approved</option>
                <option value="pendingCount">Sort: Pending</option>
                <option value="rejectedCount">Sort: Rejected</option>
                <option value="totalBudgetUSD">Sort: Total Budget</option>
                <option value="lastActivity">Sort: Last Activity</option>
              </select>

              <button
                onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                title="Toggle sort direction"
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </div>

        {/* Card + Table */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <Th>Entity / Location</Th>
                  <Th>Primary contact</Th>
                  <Th>Wallet</Th>
                  <Th className="text-right">Proposals (#)</Th>
                  <Th className="text-right">Approved</Th>
                  <Th className="text-right">Pending</Th>
                  <Th className="text-right">Rejected</Th>
                  <Th className="text-right">Total Budget (USD)</Th>
                  <Th>Last Activity</Th>
                  <Th className="text-right">Actions</Th>
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
                      className={`hover:bg-slate-50/60 ${r.archived ? 'opacity-70' : ''}`}
                    >
                      {/* Entity + city, country */}
                      <Td>
                        <div className="font-medium text-slate-900 flex items-center gap-2">
                          {r.entity || '—'}
                          {r.archived && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600">
                              archived
                            </span>
                          )}
                        </div>
                        {(r.city || r.country) && (
                          <div className="text-xs text-slate-500">
                            {[r.city, r.country].filter(Boolean).join(', ')}
                          </div>
                        )}
                      </Td>

                      {/* Contact (deep links) */}
                      <Td>
                        {/* Email */}
                        <div>
                          {email ? (
                            <a
                              href={toMailto(email, 'Proposal contact')}
                              className="text-sky-700 hover:text-sky-900 underline underline-offset-2"
                              title="Email"
                            >
                              {email}
                            </a>
                          ) : (
                            '—'
                          )}
                        </div>

                        <div>
                          {(r.telegramUsername || r.telegramChatId || r.ownerTelegramUsername || r.ownerTelegramChatId) ? (
                            <a
                              href={
                                toTelegramLink(
                                  r.telegramUsername ?? r.ownerTelegramUsername ?? null,
                                  r.telegramChatId ?? r.ownerTelegramChatId ?? null
                                ) || '#'
                              }
                              className="text-sky-700 hover:text-sky-900 underline underline-offset-2"
                              title="Open in Telegram"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {(r.telegramUsername ?? r.ownerTelegramUsername)
                                ? `@${String(r.telegramUsername ?? r.ownerTelegramUsername).replace(/^@/, '')}`
                                : `tg:${r.telegramChatId ?? r.ownerTelegramChatId}`}
                            </a>
                          ) : r.telegramConnected ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                              Telegram connected
                            </span>
                          ) : (
                            '—'
                          )}
                        </div>

                        {/* WhatsApp: prefer ownerPhone */}
                        <div>
                          {r.ownerPhone || r.whatsapp || r.phone ? (
                            <a
                              href={toWhatsAppLink(r.ownerPhone ?? r.whatsapp ?? r.phone) || '#'}
                              className="text-sky-700 hover:text-sky-900 underline underline-offset-2"
                              title="Open WhatsApp"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {r.ownerPhone ?? r.whatsapp ?? r.phone}
                            </a>
                          ) : (
                            '—'
                          )}
                        </div>

                        {/* Telegram (inline, gray, above address) */}
                        {(r.telegramUsername || r.telegramChatId || r.telegramConnected) && (
                          <div className="text-xs text-slate-500">
                            {r.telegramUsername
                              ? `@${String(r.telegramUsername).replace(/^@/, '')}`
                              : r.telegramChatId
                              ? `tg:${r.telegramChatId}`
                              : 'Telegram connected'}
                          </div>
                        )}

                        {/* Address (display string) */}
                        {r.address && (
                          <div
                            className="text-xs text-slate-500 truncate max-w-[280px]"
                            title={r.address || ''}
                          >
                            {r.address}
                          </div>
                        )}
                      </Td>

                      {/* Wallet — full + copy */}
                      <Td className="font-mono text-xs text-slate-800 break-all">
                        <div className="flex items-center gap-2">
                          <span className="select-all">{r.wallet || '—'}</span>
                          {r.wallet && (
                            <button
                              onClick={() => navigator.clipboard.writeText(r.wallet!)}
                              className="text-sky-700 hover:text-sky-900 underline underline-offset-2"
                              title="Copy wallet address"
                            >
                              Copy
                            </button>
                          )}
                        </div>
                      </Td>

                      {/* Counts */}
                      <Td className="text-right">{r.proposalsCount ?? 0}</Td>
                      <Td className="text-right">{r.approvedCount ?? 0}</Td>
                      <Td className="text-right">{r.pendingCount ?? 0}</Td>
                      <Td className="text-right">{r.rejectedCount ?? 0}</Td>
                      <Td className="text-right">{fmtMoney(r.totalBudgetUSD)}</Td>

                      {/* Last activity */}
                      <Td>
                        {r.lastActivity ? new Date(r.lastActivity).toLocaleString() : '—'}
                      </Td>

                      {/* Actions */}
                      <Td className="text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <Link
                            href={proposalsHref(r)}
                            className="inline-flex items-center px-3 py-1.5 rounded-md border border-cyan-600 text-cyan-700 hover:bg-cyan-50"
                          >
                            Proposals
                          </Link>

                          {r.archived ? (
                            <button
                              onClick={() => onArchive(r, false)}
                              disabled={isBusy}
                              className="inline-flex items-center px-3 py-1.5 rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-50"
                            >
                              Unarchive
                            </button>
                          ) : (
                            <button
                              onClick={() => onArchive(r, true)}
                              disabled={isBusy}
                              className="inline-flex items-center px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50"
                            >
                              Archive
                            </button>
                          )}

                          <button
                            onClick={() => onDelete(r)}
                            disabled={isBusy}
                            className="inline-flex items-center px-3 py-1.5 rounded-md bg-rose-100 text-rose-800 hover:bg-rose-200 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}

                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-500">
                      No entities found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
            <div className="text-sm text-slate-600">
              Page <b>{safePage}</b> of <b>{totalPages}</b> — {rows.length} total
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white disabled:opacity-50"
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
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${className}`}>
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