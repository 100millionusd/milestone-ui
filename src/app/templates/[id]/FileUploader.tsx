'use client';

import React, { useMemo, useRef, useState } from 'react';

type FileItem = {
  url: string;
  name?: string;
  mimetype?: string;
  size?: number;
};

type Props = {
  apiBase: string;                 // e.g. process.env.NEXT_PUBLIC_API_BASE
  inputName?: string;              // hidden field name (default: "filesJson")
  buttonText?: string;             // default: "Attach files"
  className?: string;
};

/**
 * Template FileUploader
 * - Uploads to `${apiBase}/ipfs/upload-file` (multipart)
 * - Renders a removable list
 * - Writes JSON string to a hidden input (name = inputName, default "filesJson")
 */
export default function FileUploader({
  apiBase,
  inputName = 'filesJson',
  buttonText = 'Attach files',
  className = '',
}: Props) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const json = useMemo(() => JSON.stringify(items), [items]);

  async function uploadOne(file: File): Promise<FileItem | null> {
    if (!apiBase) return null;
    const endpoint = `${apiBase.replace(/\/+$/, '')}/ipfs/upload-file`;

    const fd = new FormData();
    fd.append('file', file, file.name);

    const res = await fetch(endpoint, {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    const data = await res.json().catch(() => ({}));

    // Accept a few common shapes
    const url: string =
      data?.url || data?.ipfsUrl || data?.gatewayUrl || data?.cid || '';

    if (!url) return null;

    return {
      url,
      name: data?.name || file.name,
      mimetype: data?.mimetype || file.type,
      size: file.size,
    };
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setBusy(true);
    try {
      const uploaded: FileItem[] = [];
      for (const f of files) {
        const one = await uploadOne(f).catch(() => null);
        if (one) uploaded.push(one);
      }
      if (uploaded.length) {
        setItems((prev) => [...prev, ...uploaded]);
      }
    } finally {
      // allow picking the same file again if removed
      if (inputRef.current) inputRef.current.value = '';
      setBusy(false);
    }
  }

  function removeAt(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 ${className}`}>
      <h3 className="text-base font-semibold mb-2">Attachments</h3>

      {/* Hidden JSON for the server action */}
      <input type="hidden" name={inputName} value={json} readOnly />

      {/* Actions row */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          {items.length ? (
            <span>{items.length} file{items.length > 1 ? 's' : ''} attached</span>
          ) : (
            <span>No files attached yet</span>
          )}
        </div>

        <label className="inline-flex items-center rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
          {busy ? 'Uploading…' : buttonText}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onPick}
            disabled={busy}
          />
        </label>
      </div>

      {/* Files list with remove buttons */}
      {items.length > 0 && (
        <ul className="mt-3 divide-y rounded-lg border">
          {items.map((f, i) => (
            <li key={`${f.url}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-sm text-cyan-700 hover:underline"
                  title={f.url}
                >
                  {f.name || `file-${i + 1}`}
                </a>
                {f.mimetype ? (
                  <span className="ml-2 text-xs text-slate-500">{f.mimetype}</span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="text-xs rounded-full px-2 py-1 border hover:bg-slate-50"
                aria-label={`Remove ${f.name || `file-${i + 1}`}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
