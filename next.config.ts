// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Dynamic iframe proxying is now handled by /api/iframe/[[...path]]/route.ts
  // This allows user-specific sandbox preview URLs instead of static environment variables
  
  async rewrites() {
    return [
      // Redirect iframe document requests to our dynamic proxy API
      { source: '/iframe', destination: '/api/iframe/' },
      { source: '/iframe/:path*', destination: '/api/iframe/:path*' },

      // Also proxy Vite dev asset paths to the preview when embedded
      // With Vite base set to '/', the iframe HTML references absolute paths
      // like '/@vite/client', '/src/*.tsx', '/@react-refresh', etc. We route
      // them to the same dynamic proxy so they resolve inside the parent app.
      { source: '/@vite/:path*', destination: '/api/iframe/@vite/:path*' },
      { source: '/@react-refresh', destination: '/api/iframe/@react-refresh' },
      { source: '/src/:path*', destination: '/api/iframe/src/:path*' },
      { source: '/node_modules/:path*', destination: '/api/iframe/node_modules/:path*' },
      { source: '/assets/:path*', destination: '/api/iframe/assets/:path*' },
      { source: '/vite.svg', destination: '/api/iframe/vite.svg' },
      // Optional: expose vars endpoint at a stable path used by the iframe
      { source: '/api/vars', destination: '/api/iframe/api/vars' },
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
