'use client';

import React, { useMemo, useState } from 'react';
import FileUploader from '@/app/templates/[id]/FileUploader'; // ✅ correct path

type Milestone = {
  name: string;
  amount: number;
  dueDate: string; // ISO date (YYYY-MM-DD or full ISO)
  acceptance?: string[];
  archived?: boolean;
};

type Props = {
  /** Hidden input name that this widget writes the milestones JSON into */
  hiddenFieldName?: string;
  /** Pass a custom API base to the FileUploader if needed */
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
  // selected scopes
  const [sel, setSel] = useState<Record<string, boolean>>({});

  // editable milestones (vendor sets amount + date)
  const [milestones, setMilestones] = useState<Milestone[]>(
    SUGGESTED.map((m) => ({
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
      // Optional: when a scope is turned on, add one blank milestone for it.
      if (!p[key]) {
        setMilestones((ms) => [
          ...ms,
          { name: label, amount: 0, dueDate: '', acceptance: [], archived: false },
        ]);
      } else {
        // turning off: do NOT delete user-entered milestones; keep explicit deletions manual
      }
      return next;
    });
  }

  function updateMilestone(i: number, patch: Partial<Milestone>) {
    setMilestones((ms) => {
      const copy = ms.slice();
      copy[i] = { ...copy[i], ...patch };
      return copy;
    });
  }

  function addMilestone() {
    setMilestones((ms) => [
      ...ms,
      { name: 'New milestone', amount: 0, dueDate: '', acceptance: [], archived: false },
    ]);
  }

  function deleteMilestone(i: number) {
    setMilestones((ms) => ms.filter((_, idx) => idx !== i));
  }

  const total = milestones.reduce((a, m) => a + (Number(m.amount) || 0), 0);

  return (
    <section className="space-y-6">
      {/* 1) BIG EMOJI SCOPE STRIP (horizontal) */}
      <div className="rounded-2xl border bg-white shadow-sm p-4">
        <h3 className="text-base font-semibold mb-3">Select work scopes</h3>
        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
          {SCOPES.map((s) => {
            const active = !!sel[s.k];
            return (
              <button
                key={s.k}
                type="button"
                onClick={() => toggleScope(s.k, s.t)}
                className={[
                  'group shrink-0 w-[180px] h-[120px] rounded-2xl border bg-white shadow-sm flex flex-col items-center justify-center gap-2 transition',
                  active ? 'ring-2 ring-cyan-600/40 bg-cyan-50/40' : 'hover:bg-slate-50 hover:shadow',
                ].join(' ')}
              >
                <span className="text-4xl leading-none">{s.e}</span>
                <span className={['text-sm font-medium', active ? 'text-cyan-700' : 'text-slate-800 group-hover:text-cyan-700'].join(' ')}>
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
          <button type="button" onClick={addMilestone} className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
            + Add milestone
          </button>
        </div>

        <div className="mt-4 flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {milestones.map((m, i) => (
            <div key={i} className="shrink-0 w-[360px] rounded-2xl border bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Step {i + 1}</div>
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
                <label>Amount (USD)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="mt-1 w-full border rounded-md px-2 py-1"
                    value={m.amount}
                    onChange={(e) => updateMilestone(i, { amount: Number(e.target.value || 0) })}
                  />
                </label>
                <label>Date
                  <input
                    type="date"
                    className="mt-1 w-full border rounded-md px-2 py-1"
                    value={m.dueDate ? m.dueDate.slice(0, 10) : ''}
                    onChange={(e) => {
                      const d = e.target.value; // yyyy-mm-dd
                      updateMilestone(i, { dueDate: d ? new Date(d).toISOString() : '' });
                    }}
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button type="button" className="text-xs rounded-lg border px-2 py-1 hover:bg-slate-50" onClick={() => deleteMilestone(i)}>
                  Delete
                </button>
                <span className="text-xs text-slate-500">Amount now: ${Number(m.amount || 0).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Hidden field consumed by the page's server action */}
        <input type="hidden" name={hiddenFieldName} value={json} readOnly />
        <div className="mt-3 text-sm text-slate-700">
          <span className="font-medium">Total (USD):</span>{' '}
          {total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* 3) Optional attachments (writes filesJson) */}
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
