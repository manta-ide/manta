import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// --- Compile-time injection like webpack.DefinePlugin(__GRAPH_VARS__) ---
function loadGraphVars(): Record<string, string | number | boolean> {
  try {
    // Use native Vite JSON import for dev-time freshness without manual watcher
    // Note: this path is relative to project root at build time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./_graph/vars.json');
  } catch {
    return {};
  }
}

/** Dev+Preview: set frame-ancestors so you can embed in the parent iframe */
function frameHeaders(): Plugin {
  return {
    name: 'frame-headers',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', "frame-ancestors *");
        // Vite doesn't set X-Frame-Options anyway, but make sure it's gone:
        // @ts-ignore
        res.removeHeader?.('X-Frame-Options');
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', "frame-ancestors *");
        // @ts-ignore
        res.removeHeader?.('X-Frame-Options');
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), frameHeaders()],
  
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    },
  },

  /**
   * IMPORTANT: keep everything under /iframe/ so the parent Next rewrite
   *  { source: '/iframe/:path*', destination: 'http://localhost:3001/iframe/:path*' }
   * can proxy ALL dev requests (HTML, modules, HMR, assets).
   */
  base: '/iframe/',

  define: {
    __GRAPH_VARS__: JSON.stringify(loadGraphVars()),
  },

  // Serve on the same port your parent rewrites to
  server: {
    watch: {
      usePolling: true,
    },
    host: true,
    port: 5173,
    cors: true,
    allowedHosts: true,
    // HMR: connect directly to Vite even though the page is shown under the parent.
    // Cross-origin WS is fine; this avoids relying on the parent to proxy WS upgrades.
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      // path defaults to `${base}@vite` → "/iframe/@vite"
    },
  },

  // Optional: if you also use `vite preview`
  preview: {
    allowedHosts: true,
    host: true,
    port: 5173,
  },

  // SPA fallback means Vite will serve index.html at /iframe, /iframe/foo, etc.
  appType: 'spa',
}));
