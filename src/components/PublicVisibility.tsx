'use client';
import { useState } from 'react';

export function PublicVisibility({
  initialEnabled,
  slug,
  onSave,
}: {
  initialEnabled: boolean;
  slug?: string | null;
  onSave: (payload: { public_enabled: boolean; public_slug?: string | null }) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(!!initialEnabled);
  const [value, setValue] = useState(slug || '');

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="font-medium">Public project page enabled</span>
      </label>
      <div className="text-sm text-gray-600">
        URL will be <code>/public/{value || '<slug>'}</code>
      </div>
      <input
        className="w-full border rounded px-3 py-2 text-sm"
        placeholder="my-awesome-grant"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\s+/g, '-').toLowerCase())}
        disabled={!enabled}
      />
      <button
        onClick={() => onSave({ public_enabled: enabled, public_slug: enabled ? value : null })}
        className="px-3 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        disabled={enabled && !value}
      >
        Save
      </button>
    </div>
  );
}
