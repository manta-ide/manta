import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { resolve } from 'path';

// --- Compile-time injection like webpack.DefinePlugin(__GRAPH_VARS__) ---
function loadGraphVars(): Record<string, string | number | boolean> {
  try {
    const fp = path.resolve('.graph/vars.json');
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return {};
  }
}

/** Dev-only: when .graph/vars.json changes, trigger a full reload */
function graphVarsHmr(): Plugin {
  return {
    name: 'graph-vars-hmr',
    configureServer(server) {
      const fp = path.resolve('.graph/vars.json');
      try {
        fs.watchFile(fp, { interval: 400 }, () => {
          server.ws.send({ type: 'full-reload' });
        });
      } catch {}
    },
  };
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
  plugins: [react(), graphVarsHmr(), frameHeaders()],
  
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
