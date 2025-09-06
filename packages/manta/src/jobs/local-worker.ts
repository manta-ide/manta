import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {getProvider} from '../providers/index.js';

type JobStatus = 'queued'|'running'|'completed'|'failed'|'cancelled';

type JobRecord = {
  id: string;
  user_id?: string;
  job_name: 'run'|'terminate';
  status: JobStatus;
  priority: number;
  payload?: any;
  created_at?: string;
  updated_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
};

type Options = {
  projectDir: string;
  pollMs?: number;
};

export class LocalJobWorker extends EventEmitter {
  private opts: Options;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private currentChild: ReturnType<typeof spawn> | null = null;

  constructor(opts: Options) {
    super();
    this.opts = opts;
  }

  private jobsPath(): string { return path.join(this.opts.projectDir, '_graph', 'jobs.json'); }
  private readJobs(): JobRecord[] {
    try { const p = this.jobsPath(); if (!fs.existsSync(p)) return []; return JSON.parse(fs.readFileSync(p, 'utf8')) as JobRecord[]; } catch { return []; }
  }
  private writeJobs(jobs: JobRecord[]) {
    try { fs.mkdirSync(path.dirname(this.jobsPath()), { recursive: true }); fs.writeFileSync(this.jobsPath(), JSON.stringify(jobs, null, 2), 'utf8'); } catch {}
  }

  async start() {
    if (this.timer) return;
    const tick = async () => {
      try { await this.pollOnce(); } catch (e) { this.emit('error', e); }
      this.timer = setTimeout(tick, this.opts.pollMs ?? 1500);
    };
    this.timer = setTimeout(tick, 200);
  }

  async stop() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.currentChild) try { this.currentChild.kill('SIGTERM'); } catch {}
  }

  private async pollOnce() {
    if (this.running) return;
    const jobs = this.readJobs();
    const queued = jobs.filter(j => j.status === 'queued');
    if (queued.length === 0) return;
    queued.sort((a, b) => (b.priority - a.priority) || ((a.created_at ?? '').localeCompare(b.created_at ?? '')));
    const job = queued[0];
    const idx = jobs.findIndex(j => j.id === job.id);
    if (idx === -1) return;
    const now = new Date().toISOString();
    jobs[idx] = { ...jobs[idx], status: 'running', started_at: now, updated_at: now };
    this.writeJobs(jobs);
    this.running = true;
    try {
      if (job.job_name === 'run') await this.handleRun(job);
      else if (job.job_name === 'terminate') await this.handleTerminate(job);
      const done = this.readJobs();
      const di = done.findIndex(j => j.id === job.id);
      if (di !== -1) { done[di] = { ...done[di], status: 'completed', finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null }; this.writeJobs(done); }
    } catch (e: any) {
      const fail = this.readJobs();
      const fi = fail.findIndex(j => j.id === job.id);
      if (fi !== -1) { fail[fi] = { ...fail[fi], status: 'failed', finished_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: e?.message ?? String(e) }; this.writeJobs(fail); }
    } finally { this.running = false; }
  }

  private async handleRun(job: JobRecord) {
    const payload = (job.payload ?? {}) as any;
    if (payload.provider) {
      const provider = getProvider(payload.provider);
      if (!provider) throw new Error(`unknown provider: ${payload.provider}`);
      const args = payload.args?.length ? payload.args : (payload.prompt ? [payload.prompt] : []);
      const code = await provider.run({ args, cwd: payload.cwd ?? this.opts.projectDir, env: {...process.env, ...(payload.env ?? {})}, interactive: payload.interactive ?? false });
      if (code !== 0) throw new Error(`provider exited with code ${code}`);
      return;
    }
    if (!payload.cmd) throw new Error('run job missing payload.cmd');
    const rawArgs = payload.args ?? [];
    const envMerged = {...process.env, ...(payload.env ?? {})};
    const args = rawArgs.map((a: any) => typeof a === 'string' ? a : String(a));
    const child = spawn(payload.cmd, args, { cwd: payload.cwd ?? this.opts.projectDir, env: envMerged, stdio: payload.interactive ? 'inherit' : 'pipe' });
    this.currentChild = child;
    await new Promise<void>((resolve, reject) => {
      if (child.stdout && !payload.interactive) child.stdout.on('data', (d) => process.stdout.write(d));
      if (child.stderr && !payload.interactive) child.stderr.on('data', (d) => process.stderr.write(d));
      child.on('error', reject);
      child.on('close', (code) => { this.currentChild = null; if ((code ?? 0) !== 0) return reject(new Error(`exit code ${code}`)); resolve(); });
    });
  }

  private async handleTerminate(_job: JobRecord) {
    if (this.currentChild) {
      try { this.currentChild.kill('SIGTERM'); } catch {}
      await new Promise((r) => setTimeout(r, 300));
      try { if (!this.currentChild.killed) this.currentChild.kill('SIGKILL'); } catch {}
      this.currentChild = null;
    }
  }
}

