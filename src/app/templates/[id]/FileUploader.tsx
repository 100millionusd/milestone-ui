'use client';

import React, { useMemo, useRef, useState } from 'react';

type Uploaded = { url: string; name?: string };

export default function FileUploader({ apiBase = '' }: { apiBase?: string }) {
  const [files, setFiles] = useState<Uploaded[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list || !list.length) return;

    const next: Uploaded[] = [];
    for (const f of Array.from(list)) {
      // Your existing Next API route
      const fd = new FormData();
      fd.append('files', f, f.name);

      const res = await fetch(`/api/proofs/upload`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });

      if (!res.ok) continue;

      const json = await res.json().catch(() => ({}));
      const uploads = Array.isArray(json?.uploads) ? json.uploads : [];

      for (const u of uploads) {
        const url = String(u?.url || '');
        const name = String(u?.name || f.name || 'file');
        if (url) next.push({ url, name });
      }
    }

    if (next.length) setFiles((prev) => [...prev, ...next]);

    // reset picker so the same file can be picked again if needed
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeAt(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const json = useMemo(() => JSON.stringify(files), [files]);

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Attachments</div>

        {/* Visible, colored button that still opens the hidden input */}
        <label className="inline-flex items-center rounded-lg bg-cyan-600 text-white px-3 py-1.5 text-sm hover:bg-cyan-700 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600">
          Attach files
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onPick}
          />
        </label>
      </div>

      {!!files.length && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {files.map((f, i) => (
            <li
              key={`${f.url}-${i}`}
              className="flex items-center gap-2 px-2 py-1 rounded-full border"
            >
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
                title={f.name || `file-${i + 1}`}
              >
                {f.name || `file-${i + 1}`}
              </a>

              {/* remove one */}
              <button
                type="button"
                aria-label={`Remove ${f.name || `file ${i + 1}`}`}
                onClick={() => removeAt(i)}
                className="rounded-full border px-1.5 leading-none text-xs hover:bg-red-50 hover:text-red-600"
                title="Remove"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* IMPORTANT: serialize as array of objects {url,name} */}
      <input type="hidden" name="filesJson" value={json} readOnly />
    </div>
  );
}
