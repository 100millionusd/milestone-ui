'use client';

import React, { useMemo, useState } from 'react';
import FileUploader from '@/app/templates/[id]/FileUploader';

// --- Helpers ---------------------------------------------------------------
const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);

// We treat dates as date-only strings (YYYY-MM-DD) to avoid timezone drift.
// The server can convert to ISO if needed.

type Milestone = {
  id: string;
  name: string;
  amount: number;
  dueDate: string; // date-only string (YYYY-MM-DD)
  acceptance?: string[];
  archived?: boolean;
};

type Props = {
  /** Hidden input name this component writes to */
  hiddenFieldName?: string;
  /** Optional API base for the FileUploader */
  apiBase?: string;
};

const SUGGESTED: Array<{ title: string; bullets: string[] }> = [
  { title: 'Assessment & Plan', bullets: ['Photo report', 'Agreed schedule'] },
  { title: 'Roof Repair', bullets: ['No leaks after 48h rain', 'Working gutters/downspouts'] },
  { title: 'Windows & Doors', bullets: ['Smooth closing & sealed', 'Before/after photos uploaded'] },
  { title: 'Bathrooms (Plumbing & Fixtures)', bullets: ['Pressure test no leaks', 'Ventilation working'] },
  { title: 'Painting + Final Cleaning', bullets: ['Uniform coverage (1.5 m)', 'Classrooms clean & ready'] },
];

const SCOPES = [
  { k: 'roof', e: '🏠', t: 'Roof Repair' },
  { k: 'windows', e: '🪟', t: 'Windows & Doors' },
  { k: 'bath', e: '🚿', t: 'Bathrooms' },
  { k: 'paint', e: '🎨', t: 'Painting + Cleaning' },
  { k: 'electrical', e: '💡', t: 'Electrical' },
  { k: 'plumbing', e: '🚰', t: 'Plumbing' },
  { k: 'floor', e: '🧱', t: 'Flooring' },
  { k: 'safety', e: '🧯', t: 'Safety' },
  { k: 'access', e: '♿️', t: 'Accessibility' },
];

export default function TemplateRenovationHorizontal({
  hiddenFieldName = 'milestonesJson',
  apiBase = process.env.NEXT_PUBLIC_API_BASE || '',
}: Props) {
  // selected scopes (purely visual; you can decide to auto-add milestones when toggled)
  const [sel, setSel] = useState<Record<string, boolean>>({});

  // editable milestones (vendor sets amount + date). Use stable IDs instead of array index as React key
  const [milestones, setMilestones] = useState<Milestone[]>(
    SUGGESTED.map((m) => ({
      id: newId(),
      name: m.title,
      amount: 0,
      dueDate: '',
      acceptance: m.bullets,
      archived: false,
    }))
  );

  const json = useMemo(() => JSON.stringify(milestones), [milestones]);

  function toggleScope(key: string, label: string) {
    setSel((p) => {
      const next = { ...p, [key]: !p[key] };
      // When toggled ON, add a blank milestone for that scope
      if (!p[key]) {
        setMilestones((ms) => [
          ...ms,
          { id: newId(), name: label, amount: 0, dueDate: '', acceptance: [], archived: false },
        ]);
      }
      return next;
    });
  }

  function updateMilestone(i: number, patch: Partial<Milestone>) {
    setMilestones((ms) => {
      const copy = ms.slice();
      copy[i] = { ...copy[i], ...patch } as Milestone;
      return copy;
    });
  }

  function addMilestone() {
    setMilestones((ms) => [
      ...ms,
      { id: newId(), name: 'New milestone', amount: 0, dueDate: '', acceptance: [], archived: false },
    ]);
  }

  function deleteMilestone(i: number) {
    setMilestones((ms) => ms.filter((_, idx) => idx !== i));
  }

  function moveMilestone(i: number, dir: -1 | 1) {
    setMilestones((ms) => {
      const j = i + dir;
      if (j < 0 || j >= ms.length) return ms;
      const next = ms.slice();
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return next;
    });
  }

  const total = milestones.reduce((a, m) => a + (Number(m.amount) || 0), 0);

  return (
    <section className="space-y-6">
      {/* 1) BIG EMOJI SCOPE GRID (NO SCROLL, HORIZONTAL, WRAPS IF NEEDED) */}
      <div className="rounded-2xl border bg-white shadow-sm p-4">
        <h3 className="text-base font-semibold mb-3">Select work scopes</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
          {SCOPES.map((s) => {
            const active = !!sel[s.k];
            return (
              <button
                key={s.k}
                type="button"
                onClick={() => toggleScope(s.k, s.t)}
                className={[
                  'group rounded-2xl border bg-white shadow-sm flex flex-col items-center justify-center gap-2 transition h-28',
                  active ? 'ring-2 ring-cyan-600/40 bg-cyan-50/40' : 'hover:bg-slate-50 hover:shadow',
                ].join(' ')}
                aria-pressed={active}
              >
                <span className="text-4xl leading-none" aria-hidden>
                  {s.e}
                </span>
                <span
                  className={[
                    'text-sm font-medium',
                    active ? 'text-cyan-700' : 'text-slate-800 group-hover:text-cyan-700',
                  ].join(' ')}
                >
                  {s.t}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2) MILESTONES — HORIZONTAL CARDS STRIP */}
      <div className="rounded-2xl border bg-white shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Milestones (vendor enters amount & date)</h3>
          <button
            type="button"
            onClick={addMilestone}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
          >
            + Add milestone
          </button>
        </div>

        <div className="mt-4 flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {milestones.map((m, i) => {
            const amountInvalid = Number.isNaN(m.amount) || Number(m.amount) <= 0;
            const dateInvalid = !m.dueDate;
            return (
              <div key={m.id} className="shrink-0 w-[360px] rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Step {i + 1}</div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50"
                      onClick={() => moveMilestone(i, -1)}
                      aria-label="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50"
                      onClick={() => moveMilestone(i, 1)}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                  </div>
                </div>

                <input
                  className="mt-1 w-full border rounded-md px-2 py-1 text-lg font-semibold"
                  value={m.name}
                  onChange={(e) => updateMilestone(i, { name: e.target.value })}
                />

                {!!m.acceptance?.length && (
                  <ul className="mt-2 text-sm text-slate-700 list-disc pl-5 space-y-1">
                    {m.acceptance.map((b, bi) => (
                      <li key={bi}>{b}</li>
                    ))}
                  </ul>
                )}

                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <label className="block">
                    Amount (USD)
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      className={[
                        'mt-1 w-full border rounded-md px-2 py-1',
                        amountInvalid ? 'border-rose-300 focus:ring-rose-200' : '',
                      ].join(' ')}
                      aria-invalid={amountInvalid || undefined}
                      value={Number.isFinite(m.amount) ? m.amount : 0}
                      onChange={(e) => updateMilestone(i, { amount: Number(e.target.value || 0) })}
                    />
                  </label>

                  <label className="block">
                    Date
                    <input
                      type="date"
                      className={[
                        'mt-1 w-full border rounded-md px-2 py-1',
                        dateInvalid ? 'border-rose-300 focus:ring-rose-200' : '',
                      ].join(' ')}
                      aria-invalid={dateInvalid || undefined}
                      value={m.dueDate || ''}
                      onChange={(e) => updateMilestone(i, { dueDate: e.target.value || '' })}
                    />
                  </label>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      id={`arch-${m.id}`}
                      type="checkbox"
                      className="rounded border"
                      checked={!!m.archived}
                      onChange={(e) => updateMilestone(i, { archived: e.target.checked })}
                    />
                    <label htmlFor={`arch-${m.id}`}>Archive</label>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      Amount now: ${Number(m.amount || 0).toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50"
                      onClick={() => deleteMilestone(i)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Hidden field consumed by the page's server action */}
        <input type="hidden" name={hiddenFieldName} value={json} readOnly />
        <div className="mt-3 text-sm text-slate-700">
          <span className="font-medium">Total (USD):</span>{' '}
          {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* 3) Optional attachments */}
      <div className="rounded-2xl border bg-white shadow-sm p-4">
        <h3 className="text-base font-semibold mb-3">Attachments (optional)</h3>
        <FileUploader apiBase={apiBase} />
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
}

// ------------------------
// Minimal test helpers
// ------------------------
export function computeTotal(ms: Array<{ amount: number }>): number {
  return ms.reduce((a, m) => a + (Number(m.amount) || 0), 0);
}

export const __test = {
  newId,
  sampleMilestones: (): Milestone[] => [
    { id: 'a', name: 'One', amount: 10, dueDate: '2025-01-01', archived: false },
    { id: 'b', name: 'Two', amount: 20.55, dueDate: '2025-02-01', archived: false },
    { id: 'c', name: 'Three', amount: 0, dueDate: '', archived: false },
  ],
};

