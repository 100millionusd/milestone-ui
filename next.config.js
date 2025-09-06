// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // REMOVE output: 'export' completely
  trailingSlash: true,
  images: {
    unoptimized: true
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
