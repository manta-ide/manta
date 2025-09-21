// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  experimental: { externalDir: true }, // safe for your env var MANTA_PROJECT_DIR
};

export default nextConfig;