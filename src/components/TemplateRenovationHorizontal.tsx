'use client';

import React, { useMemo, useState } from 'react';

type Milestone = {
  name: string;           // editable title
  description?: string;   // editable description
  amount?: number;        // vendor enters (no default 0 shown)
  dueDate?: string;       // yyyy-mm-dd
  acceptance?: string[];  // optional
  archived?: boolean;
};

type Scope = { k: string; emoji: string; title: string };

const SCOPES: Scope[] = [
  { k: 'roof',       emoji: '🏠', title: 'Roof Repair' },
  { k: 'windows',    emoji: '🪟', title: 'Windows & Doors' },
  { k: 'bath',       emoji: '🚿', title: 'Bathrooms' },
  { k: 'paint',      emoji: '🎨', title: 'Painting + Cleaning' },
  { k: 'electrical', emoji: '💡', title: 'Electrical' },
  { k: 'plumbing',   emoji: '🚰', title: 'Plumbing' },
  { k: 'floor',      emoji: '🧱', title: 'Flooring' },
  { k: 'safety',     emoji: '🧯', title: 'Safety' },
  { k: 'access',     emoji: '♿️', title: 'Accessibility' },
];

export default function TemplateRenovationHorizontal({
  milestonesInputName = 'milestonesJson',
}: {
  milestonesInputName?: string;
}) {
  // which scopes are selected
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // milestones list (editable)
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // toggle scope → if turning on and no milestone exists for it, add a first step for that scope
  function toggleScope(s: Scope) {
    setSelected((prev) => {
      const on = !prev[s.k];
      const next = { ...prev, [s.k]: on };
      if (on) {
        // Add a first milestone for this scope (editable title)
        setMilestones((ms) => [
          ...ms,
          {
            name: s.title, // editable later by vendor
            description: '',
            amount: undefined, // keep empty input (no prefilled 0)
            dueDate: '',       // date picker shows empty
            acceptance: [],
            archived: false,
          },
        ]);
      } else {
        // If you want to remove milestones tied to this scope automatically, you could filter by name.
        // For now we leave existing milestones intact when untoggling a scope.
      }
      return next;
    });
  }

  function addMilestone() {
    setMilestones((ms) => [
      ...ms,
      {
        name: '',          // empty, vendor can type any title (e.g., "Roof Repair – Phase 2")
        description: '',
        amount: undefined,
        dueDate: '',
        acceptance: [],
        archived: false,
      },
    ]);
  }

  function removeMilestone(idx: number) {
    setMilestones((ms) => ms.filter((_, i) => i !== idx));
  }

  function editMilestone<K extends keyof Milestone>(idx: number, key: K, value: Milestone[K]) {
    setMilestones((ms) => ms.map((m, i) => (i === idx ? { ...m, [key]: value } : m)));
  }

  const json = useMemo(() => JSON.stringify(milestones), [milestones]);

  // === UI ===
  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
      {/* BIG, HORIZONTAL SCOPE PICKER (no scroll; wraps) */}
      <div>
        <h2 className="text-base font-semibold mb-3">Select work scopes</h2>
        <div className="flex flex-wrap gap-3">
          {SCOPES.map((s) => {
            const active = !!selected[s.k];
            return (
              <button
                key={s.k}
                type="button"
                onClick={() => toggleScope(s)}
                className={[
                  'group w-[180px] h-[120px] rounded-2xl border shadow-sm flex flex-col items-center justify-center gap-2 transition',
                  active ? 'bg-cyan-50 border-cyan-300' : 'bg-white hover:bg-slate-50',
                ].join(' ')}
              >
                <span className="text-4xl leading-none">{s.emoji}</span>
                <span
                  className={[
                    'text-sm font-medium',
                    active ? 'text-cyan-800' : 'text-slate-800 group-hover:text-cyan-700',
                  ].join(' ')}
                >
                  {s.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MILESTONES LIST — visible without horizontal scroll (wrap as grid) */}
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Milestones</h2>
          {/* ORANGE "Add Milestone" button (as requested) */}
          <button
            type="button"
            onClick={addMilestone}
            className="rounded-xl bg-orange-500 text-white px-3 py-2 text-sm hover:bg-orange-600"
          >
            Add Milestone
          </button>
        </div>

        {/* make cards wrap into rows, no horizontal scrolling */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {milestones.map((m, i) => (
            <div key={i} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Step {i + 1}</div>

              {/* Editable title */}
              <label className="block text-sm mt-1">
                <span className="text-slate-700">Title</span>
                <input
                  type="text"
                  className="mt-1 w-full border rounded-md px-2 py-1"
                  placeholder="e.g., Roof Repair"
                  value={m.name}
                  onChange={(e) => editMilestone(i, 'name', e.target.value)}
                />
              </label>

              {/* Editable description */}
              <label className="block text-sm mt-2">
                <span className="text-slate-700">Description</span>
                <textarea
                  className="mt-1 w-full border rounded-md px-2 py-1"
                  rows={3}
                  placeholder="Describe the work for this milestone…"
                  value={m.description || ''}
                  onChange={(e) => editMilestone(i, 'description', e.target.value)}
                />
              </label>

              {/* Amount + Date (no default 0) */}
              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <label>
                  <span className="text-slate-700">Amount (USD)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full border rounded-md px-2 py-1"
                    placeholder="" // keep empty, no "0"
                    value={m.amount === undefined || Number.isNaN(m.amount) ? '' : String(m.amount)}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      editMilestone(i, 'amount', v === '' ? undefined : Number(v));
                    }}
                  />
                </label>
                <label>
                  <span className="text-slate-700">Date</span>
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-md px-2 py-1"
                    value={m.dueDate || ''}
                    onChange={(e) => editMilestone(i, 'dueDate', e.target.value)}
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50"
                  onClick={() => removeMilestone(i)}
                >
                  Delete
                </button>
                <span className="text-xs text-slate-500">Step total shown on submit</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Serialize milestones for the server action */}
      <input type="hidden" name={milestonesInputName} value={json} readOnly />
    </section>
  );
}
