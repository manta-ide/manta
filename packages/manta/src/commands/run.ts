import {Command, Flags} from '@oclif/core';
import {spawn} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {LocalJobWorker} from '../jobs/local-worker.js';

export default class Run extends Command {
  static description = 'Run the local editor and job worker (fully local, filesystem-backed)';

  static flags = {
    project: Flags.string({ description: 'Project directory to use as storage (_graph/)', default: process.cwd() }),
    port: Flags.integer({ description: 'Editor port', default: 3000 }),
    childPort: Flags.integer({ description: 'Child project port (iframe target)', default: 3001 }),
    open: Flags.boolean({ description: 'Open browser', default: true }),
    dev: Flags.boolean({ description: 'Run Next.js in dev mode', default: true }),
    editorDir: Flags.string({ description: 'Path to editor app (auto-detected by default)' }),
  } as const;

  async run(): Promise<void> {
    const {flags} = await this.parse(Run);
    const projectDir = path.resolve(flags.project || process.cwd());
    const embedded = this.findEmbeddedEditor();
    const editorDir = embedded ? null : await this.resolveEditorDir(flags.editorDir);
    const port = Number(flags.port) || 3000;
    const childPort = Number(flags.childPort) || 3001;
    this.log(`[manta] project: ${projectDir}`);
    this.log(`[manta] editor: ${embedded ? '(embedded)' : editorDir}`);

    const env = {
      ...process.env,
      MANTA_LOCAL_MODE: '1',
      NEXT_PUBLIC_LOCAL_MODE: '1',
      MANTA_PROJECT_DIR: projectDir,
      PORT: String(port),
      MANTA_CHILD_PORT: String(childPort),
      NEXT_PUBLIC_CHILD_PORT: String(childPort),
      NEXT_PUBLIC_CHILD_URL: `http://localhost:${childPort}`,
    } as NodeJS.ProcessEnv;

    // Prefer embedded standalone editor if present in the CLI package
    let child: ReturnType<typeof spawn>;
    if (embedded) {
      this.log('[manta] launching embedded editor');
      const standaloneServer = path.join(embedded, 'standalone', 'server.js');
      const wrapperServer = path.join(embedded, 'server.mjs');
      if (fs.existsSync(standaloneServer)) {
        const serverDir = path.join(embedded, 'standalone');
        child = spawn(process.execPath, ['server.js'], { cwd: serverDir, env, stdio: 'inherit' });
      } else if (fs.existsSync(wrapperServer)) {
        // Fallback server for Next 15+ without standalone folder
        child = spawn(process.execPath, ['server.mjs'], { cwd: embedded, env, stdio: 'inherit' });
      } else {
        this.logToStderr('[manta] Embedded editor found but no server entry. Try rebuilding: npm run build:all');
        this.exit(1);
        return;
      }
    } else {
      // Validate the resolved editor directory really contains a Next.js app
      const pkgPath = path.join(editorDir!, 'package.json');
      let hasNext = false;
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as any;
        hasNext = !!(pkg?.dependencies?.next || pkg?.devDependencies?.next || String(pkg?.scripts?.dev || '').includes('next'));
      } catch {}
      if (!hasNext) {
        this.logToStderr('[manta] No embedded editor found and current directory is not a Next.js app.');
        this.logToStderr('[manta] Build the CLI with the embedded editor first: "npm run build:all" (from repo root), then reinstall.');
        this.exit(1);
        return;
      }
      this.log('[manta] launching workspace editor via npm (Next.js)');
      const cmd = 'npm';
      const args = ['run', flags.dev ? 'dev' : 'start'];
      child = spawn(cmd, args, { cwd: editorDir!, env, stdio: 'inherit', shell: process.platform === 'win32' });
    }
    child.on('error', (e) => this.logToStderr(`[editor:error] ${e?.message ?? e}`));

    if (flags.open) {
      setTimeout(() => {
        try {
          const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          spawn(opener, [`http://localhost:${port}`], { stdio: 'ignore', shell: process.platform === 'win32' });
        } catch {}
      }, 1500);
    }

    // Ensure child has a message bridge listener for vars updates
    try { await this.ensureChildBridge(projectDir); } catch (e) { this.log(`[manta] warn: failed to ensure child bridge: ${e instanceof Error ? e.message : String(e)}`); }

    // Start child project on childPort (Vite or npm dev in project dir)
    this.launchChildProject({ projectDir, port: childPort });

    const worker = new LocalJobWorker({ projectDir });
    worker.on('error', (e) => this.logToStderr(`[worker:error] ${e?.message ?? e}`));
    await worker.start();
    this.log('[manta] Local worker started. Watching _graph/jobs.json ...');

    // Keep process alive until editor exits
    await new Promise<void>((resolve) => child.on('close', () => resolve()));
    await worker.stop();
  }

  private async resolveEditorDir(hint?: string): Promise<string> {
    if (hint && fs.existsSync(hint)) return path.resolve(hint);
    // Walk up from current file (CLI package) to find the repo root with Next.js
    const tryDirs: string[] = [];
    try {
      // If running from source in monorepo
      const here = path.resolve();
      tryDirs.push(here);
    } catch {}
    // Also try process.cwd and its parents up to 5 levels
    let cur = process.cwd();
    for (let i = 0; i < 6; i++) { tryDirs.push(cur); cur = path.dirname(cur); }
    for (const dir of tryDirs) {
      const pkg = path.join(dir, 'package.json');
      try {
        if (!fs.existsSync(pkg)) continue;
        const json = JSON.parse(fs.readFileSync(pkg, 'utf8')) as any;
        const hasNext = json?.dependencies?.next || json?.devDependencies?.next || String(json?.scripts?.dev || '').includes('next');
        if (hasNext) return dir;
      } catch {}
    }
    // Fallback to cwd
    return process.cwd();
  }

  private findEmbeddedEditor(): string | null {
    try {
      const here = fileURLToPath(import.meta.url);
      const distCmdDir = path.dirname(here);
      const pkgRoot = path.resolve(distCmdDir, '..');
      const embeddedRoot = path.join(pkgRoot, 'editor');
      const server = path.join(embeddedRoot, 'standalone', 'server.js');
      const staticDir = path.join(embeddedRoot, 'static');
      const pubDir = path.join(embeddedRoot, 'public');
      if (fs.existsSync(server)) {
        // Ensure static + public co-located (Next standalone expects these paths relative)
        if (!fs.existsSync(staticDir) || !fs.existsSync(pubDir)) {
          // Warn but still attempt to run server.js
          this.log('[manta] warning: embedded static/public directories not found');
        }
        return embeddedRoot;
      }
    } catch {}
    return null;
  }

  private launchChildProject(opts: { projectDir: string; port: number }) {
    try {
      const pkgPath = path.join(opts.projectDir, 'package.json');
      const viteDir = fs.existsSync(path.join(opts.projectDir, 'vite-base-template'))
        ? path.join(opts.projectDir, 'vite-base-template')
        : null;

      const spawnDev = (cwd: string, viaVite: boolean) => {
        const args = viaVite ? ['run', 'dev', '--', '--port', String(opts.port)] : ['run', 'dev'];
        const env = { ...process.env, PORT: String(opts.port) } as NodeJS.ProcessEnv;
        const child = spawn('npm', args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' });
        child.on('error', (e) => this.logToStderr(`[child:error] ${e?.message ?? e}`));
        this.log(`[manta] child project started on http://localhost:${opts.port}`);
      };

      if (viteDir && fs.existsSync(path.join(viteDir, 'package.json'))) {
        spawnDev(viteDir, true);
        return;
      }
      if (fs.existsSync(pkgPath)) {
        // Heuristic: check for vite script
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as any;
          const usesVite = !!(pkg?.devDependencies?.vite || pkg?.dependencies?.vite || String(pkg?.scripts?.dev || '').includes('vite'));
          spawnDev(opts.projectDir, usesVite);
          return;
        } catch {}
      }
      // Fallback: attempt to run vite directly
      const child = spawn('npx', ['vite', '--port', String(opts.port)], { cwd: opts.projectDir, stdio: 'inherit', shell: true });
      child.on('error', (e) => this.logToStderr(`[child:error] ${e?.message ?? e}`));
    } catch (e) {
      this.logToStderr(`[manta] failed to start child project: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async ensureChildBridge(projectDir: string) {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const libCandidates = [
      path.join(projectDir, 'src', 'lib', 'varsHmr.ts'),
      path.join(projectDir, 'vite-base-template', 'src', 'lib', 'varsHmr.ts'),
    ];
    const mainCandidates = [
      path.join(projectDir, 'src', 'main.tsx'),
      path.join(projectDir, 'vite-base-template', 'src', 'main.tsx'),
    ];

    for (const libPath of libCandidates) {
      if (!fs.existsSync(libPath)) continue;
      try {
        const libSrc = fs.readFileSync(libPath, 'utf8');
        if (!libSrc.includes('enableParentVarBridge')) {
          const injected = libSrc + "\n\nexport function enableParentVarBridge() {\n  if (typeof window === 'undefined') return;\n  const handler = (ev: MessageEvent) => {\n    const data: any = (ev as any)?.data || {};\n    if (!data || (data.type !== 'manta:vars' && data.type !== 'manta:vars:update')) return;\n    const updates = data.updates || {};\n    if (updates && typeof updates === 'object') {\n      // @ts-ignore\n      if (typeof currentVars === 'undefined') (window as any).currentVars = {};\n      // @ts-ignore\n      currentVars = { ...currentVars, ...updates };\n      // @ts-ignore\n      if (typeof applyCssVarsFrom === 'function') (applyCssVarsFrom as any)(currentVars);\n      // @ts-ignore\n      if (typeof persistVarsJsonDebounced === 'function') (persistVarsJsonDebounced as any)(currentVars);\n    }\n  };\n  window.addEventListener('message', handler);\n}\n";
          fs.writeFileSync(libPath, injected, 'utf8');
        }
      } catch {}
    }

    for (const mainPath of mainCandidates) {
      if (!fs.existsSync(mainPath)) continue;
      try {
        const mainSrc = fs.readFileSync(mainPath, 'utf8');
        let next = mainSrc;
        if (!next.includes('enableParentVarBridge')) {
          if (/from\s+"\.\/lib\/varsHmr\.ts";?/.test(next)) {
            next = next.replace(
              /from\s+"\.\/lib\/varsHmr\.ts";?/,
              'from "./lib/varsHmr.ts";\nimport { enableParentVarBridge } from "./lib/varsHmr.ts";'
            );
          } else {
            next = 'import { enableParentVarBridge } from "./lib/varsHmr.ts";\n' + next;
          }
        }
        if (!/enableParentVarBridge\(\)/.test(next)) {
          if (/useEffect\(\(\)\s*=>\s*\{/.test(next)) {
            next = next.replace(/useEffect\(\(\)\s*=>\s*\{/, (m) => m + '\n    enableParentVarBridge();');
          } else {
            // Fallback: add a useEffect block near top-level
            next = next.replace(
              /(function\s+AppWrapper\s*\([^)]*\)\s*\{)/m,
              (m) => m + '\n  React.useEffect(() => { enableParentVarBridge(); }, []);'
            );
          }
        }
        if (next !== mainSrc) fs.writeFileSync(mainPath, next, 'utf8');
      } catch {}
    }
  }
}
