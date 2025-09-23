// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // 🔎 Show real filenames/line numbers in production errors
  productionBrowserSourceMaps: true,

  // 🧪 TEMP: disable minify so variable names aren’t mangled (helps find "b is not defined")
  swcMinify: false,
};

module.exports = nextConfig;
