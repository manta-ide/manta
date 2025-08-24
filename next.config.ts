// next.config.ts
import type { NextConfig } from 'next';

const REMOTE_ORIGIN = 'https://6c9d4529ee4fe798ad651c4bc1266eec.preview.bl.run';

const nextConfig: NextConfig = {


async rewrites() {
  return [
    // HTML & API under /iframe/…
    { source: '/iframe', destination: 'https://6c9d4529ee4fe798ad651c4bc1266eec.preview.bl.run/iframe' },
    { source: '/iframe/:path*', destination: 'https://6c9d4529ee4fe798ad651c4bc1266eec.preview.bl.run/iframe/:path*' },
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
