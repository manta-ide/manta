// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Dynamic iframe proxying is now handled by /api/iframe/[[...path]]/route.ts
  // This allows user-specific sandbox preview URLs instead of static environment variables
  
  async rewrites() { return []; }
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
