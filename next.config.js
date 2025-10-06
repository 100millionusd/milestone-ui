/** @type {import('next').NextConfig} */
const nextConfig = {
  // 👇 turn off auto-trailing slashes (this is what was causing /api/... and /api.../ duplicates)
  trailingSlash: false,

  images: { unoptimized: true },
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

  // Keep this if you want readable prod stack traces (slightly larger build)
  productionBrowserSourceMaps: true,
};

module.exports = nextConfig;
