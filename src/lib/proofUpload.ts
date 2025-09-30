// src/lib/proofUpload.ts

// Sends <input type="file"> files to /api/proofs/upload (which forwards to Pinata)
// Returns: [{ cid, url, name }] for each uploaded file
export async function uploadProofFiles(
  files: File[]
): Promise<Array<{ cid: string; url: string; name: string }>> {
  if (!files || files.length === 0) return [];

  const fd = new FormData();
  // The API route accepts either "file" or "files"; sending "file" repeatedly is fine.
  for (const f of files) {
    fd.append('file', f, (f as any).name || 'upload');
  }

  const res = await fetch('/api/proofs/upload', {
    method: 'POST',
    body: fd,
    credentials: 'include', // keep session cookies
    // IMPORTANT: do NOT set Content-Type for FormData; browser sets the boundary
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`upload failed: ${res.status} ${text || res.statusText}`);
  }

  const json = await res.json();
  return Array.isArray(json?.uploads) ? json.uploads : [];
}
