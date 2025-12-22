export async function secureOpen(url: string, filename?: string) {
    try {
        // 1. Fetch with current origin (browser handles Origin header automatically)
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load file: ${res.statusText}`);

        // 2. Create Blob with explicit type if PDF to ensure preview works
        const contentType = res.headers.get('content-type');
        let blob: Blob;
        if (filename?.toLowerCase().endsWith('.pdf') || url.toLowerCase().split('?')[0].endsWith('.pdf')) {
            const data = await res.arrayBuffer();
            blob = new Blob([data], { type: 'application/pdf' });
        } else {
            blob = await res.blob();
        }
        const objectUrl = URL.createObjectURL(blob);

        // 3. Open in new tab or download
        // For PDFs and images, opening in new tab is usually desired.
        // For others, we might want to force download.
        // Let's try opening in new tab first.
        const win = window.open(objectUrl, '_blank');

        // Fallback if popup blocked or immediate download wanted
        if (!win) {
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }

        // Cleanup timeout (give browser time to load it)
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (err) {
        console.error('Secure open failed:', err);
        // Fallback to direct link (might fail if 403, but worth trying or alerting)
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}
