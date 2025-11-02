// src/components/TemplateRenovationHorizontal.tsx
"use client";

import React, { useMemo, useState } from "react";

type Milestone = {
  name: string;
  amount: number;
  dueDate: string; // ISO
  acceptance?: string[];
  archived?: boolean;
};

type ScopeDef = {
  key: string;
  emoji: string;
  title: string;
  acceptance: string[];
};

const SCOPES: ScopeDef[] = [
  { key: "roof", emoji: "🏠", title: "Roof Repair", acceptance: ["No leaks after 48h rain", "Working gutters/downspouts"] },
  { key: "windows", emoji: "🪟", title: "Windows & Doors", acceptance: ["Smooth closing & sealed", "Before/after photos uploaded"] },
  { key: "bath", emoji: "🚿", title: "Bathrooms", acceptance: ["Pressure test no leaks", "Ventilation working"] },
  { key: "paint", emoji: "🎨", title: "Painting + Cleaning", acceptance: ["Uniform coverage (1.5 m)", "Classrooms clean & ready"] },
  { key: "electrical", emoji: "💡", title: "Electrical", acceptance: ["Panel labeled", "Safety test passed"] },
  { key: "plumbing", emoji: "🚰", title: "Plumbing", acceptance: ["No visible leaks", "Fixtures working"] },
  { key: "floor", emoji: "🧱", title: "Flooring", acceptance: ["Level & secure", "Trim/edges clean"] },
  { key: "safety", emoji: "🧯", title: "Safety", acceptance: ["Extinguishers in place", "Signage installed"] },
  { key: "access", emoji: "♿️", title: "Accessibility", acceptance: ["Ramps & handrails", "Door widths verified"] },
];

export default function TemplateRenovationHorizontal(props: {
  milestonesInputName?: string; // defaults to "milestonesJson"
}) {
  const name = props.milestonesInputName || "milestonesJson";

  // Selected scopes -> milestone cards
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [cards, setCards] = useState<Milestone[]>([]);

  function toggleScope(s: ScopeDef) {
    const isOn = !!selected[s.key];
    if (isOn) {
      // remove card with this title
      setCards((old) => old.filter((c) => c.name !== s.title));
    } else {
      // add card with default acceptance, empty amount/date
      setCards((old) => [
        ...old,
        {
          name: s.title,
          amount: 0,
          dueDate: "", // vendor will select
          acceptance: s.acceptance,
          archived: false,
        },
      ]);
    }
    setSelected((old) => ({ ...old, [s.key]: !isOn }));
  }

  function updateCard(idx: number, patch: Partial<Milestone>) {
    setCards((old) => old.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeCard(idx: number) {
    const title = cards[idx]?.name;
    setCards((old) => old.filter((_, i) => i !== idx));
    if (title) {
      // also untoggle the scope if it maps 1:1
      const key = SCOPES.find((s) => s.title === title)?.key;
      if (key) setSelected((o) => ({ ...o, [key]: false }));
    }
  }

  function addCustom() {
    const n = cards.length + 1;
    setCards((old) => [
      ...old,
      {
        name: `Custom Milestone ${n}`,
        amount: 0,
        dueDate: "",
        acceptance: [],
        archived: false,
      },
    ]);
  }

  // Serialize for the form
  const json = useMemo(() => JSON.stringify(cards), [cards]);

  return (
    <section className="space-y-4">
      {/* 1) Horizontal scope chooser (no scrolling; it wraps) */}
      <div className="rounded-2xl border bg-white p-4">
        <h2 className="text-base font-semibold mb-3">Select work scopes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {SCOPES.map((s) => {
            const active = !!selected[s.key];
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleScope(s)}
                className={`group rounded-2xl border shadow-sm px-3 py-4 flex flex-col items-center justify-center gap-2 transition ${
                  active ? "ring-2 ring-cyan-600 border-cyan-600" : "hover:bg-slate-50"
                }`}
              >
                <span className="text-4xl leading-none">{s.emoji}</span>
                <span className={`text-sm font-medium ${active ? "text-cyan-700" : "text-slate-800"}`}>
                  {s.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2) Milestones — grid, visible (no scroll) */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Milestones (enter amount & date)</h3>
          <button type="button" onClick={addCustom} className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
            + Add milestone
          </button>
        </div>

        {cards.length === 0 ? (
          <div className="text-sm text-slate-500 mt-3">
            Select one or more scopes above to create milestones, then set the payment **Amount** and **Date** per milestone.
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((m, idx) => (
            <div key={idx} className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Step {idx + 1}</div>
              <div className="text-lg font-semibold mt-0.5">{m.name}</div>

              {m.acceptance && m.acceptance.length > 0 ? (
                <ul className="mt-2 text-sm text-slate-700 list-disc pl-5 space-y-1">
                  {m.acceptance.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              ) : null}

              <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                <label>
                  Amount (USD)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full border rounded-md px-2 py-1"
                    value={Number.isFinite(m.amount) ? m.amount : 0}
                    onChange={(e) => updateCard(idx, { amount: Number(e.target.value || 0) })}
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-md px-2 py-1"
                    value={m.dueDate ? m.dueDate.slice(0, 10) : ""}
                    onChange={(e) => {
                      const d = e.target.value ? new Date(e.target.value + "T00:00:00") : null;
                      updateCard(idx, { dueDate: d ? d.toISOString() : "" });
                    }}
                  />
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => removeCard(idx)}
                  className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50"
                >
                  Delete
                </button>
                <span className="text-xs text-slate-500">Suggested: $0 • ETA: +d</span>
              </div>
            </div>
          ))}
        </div>

        {/* Hidden field the page's server action reads */}
        <input type="hidden" name={name} value={json} readOnly />
      </div>
    </section>
  );
}
