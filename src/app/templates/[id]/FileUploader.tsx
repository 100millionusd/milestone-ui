'use client';

import { useState } from 'react';

export default function FileUploader({ apiBase }: { apiBase: string }) {
  const [urls, setUrls] = useState<string[]>([]);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files || []);
    const out: string[] = [];
    for (const f of list) {
      const fd = new FormData();
      // @ts-ignore
      fd.append('file', f);
      const r = await fetch(`${apiBase}/ipfs/upload-file`, { method: 'POST', body: fd, credentials: 'include' });
      const j = await r.json();

      // Normalize common keys from your IPFS route
      const u = j.url || j.gatewayUrl || (j.IpfsHash ? `ipfs://${j.IpfsHash}` : j.ipfs) || '';
      if (u) out.push(u);
    }
    const next = [...urls, ...out];
    setUrls(next);

    // write to hidden input for server action
    const hidden = document.querySelector<HTMLInputElement>('input[name="filesJson"]');
    if (hidden) hidden.value = JSON.stringify(next);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Attachments (optional)</label>
      <input type="file" multiple onChange={onChange} />
      {urls.length > 0 && (
        <ul className="text-xs text-gray-600">
          {urls.map((u, i) => (<li key={i}>{u}</li>))}
        </ul>
      )}
      <input type="hidden" name="filesJson" value="[]" />
    </div>
  );
}
