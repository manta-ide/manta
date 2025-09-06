import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import type {JobRecord, JobStatus, RunJobPayload, TerminateJobPayload} from './types.js';
import {readConfig} from '../config/store.js';
import {getProvider} from '../providers/index.js';

type WorkerOptions = {
  userId?: string;
};

export class JobWorker extends EventEmitter {
  private currentJob: JobRecord | null = null;
  private currentChild: ReturnType<typeof spawn> | null = null;
  private queue: JobRecord[] = [];
  private processing = false;
  private closed = false;
  private opts: WorkerOptions;
  private pollTimer: NodeJS.Timeout | null = null;
  private seenIds = new Set<string>();

  constructor(opts: WorkerOptions) {
    super();
    this.opts = opts;
  }

  async start(): Promise<void> {
    console.log('[manta] worker starting (polling mode only):', {
      userScope: this.opts.userId ?? null,
    });
    await this.loadQueuedJobs();
    // Start polling for jobs
    this.startPolling();
    void this.processNext();
  }

  private async loadQueuedJobs() {
    try {
      const apiBase = this.getApiBase();
      const resp = await fetch(`${apiBase}/api/jobs/queued`, { headers: this.authHeaders() });
      if (resp.ok) {
        const data: any = await resp.json();
        const jobs = Array.isArray(data?.jobs) ? data.jobs as JobRecord[] : [];
        console.log('[manta] initial queued jobs:', jobs.length);
    const filtered = this.opts.userId ? jobs.filter(j => j.user_id === this.opts.userId) : jobs;
        for (const j of filtered) this.enqueue(j);
      }
    } catch (e) { console.warn('[manta] failed to load initial jobs:', e); }
  }

  private enqueue(job: JobRecord) {
    if (this.queue.find(j => j.id === job.id)) return;
    if (this.seenIds.has(job.id)) return;
    this.queue.push(job);
    this.seenIds.add(job.id);
    console.log('[manta] enqueued job:', { id: job.id, job_name: job.job_name, status: job.status, priority: job.priority, user_id: job.user_id });
    this.queue.sort((a, b) => (b.priority - a.priority) || ((a.created_at ?? '').localeCompare(b.created_at ?? '')));
    if (!this.processing) void this.processNext();
  }

  private async processNext() {
    if (this.processing || this.closed) return;
    const job = this.queue.shift();
    if (!job) return;
    this.processing = true;
    console.log('[manta] attempting to claim job:', { id: job.id });
    let active: JobRecord | null = null;
    try {
      const apiBase = this.getApiBase();
      const resp = await fetch(`${apiBase}/api/jobs/claim`, { method: 'POST', headers: { ...this.authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: job.id }) });
      if (resp.ok) {
        const data: any = await resp.json();
        active = data?.job ?? null;
      }
    } catch (e) { console.warn('[manta] claim error:', e); }
    if (!active) { console.log('[manta] job already taken:', { id: job.id }); this.processing = false; return void this.processNext(); }
    this.currentJob = active;
    console.log('[manta] claimed job:', { id: active.id, job_name: active.job_name });
    try {
      if (active.job_name === 'run') await this.handleRun(active);
      else if (active.job_name === 'terminate') await this.handleTerminate(active);
      else throw new Error(`Unknown job_name: ${active.job_name}`);
      await this.finishJob(active.id, 'completed');
      console.log('[manta] job completed:', { id: active.id });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const cancelled = Boolean(e?.cancelled);
      await this.finishJob(active.id, cancelled ? 'cancelled' : 'failed', msg);
      console.error('[manta] job error:', { id: active.id, cancelled, error: msg });
    } finally {
      this.currentJob = null;
      this.processing = false;
      void this.processNext();
    }
  }

  private async handleRun(job: JobRecord) {
    const payload = (job.payload ?? {}) as RunJobPayload;
    if (payload.provider) {
      const provider = getProvider(payload.provider);
      if (!provider) throw new Error(`unknown provider: ${payload.provider}`);
      const args = payload.args?.length ? payload.args : (payload.prompt ? [payload.prompt] : []);
      console.log('[manta] provider exec:', { provider: provider.name, args });
      const code = await provider.run({ args, cwd: payload.cwd ?? process.cwd(), env: {...process.env, ...(payload.env ?? {})}, interactive: payload.interactive ?? false });
      if (code !== 0) throw new Error(`provider exited with code ${code}`);
      return;
    }
    if (!payload.cmd) throw new Error('run job missing payload.cmd');
    const rawArgs = payload.args ?? [];
    const envMerged = {...process.env, ...(payload.env ?? {})};
    const args = rawArgs.map((a) => typeof a === 'string' ? a.replace(/\$([A-Z0-9_]+)/g, (_m, v) => (envMerged[v] ?? _m)) : a);
    const quoteArg = (s: string) => /[^A-Za-z0-9_\-./]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
    const finalCmdLine = [payload.cmd, ...args.map((a: any) => quoteArg(String(a)))].join(' ');
    console.log('[manta] exec:', finalCmdLine, `(cwd: ${payload.cwd ?? process.cwd()})`);
    const child = spawn(payload.cmd, args, { cwd: payload.cwd ?? process.cwd(), env: envMerged, stdio: payload.interactive ? 'inherit' : 'pipe' });
    this.currentChild = child;
    const timeoutMs = Number(process.env.CLI_JOB_TIMEOUT_MS) > 0 ? Number(process.env.CLI_JOB_TIMEOUT_MS) : 0;
    await new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout | null = null;
      if (timeoutMs > 0) {
        timeout = setTimeout(() => { try { child.kill('SIGTERM'); } catch {} setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 500); }, timeoutMs);
      }
      if (child.stdout && !payload.interactive) child.stdout.on('data', (d) => process.stdout.write(d));
      if (child.stderr && !payload.interactive) child.stderr.on('data', (d) => process.stderr.write(d));
      child.on('error', reject);
      child.on('close', (code, signal) => {
        this.currentChild = null; if (timeout) clearTimeout(timeout);
        if (signal) { const err: any = new Error(`terminated by signal ${signal}`); err.cancelled = true; return reject(err); }
        if ((code ?? 0) !== 0) return reject(new Error(`exit code ${code}`));
        resolve();
      });
    });
  }

  private async handleTerminate(job: JobRecord) {
    const payload = (job.payload ?? {}) as TerminateJobPayload;
    if (this.currentChild) {
      this.currentChild.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      if (!this.currentChild.killed) this.currentChild.kill('SIGKILL');
      if (this.currentJob && this.currentJob.id !== job.id) await this.finishJob(this.currentJob.id, 'cancelled', 'Cancelled by terminate job');
      this.currentChild = null;
    }
  }

  private async finishJob(id: string, status: JobStatus, error?: string) {
    try {
      const apiBase = this.getApiBase();
      await fetch(`${apiBase}/api/jobs/finish`, { method: 'POST', headers: { ...this.authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status, errorMessage: error ?? null }) });
    } catch {}
  }

  private authHeaders(): Record<string, string> {
    const token = process.env.MANTA_API_KEY || readConfig().mantaApiKey || '';
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private getApiBase(): string {
    const fromEnv = process.env.MANTA_API_URL;
    const base = fromEnv || readConfig().mantaApiUrl || '';
    if (!base) throw new Error('MANTA_API_URL not set and not found in config');
    const trimmed = base.replace(/\/$/, '');
    // Ensure absolute URL
    try { new URL(trimmed); } catch { throw new Error(`Invalid MANTA_API_URL: ${base}`); }
    return trimmed;
  }

  private startPolling(intervalMs = 3000) {
    if (this.pollTimer) return;
    const apiBase = this.getApiBase();
    const tick = async () => {
      if (this.closed) return;
      try {
        const resp = await fetch(`${apiBase}/api/jobs/queued`, { headers: this.authHeaders() });
        if (resp.ok) {
          const data: any = await resp.json();
          const jobs: JobRecord[] = Array.isArray(data?.jobs) ? data.jobs : [];
          const filtered = this.opts.userId ? jobs.filter(j => j.user_id === this.opts.userId) : jobs;
          for (const j of filtered) this.enqueue(j);
        }
      } catch (e) {
        // Quietly ignore transient errors
      }
      this.pollTimer = setTimeout(tick, intervalMs);
    };
    this.pollTimer = setTimeout(tick, intervalMs);
  }
}
