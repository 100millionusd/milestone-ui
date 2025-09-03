/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export', // ← Add this for static export
  trailingSlash: true, // ← Recommended for Netlify
  images: {
    unoptimized: true // ← Required for static export
  }
}

module.exports = nextConfig;
