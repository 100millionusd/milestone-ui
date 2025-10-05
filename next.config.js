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

  // 👇 Proxy the SAME paths you call from the browser.
  //    DO NOT proxy /api/* (that’s your Next API).
  async rewrites() {
    return [
      { source: '/auth/:path*',       destination: `${API}/auth/:path*` },
      { source: '/vendor/:path*',     destination: `${API}/vendor/:path*` },
      { source: '/bids/:path*',       destination: `${API}/bids/:path*` },
      { source: '/proposals/:path*',  destination: `${API}/proposals/:path*` },
      { source: '/proofs/:path*',     destination: `${API}/proofs/:path*` },
      { source: '/admin/:path*',      destination: `${API}/admin/:path*` },
      { source: '/ipfs/:path*',       destination: `${API}/ipfs/:path*` },
      { source: '/health',            destination: `${API}/health` },
      { source: '/test',              destination: `${API}/test` },
    ];
  },
};

module.exports = nextConfig;
