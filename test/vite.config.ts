import { defineConfig, Plugin, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fsp from 'fs/promises';

// (no compile-time vars injection; vars are sourced from Supabase at runtime)

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

  // Simple middleware to read/write _graph/vars.json during dev/preview
  function graphVarsMiddleware(): Plugin {
    const route = '/__graph/vars';
    const makeHandler = (rootDir: string) => {
      const varsPath = resolve(rootDir, './_graph/vars.json');
      const varsDir = resolve(rootDir, './_graph');
      return async (req: any, res: any) => {
        if (!req.url?.startsWith(route)) return false;
        const method = (req.method || 'GET').toUpperCase();
        try {
          if (method === 'GET') {
            const buf = await fsp.readFile(varsPath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(buf);
            return true;
          }
          if (method === 'POST' || method === 'PUT') {
            const chunks: Buffer[] = [];
            await new Promise<void>((resolvePromise, reject) => {
              req.on('data', (c: Buffer) => chunks.push(c));
              req.on('end', () => resolvePromise());
              req.on('error', reject);
            });
            const bodyStr = Buffer.concat(chunks).toString('utf8');
            let data: any = {};
            try { data = JSON.parse(bodyStr || '{}'); } catch {}
            await fsp.mkdir(varsDir, { recursive: true });
            const tmpPath = resolve(varsDir, 'vars.tmp.json');
            const finalStr = JSON.stringify(data, null, 2) + '\n';
            await fsp.writeFile(tmpPath, finalStr, 'utf8');
            await fsp.rename(tmpPath, varsPath);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify({ ok: true }));
            return true;
          }
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return true;
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, error: String(err?.message || err) }));
          return true;
        }
      };
    };
    return {
      name: 'graph-vars-middleware',
      configureServer(server) {
        const handler = makeHandler(server.config.root);
        server.middlewares.use(async (req, res, next) => {
          const handled = await handler(req, res);
          if (!handled) next();
        });
      },
      configurePreviewServer(server) {
        const handler = makeHandler(server.config.root);
        server.middlewares.use(async (req, res, next) => {
          const handled = await handler(req, res);
          if (!handled) next();
        });
      },
    };
  }

  return ({
    plugins: [react(), frameHeaders(), graphVarsMiddleware()],
    
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

    // No compile-time vars; app pulls from Supabase

    // Dev server
    server: {
      watch: {
        usePolling: true,
        // Avoid dev-server reloads when we persist _graph/vars.json
        ignored: ['**/_graph/vars.json'],
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
