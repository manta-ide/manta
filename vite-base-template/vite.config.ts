import { defineConfig, Plugin, loadEnv } from 'vite';
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Remote-capable HMR: configure via env when embedding or running behind a preview URL
  // Set these in the container/preview environment to enable cross-origin HMR:
  //   VITE_HMR_HOST=your.preview.host
  //   VITE_HMR_PROTOCOL=ws|wss    (default 'wss' when host is set)
  //   VITE_HMR_PORT=443|5173      (optional; omit to use scheme default)
  const hmrHost = env.VITE_HMR_HOST || '';
  const hmrProto = (env.VITE_HMR_PROTOCOL || (hmrHost ? 'wss' : 'ws')) as 'ws' | 'wss';
  const hmrPort = env.VITE_HMR_PORT ? Number(env.VITE_HMR_PORT) : undefined;
  const hmr: any = hmrHost
    ? { protocol: hmrProto, host: hmrHost, ...(hmrPort ? { port: hmrPort } : {}) }
    : { protocol: 'ws', host: 'localhost', port: 5173 };

  return ({
    plugins: [react(), frameHeaders()],
    
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      },
    },

    /**
     * Serve the preview app at the root of the preview host.
     * The Next.js app still mounts it at `/iframe` via a proxy, but the proxy
     * forwards `/iframe/*` to the preview root (`/`).
     */
    base: '/',

    define: {
      __GRAPH_VARS__: JSON.stringify(loadGraphVars()),
    },

    // Dev server
    server: {
      watch: {
        usePolling: true,
      },
      host: true,
      port: 5173,
      cors: true,
      allowedHosts: true,
      // Cross-origin HMR supported; when VITE_HMR_HOST is set, connect directly to remote.
      hmr,
    },

    // Preview server
    preview: {
      allowedHosts: true,
      host: true,
      port: 5173,
    },

    // SPA fallback means Vite will serve index.html at / and nested routes.
    appType: 'spa',
  });
});
