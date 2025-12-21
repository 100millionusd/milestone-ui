'use client';

import { useMemo, useState } from 'react';

type Attachment = {
  cid?: string;
  url?: string;
  name: string;
  size?: number;
  mimetype?: string;
};

type Props = {
  docs?: Attachment[];
  cid?: string; // optional IPFS directory cid
  gatewayBase?: string; // defaults to Pinata gateway
  variant?: 'grid' | 'compact';
  showToolbar?: boolean;
  className?: string;
};

type RenderFile = Attachment & {
  href?: string;
  type: FileType;
  sizeLabel?: string;
};
type FileType = 'image' | 'pdf' | 'doc' | 'sheet' | 'ppt' | 'zip' | 'audio' | 'video' | 'other';

export default function Attachments({
  docs = [],
  cid,
  gatewayBase = process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs',
  variant = 'grid',
  showToolbar = false,
  className = '',
}: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [localVariant, setLocalVariant] = useState<'grid' | 'compact'>(variant);

  const files: RenderFile[] = useMemo(() => {
    return (docs || []).map((d) => {
      const href = d.url || (d.cid ? `${gatewayBase}/${d.cid}` : '#');
      const type = classifyType(d);
      return {
        ...d,
        href,
        type,
        sizeLabel: typeof d.size === 'number' ? formatBytes(d.size) : undefined,
      };
    });
  }, [docs, gatewayBase]);

  const hasDocs = files.length > 0;
  const activeVariant = showToolbar ? localVariant : variant;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-900">Attachments</h4>

        <div className="flex items-center gap-2">
          {!hasDocs && cid && (
            <a
              className="text-xs font-medium text-blue-600 hover:text-blue-700 underline underline-offset-2"
              href={`${gatewayBase}/${cid}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open IPFS folder
            </a>
          )}

          {showToolbar && hasDocs && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setLocalVariant('grid')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition ${activeVariant === 'grid'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setLocalVariant('compact')}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition ${activeVariant === 'compact'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                List
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {!hasDocs ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No files attached.
        </div>
      ) : activeVariant === 'compact' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left">
                <th>File</th>
                <th className="hidden sm:table-cell">Type</th>
                <th className="hidden md:table-cell">Size</th>
                <th className="w-[140px] text-right pr-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {files.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Thumb type={f.type} src={f.href} alt={f.name} onPreview={() => setLightboxIfImage(f, setLightbox)} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{f.name}</p>
                        <p className="text-xs text-slate-500 break-all sm:hidden">{f.type.toUpperCase()}</p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-3 py-3 text-slate-600">{f.type.toUpperCase()}</td>
                  <td className="hidden md:table-cell px-3 py-3 text-slate-600">{f.sizeLabel || '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={f.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
                      >
                        Open
                      </a>
                      <button
                        onClick={() => copy(f.href!)}
                        className="text-xs text-slate-600 hover:text-slate-900"
                      >
                        Copy
                      </button>
                      {f.type === 'image' && (
                        <button
                          onClick={() => setLightbox(f.href!)}
                          className="text-xs text-slate-600 hover:text-slate-900"
                        >
                          Preview
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {files.map((f, i) => {
            if (f.type === 'image') {
              return (
                <button
                  key={i}
                  onClick={() => setLightbox(f.href!)}
                  className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white"
                  title={f.name}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.href}
                    alt={f.name}
                    className="h-40 w-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                    crossOrigin="anonymous"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="truncate text-xs font-medium text-white">{f.name}</p>
                    {f.sizeLabel && <p className="text-[10px] text-white/80">{f.sizeLabel}</p>}
                  </div>
                </button>
              );
            }

            if (f.type === 'pdf') {
              return (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col" title={f.name}>
                  <div className="h-40 overflow-hidden rounded-lg border border-slate-100">
                    <object data={f.href} type="application/pdf" width="100%" height="100%">
                      <div className="h-full w-full grid place-items-center text-xs text-slate-500">
                        PDF preview not available
                      </div>
                    </object>
                  </div>
                  <div className="mt-2">
                    <p className="truncate text-sm font-medium text-slate-900">{f.name}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">{f.sizeLabel || 'PDF'}</p>
                      <div className="flex gap-2">
                        <a
                          href={f.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
                        >
                          Open
                        </a>
                        <button onClick={() => copy(f.href!)} className="text-xs text-slate-600 hover:text-slate-900">
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 flex items-start gap-3" title={f.name}>
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                  {fileEmoji(f.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{f.name}</p>
                  <p className="text-xs text-slate-500">{f.sizeLabel || f.type.toUpperCase()}</p>
                  <div className="mt-1 flex items-center gap-3">
                    <a
                      href={f.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2"
                    >
                      Open
                    </a>
                    <button onClick={() => copy(f.href!)} className="text-xs text-slate-600 hover:text-slate-900">
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox for images */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 p-4 md:p-8" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="preview" crossOrigin="anonymous" className="mx-auto max-h-full rounded-xl shadow-2xl" />
        </div>
      )}
    </div>
  );
}

/* -------------------- helpers -------------------- */

function classifyType(d: Attachment): FileType {
  const n = (d.name || '').toLowerCase();
  const mt = (d.mimetype || '').toLowerCase();
  const pick = (extMatch: RegExp, mimeMatch: RegExp) => extMatch.test(n) || mimeMatch.test(mt);

  if (pick(/\.(png|jpe?g|gif|webp|svg|bmp|tiff)$/, /^image\//)) return 'image';
  if (pick(/\.pdf$/, /^application\/pdf$/)) return 'pdf';
  if (pick(/\.(docx?|rtf|txt|md)$/, /msword|officedocument\.wordprocessingml|text\//)) return 'doc';
  if (pick(/\.(xlsx?|csv)$/, /spreadsheet|csv/)) return 'sheet';
  if (pick(/\.(pptx?)$/, /presentation/)) return 'ppt';
  if (pick(/\.(zip|rar|7z|tar|gz)$/, /(zip|x-rar|7z|gzip|tar)/)) return 'zip';
  if (pick(/\.(mp3|wav|aac|flac|ogg)$/, /^audio\//)) return 'audio';
  if (pick(/\.(mp4|mov|webm|mkv|avi)$/, /^video\//)) return 'video';
  return 'other';
}

function fileEmoji(type: FileType) {
  switch (type) {
    case 'doc': return '📄';
    case 'sheet': return '📊';
    case 'ppt': return '📈';
    case 'zip': return '🗜️';
    case 'audio': return '🎵';
    case 'video': return '🎬';
    default: return '📎';
  }
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function copy(text: string) {
  try { navigator.clipboard?.writeText(text); } catch { }
}

function setLightboxIfImage(f: RenderFile, setLightbox: (s: string) => void) {
  if (f.type === 'image' && f.href) setLightbox(f.href);
}

function Thumb({
  type, src, alt, onPreview,
}: { type: FileType; src?: string; alt: string; onPreview: () => void }) {
  if (type === 'image' && src) {
    return (
      <button onClick={onPreview} className="h-9 w-9 overflow-hidden rounded-md ring-1 ring-slate-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} crossOrigin="anonymous" className="h-full w-full object-cover" />
      </button>
    );
  }
  return (
    <div className="grid h-9 w-9 place-items-center rounded-md bg-slate-50 ring-1 ring-slate-200 text-slate-700">
      {fileEmoji(type)}
    </div>
  );
}
