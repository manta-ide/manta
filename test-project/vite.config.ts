import { defineConfig, Plugin, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve as pathResolve } from 'path';
import fsp from 'fs/promises';

// (no compile-time vars injection; vars are sourced at runtime)



export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const hmrHost = env.VITE_HMR_HOST || '';
  const hmrProto = (env.VITE_HMR_PROTOCOL || (hmrHost ? 'wss' : 'ws')) as 'ws' | 'wss';
  const hmrPort = env.VITE_HMR_PORT ? Number(env.VITE_HMR_PORT) : undefined;

  const hmr: any = hmrHost
    ? { protocol: hmrProto, host: hmrHost, ...(hmrPort ? { port: hmrPort } : {}) }
    : { protocol: 'ws', host: 'localhost', port: 5173 };

  return {
    plugins: [react()],

    resolve: {
      alias: {
        '@': pathResolve(__dirname, 'src'),
      },
    },

    base: '/',

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
