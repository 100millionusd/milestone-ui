/** @type {import('next').NextConfig} */
const nextConfig = {
  // 👇 turn off auto-trailing slashes
  trailingSlash: false,

  // ✅ Unified images configuration
  images: {
    // 👇 ADDED: Cache images for 1 year to stop Pinata rate limiting
    minimumCacheTTL: 31536000,

    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sapphire-given-snake-741.mypinata.cloud',
        pathname: '/ipfs/**',
      },
      // Allowed the public Pinata gateway
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
        pathname: '/ipfs/**',
      },
      // Allowed the Cloudflare IPFS gateway
      {
        protocol: 'https',
        hostname: 'cf-ipfs.com',
        pathname: '/ipfs/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 640, 768, 1024, 1280, 1536],
    imageSizes: [200, 300, 400, 600, 800],
  },

  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Optional: force the canonical no-slash for this endpoint
  async redirects() {
    return [
      {
        source: '/api/milestones/bulk-status/',
        destination: '/api/milestones/bulk-status',
        permanent: false,
      },
    ];
  },

  // ✅ cache public API responses
  async headers() {
    return [
      {
        source: '/api/public/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' },
        ],
      },
    ];
  },

  productionBrowserSourceMaps: true,
};

module.exports = nextConfig;