// next.config.ts
import type { NextConfig } from 'next';

const REMOTE_ORIGIN = 'https://47923c7edf3e283d8808caed161fc8aa.preview.bl.run';

const nextConfig: NextConfig = {


async rewrites() {
  return [
    // HTML & API under /iframe/…
    { source: '/iframe', destination: 'https://47923c7edf3e283d8808caed161fc8aa.preview.bl.run' },
    { source: '/iframe/:path*', destination: 'https://47923c7edf3e283d8808caed161fc8aa.preview.bl.run/:path*' },
  ];
}

};

export default nextConfig;

// // next.config.ts
// import type { NextConfig } from 'next';

// const REMOTE_ORIGIN = 'http://localhost:3001';

// const nextConfig: NextConfig = {


// async rewrites() {
//   return [
//     // HTML & API under /iframe/…
//     { source: '/iframe', destination: 'http://localhost:3001/iframe' },
//     { source: '/iframe/:path*', destination: 'http://localhost:3001/iframe/:path*' },
//   ];
// }

// };

// export default nextConfig;
