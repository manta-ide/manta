// next.config.ts
import type { NextConfig } from 'next';


const nextConfig: NextConfig = {


async rewrites() {
  return [
    // HTML & API under /iframe/…
    { source: '/iframe', destination: `${process.env.BLAXEL_SANDBOX_PREVIEW_URL}/iframe/` },
    { source: '/iframe/:path*', destination: `${process.env.BLAXEL_SANDBOX_PREVIEW_URL}/iframe/:path*` },
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
