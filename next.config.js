/** @type {import('next').NextConfig} */
const API =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://milestone-api-production.up.railway.app';

const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  productionBrowserSourceMaps: true,

  // IMPORTANT:
  // - We DO NOT proxy /api/* so your local Next API routes keep working
  //   (e.g. /api/proofs/upload).
  // - We DO proxy the backend prefixes your UI calls with relative URLs
  //   like /auth/role, /bids, /proposals, etc.
  async rewrites() {
    return [
      { source: '/auth/:path*',       destination: `${API}/auth/:path*` },
      { source: '/bids/:path*',       destination: `${API}/bids/:path*` },
      { source: '/proposals/:path*',  destination: `${API}/proposals/:path*` },
      { source: '/vendor/:path*',     destination: `${API}/vendor/:path*` },
      { source: '/proofs/:path*',     destination: `${API}/proofs/:path*` },
      { source: '/milestones/:path*', destination: `${API}/milestones/:path*` },
      { source: '/ipfs/:path*',       destination: `${API}/ipfs/:path*` },
      { source: '/health',            destination: `${API}/health` },
      { source: '/test',              destination: `${API}/test` },
    ];
  },
};

module.exports = nextConfig;
