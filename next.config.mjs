// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    externalDir: true, // safe for your env var MANTA_PROJECT_DIR
  },
  // Ensure the Claude Code package is treated as an external runtime dep
  serverExternalPackages: ['@anthropic-ai/claude-code'],
  // Make sure standalone tracing copies the files into .next/standalone
  outputFileTracingIncludes: {
    // Key is a glob of server files that need this dep at runtime
    'src/app/api/claude/**': ['node_modules/@anthropic-ai/claude-code/**'],
    // Include agent prompt files for API routes that use them
    'src/app/api/claude-code/execute/**': ['src/app/api/lib/agent-prompts/**'],
    'src/app/api/project-status/**': ['src/app/api/lib/agent-prompts/**'],
  },
  // Do NOT transpile the CLI package; keep it external/runtime
  transpilePackages: [],
};

export default nextConfig;