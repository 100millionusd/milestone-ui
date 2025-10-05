/** @type {import('next').NextConfig} */
const RAW_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  'https://milestone-api-production.up.railway.app';

const API_BASE = RAW_API_BASE.replace(/\/+$/, '');

const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Keep this if you want readable prod stack traces (slightly larger build)
  productionBrowserSourceMaps: true,

  // Proxy all /api/* requests to your backend so Safari treats cookies as first-party
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API_BASE}/:path*` },
    ];
  },
};

module.exports = nextConfig;
