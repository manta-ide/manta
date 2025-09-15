// next.config.ts
import type { NextConfig } from 'next';

function childBase() {
  // Try to find a running child app on common ports
  const possiblePorts = ['3001', '3002', '3003', '3004'];
  const port = process.env.NEXT_PUBLIC_CHILD_PORT ||
               process.env.MANTA_CHILD_PORT ||
               possiblePorts.find(p => {
                 try {
                   // Simple check - in production this would be more robust
                   return true; // For now, just use the first available
                 } catch {
                   return false;
                 }
               }) ||
               '3001';

  const url = (process.env.NEXT_PUBLIC_CHILD_URL || '').replace(/\/$/, '');
  return url && /^https?:\/\//.test(url) ? url : `http://localhost:${port}`;
}

const nextConfig: NextConfig = {
  //output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['@anthropic-ai/claude-code'],
  async rewrites() {
    const base = childBase();
    return [
      { source: '/iframe', destination: `${base}/iframe/` },
      { source: '/iframe/:path*', destination: `${base}/iframe/:path*` },
    ];
  },
};

export default nextConfig;