// src/components/AuditPanel.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  FileCheck2,
  Coins,
  Archive,
  Undo2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Filter,
  Search,
} from 'lucide-react';

type AuditItem = {
  id: string | number;
  at: string;                // ISO datetime
  actor?: string;            // e.g., "admin", "vendor"
  change: string;            // e.g., "payment_released"
  details?: string;          // free text like "Changed: payment_released"
  ipfs?: string;             // IPFS url (optional)
  milestoneIndex?: number;   // 0-based (optional)
  txHash?: string;           // optional
};

type Props = {
  events: AuditItem[];
  milestoneNames?: Record<number, string>; // {0: "Milestone 1", ...}
  initialDays?: number; // how many day-groups to expand initially (default 3)
};

const CHANGE_META: Record<
  string,
  { label: string; icon: React.ComponentType<any>; tone: string }
> = {
  payment_released: { label: 'Payment released', icon: Coins, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  proof_approved:   { label: 'Proof approved',   icon: CheckCircle2, tone: 'text-green-700 bg-green-50 border-green-200' },
  milestone_completed: { label: 'Milestone completed', icon: FileCheck2, tone: 'text-blue-700 bg-blue-50 border-blue-200' },
  change_request_opened: { label: 'Change request opened', icon: AlertTriangle, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
  change_request_resolved: { label: 'Change request resolved', icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  archived: { label: 'Archived', icon: Archive, tone: 'text-slate-700 bg-slate-50 border-slate-200' },
  unarchived: { label: 'Unarchived', icon: Undo2, tone: 'text-slate-700 bg-slate-50 border-slate-200' },
};

function fmtDay(dateISO: string) {
  const d = new Date(dateISO);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString();
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Group by YYYY-MM-DD
function groupByDay(events: AuditItem[]) {
  const by: Record<string, AuditItem[]> = {};
  for (const e of events) {
    const day = new Date(e.at).toISOString().slice(0, 10);
    (by[day] ||= []).push(e);
  }
  const groups = Object.entries(by)
    .map(([day, list]) => ({
      day,
      items: list.sort((a, b) => +new Date(b.at) - +new Date(a.at)),
    }))
    .sort((a, b) => +new Date(b.day) - +new Date(a.day));
  return groups;
}

// Cluster events: same milestone within 60s → one card
type Cluster = { at: string; items: AuditItem[]; milestoneIndex?: number };
function clusterDayItems(items: AuditItem[]): Cluster[] {
  const out: Cluster[] = [];
  for (const e of items) {
    const last = out[out.length - 1];
    const within =
      last &&
      last.milestoneIndex === e.milestoneIndex &&
      Math.abs(+new Date(last.at) - +new Date(e.at)) <= 60_000;
    if (within) {
      last.items.push(e);
      // keep cluster anchor as newest time
    } else {
      out.push({ at: e.at, items: [e], milestoneIndex: e.milestoneIndex });
    }
  }
  return out;
}

export default function AuditPanel({ events, milestoneNames = {}, initialDays = 3 }: Props) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<string[]>([]); // list of change keys
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [compact, setCompact] = useState(false);

  const allTypes = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(e.change));
    return Array.from(set);
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      const byType = filters.length ? filters.includes(e.change) : true;
      const byQuery =
        !q ||
        e.actor?.toLowerCase().includes(q) ||
        e.details?.toLowerCase().includes(q) ||
        CHANGE_META[e.change]?.label?.toLowerCase().includes(q) ||
        (typeof e.milestoneIndex === 'number' &&
          (milestoneNames[e.milestoneIndex] || `Milestone ${e.milestoneIndex + 1}`)
            .toLowerCase()
            .includes(q));
      return byType && byQuery;
    });
  }, [events, filters, query, milestoneNames]);

  const grouped = useMemo(() => {
    const g = groupByDay(filtered);
    // auto-collapse beyond initialDays (once)
    if (Object.keys(collapsed).length === 0) {
      const next: Record<string, boolean> = {};
      g.forEach((grp, idx) => {
        if (idx >= initialDays) next[grp.day] = true;
      });
      if (Object.keys(next).length) setCollapsed(next);
    }
    return g.map(({ day, items }) => ({
      day,
      clusters: clusterDayItems(items),
    }));
  }, [filtered, initialDays]); // intentionally omit collapsed

  const toggleDay = (day: string) =>
    setCollapsed((p) => ({ ...p, [day]: !p[day] }));

  const toggleFilter = (k: string) =>
    setFilters((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
    );

  const clearFilters = () => setFilters([]);

  return (
    <div className="space-y-4">
      {/* Header / controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 text-sm">
          <Activity className="h-4 w-4" />
          <span className="font-medium">
            {filtered.length} update{filtered.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2 top-2.5 text-slate-400" />
          <input
            className="pl-8 pr-3 py-2 border rounded text-sm w-56"
            placeholder="Search actor, type, milestone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          onClick={() => setCompact((v) => !v)}
          className="px-3 py-2 text-sm border rounded"
          title="Toggle compact mode"
        >
          {compact ? 'Comfortable' : 'Compact'}
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs uppercase tracking-wide text-slate-500 flex items-center gap-1">
          <Filter className="h-3.5 w-3.5" /> Filters
        </span>
        {allTypes.map((k) => {
          const meta = CHANGE_META[k] || {
            label: k.replace(/_/g, ' '),
            tone: 'text-slate-700 bg-slate-50 border-slate-200',
          };
          const active = filters.includes(k);
          return (
            <button
              key={k}
              onClick={() => toggleFilter(k)}
              className={`px-2.5 py-1 rounded-full border text-xs ${
                active ? 'ring-2 ring-offset-1 ring-slate-300' : ''
              } ${meta.tone}`}
              title={meta.label}
            >
              {meta.label}
            </button>
          );
        })}
        {filters.length > 0 && (
          <button
            onClick={clearFilters}
            className="px-2.5 py-1 rounded-full border text-xs bg-white"
          >
            Clear
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="space-y-6">
        {grouped.map(({ day, clusters }) => {
          const isCollapsed = !!collapsed[day];
          return (
            <div key={day} className="border rounded-lg overflow-hidden bg-white">
              <button
                onClick={() => toggleDay(day)}
                className="w-full flex items-center justify-between px-4 py-3 border-b bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  )}
                  <span className="font-medium">{fmtDay(day)}</span>
                </div>
                <span className="text-xs text-slate-500">
                  {clusters.length} group{clusters.length === 1 ? '' : 's'}
                </span>
              </button>

              {!isCollapsed && (
                <div className="p-4">
                  <ol className="relative border-l pl-4">
                    {clusters.map((cl, idx) => (
                      <li key={idx} className="mb-6 last:mb-0">
                        <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-slate-300" />
                        <ClusterCard
                          cluster={cl}
                          milestoneNames={milestoneNames}
                          compact={compact}
                        />
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          );
        })}

        {grouped.length === 0 && (
          <div className="text-center text-slate-500 py-10 border rounded bg-white">
            No audit entries found.
          </div>
        )}
      </div>
    </div>
  );
}

function ClusterCard({
  cluster,
  milestoneNames,
  compact,
}: {
  cluster: Cluster;
  milestoneNames: Record<number, string>;
  compact: boolean;
}) {
  const ms = cluster.milestoneIndex;
  const msLabel =
    typeof ms === 'number'
      ? milestoneNames[ms] || `Milestone ${ms + 1}`
      : 'General';

  return (
    <div
      className={`border rounded-lg ${compact ? 'p-3' : 'p-4'} bg-white`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
        <span className="font-medium">{msLabel}</span>
        <span className="text-slate-400">•</span>
        <span className="inline-flex items-center gap-1 text-slate-600">
          <Clock className="h-3.5 w-3.5" />
          {fmtTime(cluster.at)}
        </span>
      </div>

      <div className="space-y-2">
        {cluster.items.map((e) => {
          const meta =
            CHANGE_META[e.change] || {
              label: e.change.replace(/_/g, ' '),
              icon: Activity,
              tone: 'text-slate-700 bg-slate-50 border-slate-200',
            };
        const Icon = meta.icon as any;
          return (
            <div
              key={e.id}
              className={`border rounded ${compact ? 'p-2' : 'p-3'} ${meta.tone}`}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Icon className="h-4 w-4" />
                <span className="font-medium">{meta.label}</span>
                <span className="text-slate-400">•</span>
                <span className="text-slate-600">{fmtTime(e.at)}</span>
                {e.actor && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">by {e.actor}</span>
                  </>
                )}
                {e.txHash && (
                  <>
                    <span className="text-slate-400">•</span>
                    <span className="font-mono text-xs break-all">
                      TX: {shortHash(e.txHash)}
                    </span>
                  </>
                )}
                {e.ipfs && (
                  <a
                    href={e.ipfs}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-xs underline"
                  >
                    IPFS
                  </a>
                )}
              </div>
              {e.details && !compact && (
                <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">
                  {e.details}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function shortHash(h?: string) {
  if (!h) return '';
  return h.length <= 12 ? h : `${h.slice(0, 6)}…${h.slice(-4)}`;
}
