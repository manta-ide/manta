// next.config.ts
import type { NextConfig } from 'next';

const REMOTE_ORIGIN = 'http://localhost:3001';

const nextConfig: NextConfig = {


async rewrites() {
  return [
    // HTML & API under /iframe/…
    { source: '/iframe/:path*', destination: `${REMOTE_ORIGIN}/:path*` },

    // ALL Next.js static assets & HMR data streams
    { source: '/_next/:path*',   destination: `${REMOTE_ORIGIN}/_next/:path*` },
  ];
}

};

export default nextConfig;
