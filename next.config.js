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

  // Proxy BOTH styles: legacy (/auth, /bids, …) and new (/api/*)
  async rewrites() {
    return [
      // keep the generic /api proxy (new style)
      { source: '/api/:path*',       destination: `${API}/:path*` },

      // map legacy direct roots (old style still in your code)
      { source: '/auth/:path*',      destination: `${API}/auth/:path*` },
      { source: '/bids/:path*',      destination: `${API}/bids/:path*` },
      { source: '/proposals/:path*', destination: `${API}/proposals/:path*` },
      { source: '/vendor/:path*',    destination: `${API}/vendor/:path*` },
      { source: '/proofs/:path*',    destination: `${API}/proofs/:path*` },
      { source: '/admin/:path*',     destination: `${API}/admin/:path*` },
      { source: '/ipfs/:path*',      destination: `${API}/ipfs/:path*` },

      // single endpoints you hit directly
      { source: '/health',           destination: `${API}/health` },
      { source: '/test',             destination: `${API}/test` },
    ];
  },
};

module.exports = nextConfig;
