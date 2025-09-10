// next.config.ts
import type { NextConfig } from 'next';

function childBase() {
  const port = process.env.NEXT_PUBLIC_CHILD_PORT || process.env.MANTA_CHILD_PORT || '3001';
  const url = (process.env.NEXT_PUBLIC_CHILD_URL || '').replace(/\/$/, '');
  return url && /^https?:\/\//.test(url) ? url : `http://localhost:${port}`;
}

const nextConfig: NextConfig = {
  //output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const base = childBase();
    return [
      { source: '/iframe', destination: `${base}/iframe/` },
      { source: '/iframe/:path*', destination: `${base}/iframe/:path*` },
    ];
  },
};

export default nextConfig;