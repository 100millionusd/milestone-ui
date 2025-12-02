
export function getRootDomain(hostname: string): string {
    const parts = hostname.split('.');
    // Localhost: localhost:3000 or tenant.localhost:3000
    if (hostname.includes('localhost')) return 'localhost:3000'; // Simplified for dev

    // Netlify: site.netlify.app or tenant.site.netlify.app
    if (hostname.endsWith('netlify.app')) {
        // If we have 3 parts (site.netlify.app), that IS the root.
        // If we have 4 parts (tenant.site.netlify.app), the root is site.netlify.app (last 3 parts)
        if (parts.length >= 3) {
            return parts.slice(-3).join('.');
        }
        return hostname;
    }

    // Vercel: site.vercel.app
    if (hostname.endsWith('vercel.app')) {
        if (parts.length >= 3) {
            return parts.slice(-3).join('.');
        }
        return hostname;
    }

    // Standard: domain.com or tenant.domain.com
    // This is still naive for co.uk, but better than slice(-2) for netlify
    return parts.slice(-2).join('.');
}
