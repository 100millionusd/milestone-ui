'use client';

import React, { useMemo, useState } from 'react';

type Milestone = {
  id: string;
  name: string;          // editable title
  description: string;   // editable free text
  amount: string;        // keep empty placeholder, no default 0
  dueDate: string;       // yyyy-mm-dd
  scope?: string;        // which emoji/scope created it
};

const SCOPES: Array<{key:string; emoji:string; title:string}> = [
  { key: 'roof',       emoji: '🏠', title: 'Roof Repair' },
  { key: 'windows',    emoji: '🪟', title: 'Windows & Doors' },
  { key: 'bath',       emoji: '🚿', title: 'Bathrooms' },
  { key: 'paint',      emoji: '🎨', title: 'Painting + Cleaning' },
  { key: 'electrical', emoji: '💡', title: 'Electrical' },
  { key: 'plumbing',   emoji: '🚰', title: 'Plumbing' },
  { key: 'floor',      emoji: '🧱', title: 'Flooring' },
  { key: 'safety',     emoji: '🧯', title: 'Safety' },
  { key: 'access',     emoji: '♿️', title: 'Accessibility' },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function TemplateRenovationHorizontal(props: { milestonesInputName?: string }) {
  const inputName = props.milestonesInputName || 'milestonesJson';
  const [items, setItems] = useState<Milestone[]>([]);

  // Add one milestone from a scope button
  const addFromScope = (s: {key:string; title:string}) => {
    setItems(list => [
      ...list,
      {
        id: uid(),
        name: s.title,       // editable title right away
        description: '',     // user writes what will be done
        amount: '',          // no 0 default
        dueDate: '',         // vendor picks a date
        scope: s.key,
      },
    ]);
  };

  // Add a blank milestone
  const addBlank = () => {
    setItems(list => [
      ...list,
      { id: uid(), name: 'Milestone', description: '', amount: '', dueDate: '' },
    ]);
  };

  const remove = (id: string) => setItems(list => list.filter(x => x.id !== id));

  const update = (id: string, patch: Partial<Milestone>) =>
    setItems(list => list.map(x => (x.id === id ? { ...x, ...patch } : x)));

  // Export only fields the server expects (plus description is fine to send)
  const exportJson = useMemo(() => {
    const out = items.map((m, i) => ({
      name: m.name || `Step ${i + 1}`,
      amount: Number.isFinite(Number(m.amount)) && m.amount !== '' ? Number(m.amount) : 0,
      dueDate: m.dueDate ? new Date(m.dueDate).toISOString() : new Date().toISOString(),
      acceptance: [],   // no static bullets
      archived: false,
      description: m.description || '', // harmless extra for server; ignored if unused
    }));
    return JSON.stringify(out);
  }, [items]);

  return (
    <div className="space-y-4">
      {/* BIG horizontal emoji scopes row (no scrolling needed) */}
      <div className="rounded-2xl border bg-white shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Select work scopes</h2>
          <button
            type="button"
            onClick={addBlank}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
          >
            + Add milestone
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {SCOPES.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => addFromScope(s)}
              className="w-[180px] h-[120px] rounded-2xl border bg-white hover:bg-slate-50 shadow-sm flex flex-col items-center justify-center gap-2 hover:shadow transition"
            >
              <span className="text-4xl leading-none">{s.emoji}</span>
              <span className="text-sm font-medium text-slate-800">{s.title}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Milestones grid (all visible, no horizontal scroll) */}
      <div className="rounded-2xl border bg-white shadow-sm p-4">
        <h3 className="text-base font-semibold mb-3">Milestones (editable)</h3>

        {items.length === 0 ? (
          <div className="text-sm text-slate-500">Choose a scope above or add a blank milestone.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((m, idx) => (
              <div key={m.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-slate-500">Step {idx + 1}</div>

                {/* Editable title */}
                <label className="text-sm block mt-1">
                  <span className="block mb-1">Title</span>
                  <input
                    className="w-full border rounded-md px-3 py-2"
                    value={m.name}
                    onChange={e => update(m.id, { name: e.target.value })}
                    placeholder="e.g., Roof Repair"
                  />
                </label>

                {/* Editable description */}
                <label className="text-sm block mt-3">
                  <span className="block mb-1">Description (what you will do)</span>
                  <textarea
                    className="w-full border rounded-md px-3 py-2"
                    value={m.description}
                    onChange={e => update(m.id, { description: e.target.value })}
                    placeholder="Describe the work for this milestone…"
                    rows={3}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <label>Amount (USD)
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="mt-1 w-full border rounded-md px-2 py-1"
                      value={m.amount}
                      onChange={e => update(m.id, { amount: e.target.value })}
                      placeholder=""
                    />
                  </label>
                  <label>Date
                    <input
                      type="date"
                      className="mt-1 w-full border rounded-md px-2 py-1"
                      value={m.dueDate}
                      onChange={e => update(m.id, { dueDate: e.target.value })}
                    />
                  </label>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50"
                    onClick={() => remove(m.id)}
                  >
                    Delete
                  </button>
                  <span className="text-xs text-slate-500">Editable step</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Hidden field consumed by the form */}
        <input type="hidden" name={inputName} value={exportJson} readOnly />
      </div>
    </div>
  );
}
