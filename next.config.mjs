// next.config.mjs
const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev simple to avoid stale chunk references on Windows.
  ...(isProd ? { output: 'standalone' } : {}),
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    externalDir: true, // safe for your env var MANTA_PROJECT_DIR
  },
  // Production-only externals/tracing for the Claude package
  ...(isProd
    ? {
        serverExternalPackages: ['@anthropic-ai/claude-code'],
        outputFileTracingIncludes: {
          'src/app/api/claude/**': ['node_modules/@anthropic-ai/claude-code/**'],
        },
      }
    : {}),
  transpilePackages: [],
  // Ensure the dist directory is cleaned between builds
  cleanDistDir: true,
  // Disable static optimization for pages using Clerk
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
};

export default nextConfig;
