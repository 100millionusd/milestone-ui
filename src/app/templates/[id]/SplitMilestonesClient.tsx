'use client';

import React, { useMemo, useState } from 'react';

type TMs = { idx: number; name: string; amount: number; days_offset: number; acceptance?: string[] };
type Props = { templateMilestones: TMs[] };

export default function SplitMilestonesClient({ templateMilestones }: Props) {
  // splitMode: none = use template as-is; tri = 20/60/20; equal = N equal parts
  const [mode, setMode] = useState<'none' | 'tri' | 'equal'>('none');
  const [equalN, setEqualN] = useState<number>(3); // default 3 equal parts per template milestone

  const milestones = useMemo(() => {
    const out: Array<{ name: string; amount: number; dueDate: string; acceptance?: string[]; archived?: boolean }> = [];
    const now = Date.now();

    for (const tm of templateMilestones) {
      const total = Number(tm.amount) || 0;
      const days = Math.max(0, Number(tm.days_offset) || 0);
      const baseName = tm.name;

      if (mode === 'none') {
        out.push({
          name: baseName,
          amount: total,
          dueDate: new Date(now + days * 86400 * 1000).toISOString(),
          acceptance: tm.acceptance || [],
          archived: false,
        });
        continue;
      }

      if (mode === 'tri') {
        // 20/60/20 phases along the original ETA
        const pct = [0.2, 0.6, 0.2];
        const labels = ['Planificación y compra', 'Instalación', 'Acabados y entrega'];
        const dayMarks = [0.2, 0.8, 1.0]; // position each phase across ETA
        const accepts = [
          ['Lista de materiales aprobada', 'Cronograma acordado'],
          ['Instalación realizada y sellos aplicados', 'Fotos de avance subidas'],
          ['Prueba de cierre/sellado', 'Área limpia y lista'],
        ];

        pct.forEach((p, i) => {
          out.push({
            name: `${baseName} — ${labels[i]}`,
            amount: Math.round(total * p * 100) / 100,
            dueDate: new Date(now + Math.max(1, Math.round(days * dayMarks[i])) * 86400 * 1000).toISOString(),
            acceptance: accepts[i],
            archived: false,
          });
        });
        continue;
      }

      if (mode === 'equal') {
        const n = Math.max(1, Math.floor(equalN));
        const slice = Math.round((total / n) * 100) / 100;
        for (let i = 0; i < n; i++) {
          out.push({
            name: `${baseName} — Parte ${i + 1}/${n}`,
            amount: i === n - 1 ? Math.round((total - slice * (n - 1)) * 100) / 100 : slice, // last gets remainder
            dueDate: new Date(now + Math.max(1, Math.round((days * (i + 1)) / n)) * 86400 * 1000).toISOString(),
            acceptance: i === n - 1 ? (tm.acceptance || []) : ['Avance verificado'],
            archived: false,
          });
        }
        continue;
      }
    }
    return out;
  }, [templateMilestones, mode, equalN]);

  const milestonesJson = useMemo(() => JSON.stringify(milestones), [milestones]);
  const total = milestones.reduce((a, m) => a + (Number(m.amount) || 0), 0);

  return (
    <div className="rounded-xl border p-4">
      <h2 className="text-base font-semibold mb-2">Cómo dividir los pagos</h2>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="radio" name="splitMode" value="none" checked={mode === 'none'} onChange={() => setMode('none')} />
          <span>Usar tal cual (de plantilla)</span>
        </label>

        <label className="inline-flex items-center gap-2">
          <input type="radio" name="splitMode" value="tri" checked={mode === 'tri'} onChange={() => setMode('tri')} />
          <span>3 fases 20/60/20</span>
        </label>

        <label className="inline-flex items-center gap-2">
          <input type="radio" name="splitMode" value="equal" checked={mode === 'equal'} onChange={() => setMode('equal')} />
          <span>Partes iguales</span>
        </label>

        {mode === 'equal' && (
          <label className="inline-flex items-center gap-2">
            <span>N° partes</span>
            <input
              type="number"
              min={2}
              className="w-16 border rounded px-2 py-1"
              value={equalN}
              onChange={(e) => setEqualN(Math.max(2, Math.floor(Number(e.target.value || 2))))}
            />
          </label>
        )}
      </div>

      {/* Inject into the SAME <form> */}
      <input type="hidden" name="milestonesJson" value={milestonesJson} readOnly />

      <div className="mt-3 text-sm text-gray-700">
        <span className="font-medium">Total (suma de hitos):</span> {total.toLocaleString('es-BO')}
      </div>

      {milestones.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {milestones.map((m, i) => (
            <li key={i} className="rounded-md border p-2">
              <div className="font-medium">{m.name}</div>
              <div className="text-gray-600">Monto: {m.amount.toLocaleString('es-BO')} • Vencimiento: {new Date(m.dueDate).toLocaleDateString('es-BO')}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
