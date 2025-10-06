/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Keep this if you want readable prod stack traces (slightly larger build)
  productionBrowserSourceMaps: true,
};

module.exports = nextConfig;