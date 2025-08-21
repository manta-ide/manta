// next.config.ts
import type { NextConfig } from 'next';

const REMOTE_ORIGIN = 'https://8d93d34189b602a4f2425effc0c7905e.preview.bl.run';

const nextConfig: NextConfig = {


async rewrites() {
  return [
    // HTML & API under /iframe/…
    { source: '/iframe', destination: 'https://8d93d34189b602a4f2425effc0c7905e.preview.bl.run/iframe' },
    { source: '/iframe/:path*', destination: 'https://8d93d34189b602a4f2425effc0c7905e.preview.bl.run/iframe/:path*' },
  ];
}

};

export default nextConfig;
