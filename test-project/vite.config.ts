import { defineConfig, Plugin, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve as pathResolve } from 'path';
import fsp from 'fs/promises';

// (no compile-time vars injection; vars are sourced from Supabase at runtime)

/** Dev+Preview: set frame-ancestors so you can embed in the parent iframe */
function frameHeaders(): Plugin {
  return {
    name: 'frame-headers',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', 'frame-ancestors *');
        // @ts-ignore
        res.removeHeader?.('X-Frame-Options');
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', 'frame-ancestors *');
        // @ts-ignore
        res.removeHeader?.('X-Frame-Options');
        next();
      });
    },
  };
}

function graphVarsMiddleware(): Plugin {
  // Variables are now stored in current-graph.xml, this endpoint returns empty for compatibility
  const route = '/iframe/__graph/vars';
  return {
    name: 'graph-vars-middleware',
    configureServer(server: any) {
      server.middlewares.use(route, (req: any, res: any) => {
        const method = (req.method || 'GET').toUpperCase();
        if (method === 'GET') {
          // Return empty object for compatibility
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({}));
          return;
        }
        if (method === 'POST' || method === 'PUT') {
          // Accept writes but do nothing (for compatibility)
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        res.statusCode = 405;
        res.end('Method Not Allowed');
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const hmrHost = env.VITE_HMR_HOST || '';
  const hmrProto = (env.VITE_HMR_PROTOCOL || (hmrHost ? 'wss' : 'ws')) as 'ws' | 'wss';
  const hmrPort = env.VITE_HMR_PORT ? Number(env.VITE_HMR_PORT) : undefined;

  const hmr: any = hmrHost
    ? { protocol: hmrProto, host: hmrHost, ...(hmrPort ? { port: hmrPort } : {}), path: '/iframe' }
    : { protocol: 'ws', host: 'localhost', port: 5173, path: '/iframe' };

  return {
    plugins: [react(), frameHeaders(), graphVarsMiddleware()],

    resolve: {
      alias: {
        '@': pathResolve(__dirname, 'src'),
      },
    },

    // Serve under /iframe
    base: '/iframe/',

    appType: 'spa',

    server: {
      watch: {
        usePolling: true,
        ignored: ['**/_graph/current-graph.xml', '**/_graph/base-graph.xml', '**/_graph/jobs.json', '**/_graph/vars.json'],
      },
      host: true,
      port: 5173,
      cors: true,
      allowedHosts: true,
      hmr,
    },

    preview: {
      allowedHosts: true,
      host: true,
      port: 5173,
    },
  };
});