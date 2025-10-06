/** @type {import('next').NextConfig} */

// Where to proxy API requests (leave as default or set API_TARGET in Netlify env)
const API_TARGET =
  process.env.API_TARGET || 'https://milestone-api-production.up.railway.app';

const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  productionBrowserSourceMaps: true,

  async rewrites() {
    return [
      // Proxy your REST API to Railway (fixes Safari cookie/CORS)
      {
        source: '/:section(auth|vendor|proposals|bids|proofs|admin|ipfs)/:path*',
        destination: `${API_TARGET}/:section/:path*`,
      },

      // Proxy Ankr RPC to avoid Safari CORS on JSON-RPC
      // You will call it as /rpc/eth_sepolia/<YOUR_ANKR_KEY>
      { source: '/rpc/:path*', destination: 'https://rpc.ankr.com/:path*' },
    ];
  },
};

module.exports = nextConfig;
