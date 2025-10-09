// next.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep dev simple to avoid stale chunk references on Windows.
  ...(isProd ? { output: 'standalone' } : {}),
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    externalDir: true, // safe for your env var MANTA_PROJECT_DIR
    ...(isProd ? {
      outputFileTracingRoot: path.join(__dirname, '../'),
      outputFileTracingIncludes: {
        'src/app/api/claude/**': ['node_modules/@anthropic-ai/claude-code/**'],
        'src/app/api/graph-api/[graph-id]/**': ['dev-project/manta/graphs/**/*'],
      },
    } : {}),
  },
  // Production-only externals/tracing for the Claude package
  ...(isProd
    ? {
        serverExternalPackages: ['@anthropic-ai/claude-code'],
      }
    : {}),
  transpilePackages: [],
  // Ensure the dist directory is cleaned between builds
  cleanDistDir: true,
};

export default nextConfig;
