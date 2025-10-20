/** @type {import('next').NextConfig} */
const nextConfig = {
  // 👇 turn off auto-trailing slashes (this is what was causing /api/... and /api.../ duplicates)
  trailingSlash: false,

  // ✅ enable Next/Image optimization for Pinata IPFS images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sapphire-given-snake-741.mypinata.cloud',
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

  // ✅ cache public API responses so /public doesn’t block on fresh fetches every time
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

  // Keep this if you want readable prod stack traces (slightly larger build)
  productionBrowserSourceMaps: true,
};

module.exports = nextConfig;
