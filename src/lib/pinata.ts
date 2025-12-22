
export type OptimizationOptions = {
    width?: number;
    height?: number;
    format?: 'webp' | 'png' | 'jpeg';
    fit?: 'scaleDown' | 'contain' | 'cover' | 'crop' | 'pad';
    animation?: boolean;
    sharpen?: number;
    gateway?: string;
};

// FIX: Default to a public gateway if env is missing
const PREFERRED_GATEWAY =
    process.env.NEXT_PUBLIC_PINATA_GATEWAY
        ? `https://${String(process.env.NEXT_PUBLIC_PINATA_GATEWAY).replace(/^https?:\/\//, '').replace(/\/+$/, '')}/ipfs/`
        : (process.env.NEXT_PUBLIC_IPFS_GATEWAY || 'https://gateway.pinata.cloud/ipfs/');

/**
 * Normalizes an IPFS URL to use the dedicated Pinata gateway.
 * Supports Pinata Image Optimization query parameters.
 */
export function toGatewayUrl(url: string | null | undefined, opts?: OptimizationOptions): string {
    if (!url) return '';

    // 1. Remove the query string (unless we want to preserve some?)
    // Generally safer to strip existing params to avoid conflicts or leaked tokens
    const cleanUrl = url.split('?')[0];

    // Determine the gateway host to use
    const rawGateway = opts?.gateway || PREFERRED_GATEWAY;
    const host = rawGateway.replace(/^https?:\/\//, '').replace(/\/+$/, '');

    let newUrl = cleanUrl;

    // 2. Handle malformed ".../ipfsbafy..." (missing slash)
    if (cleanUrl.includes('/ipfsbafy') || cleanUrl.includes('/ipfsQm')) {
        const split = cleanUrl.includes('/ipfsbafy') ? '/ipfsbafy' : '/ipfsQm';
        const parts = cleanUrl.split(split);
        if (parts.length >= 2) {
            const cidPrefix = split.replace('/ipfs', ''); // bafy or Qm
            newUrl = `https://${host}/ipfs/${cidPrefix}${parts[1]}`;
        }
    }

    // 3. Replace restricted or generic gateways
    if (!newUrl.startsWith(`https://${host}`)) {
        newUrl = newUrl.replace(
            /https?:\/\/(gateway\.pinata\.cloud|ipfs\.io|sapphire-given-snake-741\.mypinata\.cloud)\/ipfs\//,
            `https://${host}/ipfs/`
        );
    }

    // Ensure it starts with the preferred gateway (if it was a bare string or other gateway)
    if (!newUrl.startsWith('http')) {
        // Logic to handle bare CIDs or other formats if needed, 
        // but usually input is full URL or ipfs://
        newUrl = newUrl.replace(/^ipfs:\/\//, '');
        if (!newUrl.startsWith(rawGateway) && !newUrl.includes('/ipfs/')) {
            // simple bare CID assumption? risky without more checks, 
            // keeping existing logic which mainly replaced domains.
        }
    }


    // 4. Fix double /ipfs/ipfs/
    if (newUrl.includes('/ipfs/ipfs/')) {
        newUrl = newUrl.replace('/ipfs/ipfs/', '/ipfs/');
    }

    // 5. Append Optimization Params
    if (opts) {
        const params = new URLSearchParams();
        if (opts.width) params.set('img-width', opts.width.toString());
        if (opts.height) params.set('img-height', opts.height.toString());
        if (opts.format) params.set('img-format', opts.format);
        if (opts.fit) params.set('img-fit', opts.fit);
        if (opts.animation === false) params.set('img-anim', 'false');
        if (opts.sharpen) params.set('img-sharpen', opts.sharpen.toString());

        const qs = params.toString();
        if (qs) {
            newUrl += `?${qs}`;
        }
    }

    return newUrl;
}

// Backwards compatibility alias if needed, or prefer toGatewayUrl
export const useDedicatedGateway = (url: string | null | undefined, gatewayOverride?: string | null) => toGatewayUrl(url);
