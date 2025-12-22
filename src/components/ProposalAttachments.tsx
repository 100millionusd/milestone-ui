'use client';

import { useState } from 'react';
import { toGatewayUrl } from '@/lib/pinata';

type Doc = {
    url?: string;
    href?: string;
    link?: string;
    cid?: string;
    name?: string;
    filename?: string;
    title?: string;
    [key: string]: any;
};

function asUrl(d: any): string {
    if (!d) return "";
    if (typeof d === "string") return d.trim();
    return String(d.url || d.href || d.link || d.cid || "").trim();
}

function asName(d: any): string {
    if (!d) return "";
    let val = "";
    if (typeof d === "string") {
        try {
            const u = new URL(d);
            val = decodeURIComponent(u.pathname.split("/").pop() || "file");
        } catch {
            val = d.split("/").pop() || "file";
        }
    } else {
        val = String(d.name || d.filename || d.title || d.cid || "file");
    }
    return val.trim();
}

function isImage(url: string): boolean {
    if (!url) return false;
    const u = url.toLowerCase().trim();
    // Looser check: looks for extension followed by end of string, query param, or whitespace
    return /\.(png|jpe?g|gif|webp|bmp|svg)((?=[?#])|$|\s)/i.test(u);
}

export default function ProposalAttachments({ docs = [] }: { docs: Doc[] }) {
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    if (!docs || docs.length === 0) {
        return <div className="text-sm text-slate-500">No attachments.</div>;
    }

    const items = docs.map((d) => {
        const rawUrl = asUrl(d);
        const url = rawUrl ? toGatewayUrl(rawUrl) : "";
        const name = asName(d);
        const isImg = isImage(url) || isImage(name);
        return { doc: d, url, name, isImg, rawUrl };
    }).filter(x => x.url);

    if (items.length === 0) {
        return <div className="text-sm text-slate-500">No valid attachments.</div>;
    }

    return (
        <>
            <div className="flex flex-wrap gap-3">
                {items.map((item, i) => {
                    // Optimized thumb
                    const thumbSrc = item.isImg
                        ? toGatewayUrl(item.rawUrl, { width: 200, height: 200, fit: 'cover', format: 'webp' })
                        : undefined;

                    return (
                        <div
                            key={i}
                            className="group block rounded border bg-white hover:shadow-sm transition p-2 cursor-pointer relative"
                            title={item.name}
                            onClick={(e) => {
                                // If it's an image, open lightbox. If not, open new tab.
                                if (item.isImg) {
                                    e.preventDefault();
                                    setLightboxUrl(item.url);
                                } else {
                                    // Allow default behavior (link) or force window.open
                                    window.open(item.url, '_blank', 'noopener,noreferrer');
                                }
                            }}
                        >
                            {item.isImg ? (
                                <img
                                    src={thumbSrc}
                                    alt={item.name}
                                    crossOrigin="anonymous"
                                    className="w-24 h-24 object-cover rounded"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="w-24 h-24 rounded grid place-items-center bg-slate-50 text-slate-600 text-xs">
                                    PDF / File
                                </div>
                            )}
                            <div className="mt-1 w-24 truncate text-[11px] text-slate-700">{item.name}</div>
                        </div>
                    );
                })}
            </div>

            {/* Lightbox */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm"
                    onClick={() => setLightboxUrl(null)}
                >
                    <div className="relative max-w-full max-h-full">
                        <button
                            className="absolute -top-12 right-0 text-white/70 hover:text-white p-2"
                            onClick={() => setLightboxUrl(null)}
                        >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={toGatewayUrl(lightboxUrl, { width: 1200, format: 'webp' })}
                            alt="Preview"
                            crossOrigin="anonymous"
                            className="max-w-full max-h-[90vh] rounded shadow-2xl object-contain"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </>
    );
}
