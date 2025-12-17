cat > next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  // 👇 Keep your existing settings
  trailingSlash: false,
  productionBrowserSourceMaps: true,

  // ✅ Unified images configuration
  images: {
    minimumCacheTTL: 31536000,
    remotePatterns: [
      // {
      //   protocol: 'https',
      //   hostname: 'sapphire-given-snake-741.mypinata.cloud', // REMOVED
      //   pathname: '/ipfs/**',
      // },
      {
        protocol: 'https',
        hostname: 'gateway.pinata.cloud',
        pathname: '/ipfs/**',
      },
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

  typescript: { ignoreBuildErrors: true },

  // 👇 REQUIRED FIXES FOR WEB3
  // 1. Force these to be server-only (Prevents browser crash)
  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'thread-stream',
    'lokijs',
    'encoding'
  ],

  // 2. Transpile ONLY the Web3 SDKs (Removed pino/thread-stream from here to fix conflict)
  transpilePackages: ['@web3auth', '@walletconnect'],

  // 3. Fix "Module not found" errors
  webpack: (config) => {
    config.externals.push({
      'pino-pretty': 'commonjs pino-pretty',
      'lokijs': 'commonjs lokijs',
      'encoding': 'commonjs encoding',
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
    });
    return config;
  },

  // 👇 Keep your redirects
  async redirects() {
    return [
      {
        source: '/api/milestones/bulk-status/',
        destination: '/api/milestones/bulk-status',
        permanent: false,
      },
    ];
  },

  // 👇 Keep your headers
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
};

module.exports = nextConfig;
EOF