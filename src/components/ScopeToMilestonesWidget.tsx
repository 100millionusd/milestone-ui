'use client';

import React, { useMemo, useState } from 'react';

type Milestone = {
  name: string;
  amount: number;
  dueDate: string;      // ISO yyyy-mm-dd from <input type="date">
  acceptance?: string[];
  archived?: boolean;
};

type Scope = {
  key: string;
  emoji: string;
  name: string;
  defaultAcceptance: string[];
};

const SCOPES: Scope[] = [
  { key: 'roof',       emoji: '🏠', name: 'Roof Repair',                         defaultAcceptance: ['No leaks after 48h rain', 'Working gutters/downspouts'] },
  { key: 'windows',    emoji: '🪟', name: 'Windows & Doors',                     defaultAcceptance: ['Smooth closing & sealed', 'Before/after photos uploaded'] },
  { key: 'bath',       emoji: '🚿', name: 'Bathrooms (Plumbing & Fixtures)',     defaultAcceptance: ['Pressure test no leaks', 'Ventilation working'] },
  { key: 'paint',      emoji: '🎨', name: 'Painting + Final Cleaning',           defaultAcceptance: ['Uniform coverage (1.5 m)', 'Classrooms clean & ready'] },
  { key: 'electrical', emoji: '💡', name: 'Electrical (panel, outlets, lights)', defaultAcceptance: ['Load test OK', 'Lighting operational'] },
  { key: 'plumbing',   emoji: '🚰', name: 'Plumbing (pipes, fittings)',          defaultAcceptance: ['No visible leaks', 'Pressure within range'] },
  { key: 'floor',      emoji: '🧱', name: 'Flooring (repair/replace)',           defaultAcceptance: ['Level & safe surface', 'Waste disposed properly'] },
  { key: 'safety',     emoji: '🧯', name: 'Safety (extinguishers, signage)',     defaultAcceptance: ['Extinguishers dated', 'Emergency signage visible'] },
  { key: 'access',     emoji: '♿️', name: 'Accessibility (ramps, rails)',        defaultAcceptance: ['Ramps slope compliant', 'Rails firmly installed'] },
];

type ScopeState = {
  selected: boolean;
  milestones: Milestone[]; // vendor-defined milestones for this scope
};

function isoTodayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // yyyy-mm-dd
}

export default function ScopeToMilestonesWidget() {
  // init empty selections
  const [sel, setSel] = useState<Record<string, ScopeState>>(
    () =>
      Object.fromEntries(
        SCOPES.map((s) => [
          s.key,
          { selected: false, milestones: [] as Milestone[] },
        ])
      ) as Record<string, ScopeState>
  );

  // Aggregate all milestones (ordered by scope order then entry order)
  const allMilestones: Milestone[] = useMemo(() => {
    const out: Milestone[] = [];
    for (const s of SCOPES) {
      const st = sel[s.key];
      if (!st?.selected) continue;
      for (const m of st.milestones) out.push(m);
    }
    return out;
  }, [sel]);

  const total = allMilestones.reduce((a, m) => a + (Number(m.amount) || 0), 0);
  const json = useMemo(() => JSON.stringify(allMilestones), [allMilestones]);

  function toggleScope(key: string) {
    setSel((p) => {
      const curr = p[key];
      const nextSelected = !curr.selected;
      // if turning on and no milestones yet, seed with 3 phases
      const seeded =
        nextSelected && curr.milestones.length === 0
          ? seedThreePhases(key)
          : curr.milestones;
      return { ...p, [key]: { selected: nextSelected, milestones: seeded } };
    });
  }

  function seedThreePhases(scopeKey: string): Milestone[] {
    const s = SCOPES.find((x) => x.key === scopeKey)!;
    const base = s.name;
    // amounts are 0 by design; vendors type numbers
    return [
      {
        name: `${base} — Planning & Materials`,
        amount: 0,
        dueDate: isoTodayPlus(7),
        acceptance: ['Materials list approved', 'Schedule agreed'],
        archived: false,
      },
      {
        name: `${base} — Installation`,
        amount: 0,
        dueDate: isoTodayPlus(30),
        acceptance: s.defaultAcceptance,
        archived: false,
      },
      {
        name: `${base} — Finishing & Handover`,
        amount: 0,
        dueDate: isoTodayPlus(45),
        acceptance: ['Handover signed', 'Area clean & ready'],
        archived: false,
      },
    ];
  }

  function addMilestone(scopeKey: string) {
    setSel((p) => {
      const s = SCOPES.find((x) => x.key === scopeKey)!;
      const curr = p[scopeKey];
      const idx = curr.milestones.length + 1;
      const next: Milestone = {
        name: `${s.name} — Extra ${idx}`,
        amount: 0,
        dueDate: isoTodayPlus(60 + idx * 7),
        acceptance: [],
        archived: false,
      };
      return { ...p, [scopeKey]: { ...curr, milestones: [...curr.milestones, next] } };
    });
  }

  function removeMilestone(scopeKey: string, index: number) {
    setSel((p) => {
      const curr = p[scopeKey];
      const next = curr.milestones.filter((_, i) => i !== index);
      return { ...p, [scopeKey]: { ...curr, milestones: next } };
    });
  }

  function updateMilestone(
    scopeKey: string,
    index: number,
    patch: Partial<Milestone>
  ) {
    setSel((p) => {
      const curr = p[scopeKey];
      const next = curr.milestones.map((m, i) => (i === index ? { ...m, ...patch } : m));
      return { ...p, [scopeKey]: { ...curr, milestones: next } };
    });
  }

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold">Select work scopes</h3>
      <p className="text-sm text-slate-600">Click emojis, then set **amount** and **date** per milestone.</p>

      {/* Emoji scope chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {SCOPES.map((s) => {
          const active = sel[s.key]?.selected;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleScope(s.key)}
              className={
                'px-3 py-2 rounded-xl text-sm border transition ' +
                (active
                  ? 'bg-cyan-600 text-white border-cyan-600'
                  : 'bg-white hover:bg-slate-50 border-slate-200')
              }
              aria-pressed={active}
            >
              <span className="mr-1">{s.emoji}</span>
              {s.name}
            </button>
          );
        })}
      </div>

      {/* Per-scope editable milestones */}
      <div className="mt-4 space-y-4">
        {SCOPES.map((s) => {
          const st = sel[s.key];
          if (!st?.selected) return null;
          return (
            <div key={s.key} className="rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">{s.emoji} {s.name}</div>
                <button
                  type="button"
                  onClick={() => addMilestone(s.key)}
                  className="text-sm rounded-lg border px-2 py-1 hover:bg-slate-50"
                >
                  + Add milestone
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {st.milestones.map((m, i) => (
                  <div key={i} className="rounded-lg border p-3">
                    <div className="grid md:grid-cols-4 gap-2">
                      <label className="md:col-span-2 text-sm">
                        Title
                        <input
                          className="mt-1 w-full border rounded-md px-2 py-1"
                          value={m.name}
                          onChange={(e) =>
                            updateMilestone(s.key, i, { name: e.target.value })
                          }
                        />
                      </label>

                      <label className="text-sm">
                        Amount (USD)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="mt-1 w-full border rounded-md px-2 py-1"
                          value={m.amount}
                          onChange={(e) =>
                            updateMilestone(s.key, i, {
                              amount: Math.max(0, Number(e.target.value || 0)),
                            })
                          }
                        />
                      </label>

                      <label className="text-sm">
                        Date
                        <input
                          type="date"
                          className="mt-1 w-full border rounded-md px-2 py-1"
                          value={m.dueDate}
                          onChange={(e) =>
                            updateMilestone(s.key, i, { dueDate: e.target.value })
                          }
                        />
                      </label>
                    </div>

                    <div className="mt-2 flex justify-between">
                      <div className="text-xs text-slate-500">
                        {m.acceptance && m.acceptance.length > 0 ? (
                          <ul className="list-disc pl-5">
                            {m.acceptance.map((a, k) => (
                              <li key={k}>{a}</li>
                            ))}
                          </ul>
                        ) : (
                          <span>No acceptance notes</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50"
                        onClick={() => removeMilestone(s.key, i)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Hidden payload for the form submit */}
      <input type="hidden" name="milestonesJson" value={json} readOnly />

      {/* Total */}
      <div className="mt-4 text-sm">
        <span className="font-medium">Total (USD):</span>{' '}
        {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
