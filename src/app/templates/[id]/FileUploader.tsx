'use client';

import React, { useMemo, useState } from 'react';

type Uploaded = { url: string; name?: string };

export default function FileUploader({ apiBase = '' }: { apiBase?: string }) {
  const [files, setFiles] = useState<Uploaded[]>([]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || !list.length) return;

    const next: Uploaded[] = [];
    for (const f of Array.from(list)) {
      // your Next API route already exists at /api/proofs/upload (from your codebase)
      const fd = new FormData();
      fd.append('files', f, f.name);

      const res = await fetch(`/api/proofs/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        // soft fail; keep iterating
        continue;
      }
      const json = await res.json().catch(() => ({}));
      const uploads = Array.isArray(json?.uploads) ? json.uploads : [];
      // Each upload: { cid, url, name }
      for (const u of uploads) {
        const url = String(u?.url || '');
        const name = String(u?.name || f.name || 'file');
        if (url) next.push({ url, name });
      }
    }
    if (next.length) setFiles((prev) => [...prev, ...next]);
    // reset picker
    e.target.value = '';
  }

  const json = useMemo(() => JSON.stringify(files), [files]);

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Attachments</div>
        <label className="text-sm rounded-lg border px-3 py-1.5 hover:bg-slate-50 cursor-pointer">
          Attach files
          <input type="file" multiple className="hidden" onChange={onPick} />
        </label>
      </div>

      {!!files.length && (
        <ul className="mt-3 text-sm flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li key={`${f.url}-${i}`} className="px-2 py-1 rounded-full border">
              {f.name || `file-${i + 1}`}
            </li>
          ))}
        </ul>
      )}

      {/* IMPORTANT: serialize as objects {url,name} */}
      <input type="hidden" name="filesJson" value={json} readOnly />
    </div>
  );
}
