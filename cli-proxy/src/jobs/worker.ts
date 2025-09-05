import {createClient, SupabaseClient} from '@supabase/supabase-js';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import type {JobRecord, JobName, JobStatus, RunJobPayload, TerminateJobPayload} from './types.js';

type WorkerOptions = {
  supabaseUrl: string;
  supabaseAnonKey: string; // for realtime subscribe
  supabaseServiceRoleKey?: string; // for updates/inserts
  userId?: string; // optional filter by user
};

export class JobWorker extends EventEmitter {
  private realtimeClient: SupabaseClient | null = null;
  private dbClient: SupabaseClient | null = null;
  private currentJob: JobRecord | null = null;
  private currentChild: ReturnType<typeof spawn> | null = null;
  private queue: JobRecord[] = [];
  private processing = false;
  private closed = false;
  private opts: WorkerOptions;

  constructor(opts: WorkerOptions) {
    super();
    this.opts = opts;
  }

  async start(): Promise<void> {
    if (this.realtimeClient) return;
    // Use service role key for both realtime and DB to bypass RLS for subscriptions and updates
    const keyForRealtime = this.opts.supabaseServiceRoleKey ?? this.opts.supabaseAnonKey;
    console.log('[worker] starting with config:', {
      url: this.opts.supabaseUrl,
      hasAnonKey: Boolean(this.opts.supabaseAnonKey),
      hasServiceRoleKey: Boolean(this.opts.supabaseServiceRoleKey),
      userScope: this.opts.userId ?? null,
    });
    this.realtimeClient = createClient(this.opts.supabaseUrl, keyForRealtime);
    this.dbClient = createClient(this.opts.supabaseUrl, this.opts.supabaseServiceRoleKey ?? this.opts.supabaseAnonKey);

    // Initial load of queued jobs
    await this.loadQueuedJobs();

    console.log('[worker] subscribing to realtime changes for cli_jobs...');
    const channel = this.realtimeClient
      .channel('cli-jobs-worker')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'cli_jobs',
        // Note: avoid combining multiple filters; filter by user in code to maximize compatibility
        filter: this.opts.userId ? `user_id=eq.${this.opts.userId}` : undefined,
      }, (payload) => {
        const rec = payload.new as JobRecord | undefined;
        if (!rec) return;
        console.log('[worker] realtime INSERT received:', { id: rec.id, user_id: rec.user_id, status: rec.status, job_name: rec.job_name });
        if (rec.status === 'queued' && (!this.opts.userId || rec.user_id === this.opts.userId)) this.enqueue(rec);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'cli_jobs',
        filter: this.opts.userId ? `user_id=eq.${this.opts.userId}` : undefined,
      }, (payload) => {
        const rec = payload.new as JobRecord | undefined;
        if (!rec) return;
        console.log('[worker] realtime UPDATE received:', { id: rec.id, user_id: rec.user_id, status: rec.status, job_name: rec.job_name });
        if (rec.status === 'queued' && (!this.opts.userId || rec.user_id === this.opts.userId)) this.enqueue(rec);
      })
      .subscribe((status) => {
        console.log('[worker] realtime channel status:', status);
      });

    // Kick processing
    this.processNext().catch((e) => this.emit('error', e));
  }

  async stop(): Promise<void> {
    this.closed = true;
    try { await this.realtimeClient?.removeAllChannels(); } catch {}
    this.realtimeClient = null;
  }

  private async loadQueuedJobs() {
    const {data, error} = await this.dbClient!
      .from('cli_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('priority', {ascending: false})
      .order('created_at', {ascending: true});
    if (error) {
      this.emit('error', error);
      return;
    }
    const filtered = this.opts.userId ? data.filter(j => j.user_id === this.opts.userId) : data;
    console.log('[worker] initial queued jobs:', filtered?.length ?? 0);
    for (const j of filtered) this.enqueue(j as JobRecord);
  }

  private enqueue(job: JobRecord) {
    // Prevent duplicates
    if (this.queue.find(j => j.id === job.id)) return;
    this.queue.push(job);
    console.log('[worker] enqueued job:', { id: job.id, job_name: job.job_name, status: job.status, priority: job.priority, user_id: job.user_id });
    // Simple priority ordering: higher priority first, then created_at asc
    this.queue.sort((a, b) => (b.priority - a.priority) || ((a.created_at ?? '').localeCompare(b.created_at ?? '')));
    // If a terminate job arrives and a process is running, attempt immediate termination
    if (job.job_name === 'terminate' && this.currentChild) {
      try {
        this.currentChild.kill('SIGTERM');
        // best-effort: mark running job as cancelled
        if (this.currentJob) {
          void this.dbClient!
            .from('cli_jobs')
            .update({status: 'cancelled', finished_at: new Date().toISOString(), error_message: 'Cancelled by terminate job'})
            .eq('id', this.currentJob.id);
        }
      } catch {}
    }
    if (!this.processing) void this.processNext();
  }

  private async processNext() {
    if (this.processing || this.closed) return;
    const job = this.queue.shift();
    if (!job) return; // nothing to do
    this.processing = true;
    console.log('[worker] attempting to claim job:', { id: job.id });

    // Attempt to claim job by transitioning to running atomically
    const {data: claimed, error: claimError} = await this.dbClient!
      .from('cli_jobs')
      .update({status: 'running', started_at: new Date().toISOString()})
      .eq('id', job.id)
      .eq('status', 'queued')
      .select('*')
      .limit(1);

    if (claimError) {
      this.emit('error', claimError);
      this.processing = false;
      console.error('[worker] failed to claim job:', { id: job.id, error: claimError.message });
      return void this.processNext();
    }
    if (!claimed || claimed.length === 0) {
      // another worker took it
      this.processing = false;
      console.log('[worker] job already taken, skipping:', { id: job.id });
      return void this.processNext();
    }

    const active = claimed[0] as JobRecord;
    this.currentJob = active;
    console.log('[worker] claimed job:', { id: active.id, job_name: active.job_name });
    try {
      if (active.job_name === 'run') {
        await this.handleRun(active);
      } else if (active.job_name === 'terminate') {
        await this.handleTerminate(active);
      } else {
        throw new Error(`Unknown job_name: ${active.job_name}`);
      }
      await this.finishJob(active.id, 'completed');
      console.log('[worker] job completed:', { id: active.id });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const cancelled = Boolean(e?.cancelled);
      await this.finishJob(active.id, cancelled ? 'cancelled' : 'failed', msg);
      console.error('[worker] job finished with error:', { id: active.id, cancelled, error: msg });
    } finally {
      this.currentJob = null;
      this.processing = false;
      // continue with next job
      void this.processNext();
    }
  }

  private async handleRun(job: JobRecord) {
    const payload = (job.payload ?? {}) as RunJobPayload;
    if (!payload.cmd) throw new Error('run job missing payload.cmd');
    const rawArgs = payload.args ?? [];
    const envMerged = {...process.env, ...(payload.env ?? {})};
    // Simple $VAR substitution in args using envMerged
    const args = rawArgs.map((a) => typeof a === 'string' ? a.replace(/\$([A-Z0-9_]+)/g, (_m, v) => (envMerged[v] ?? _m)) : a);
    const quoteArg = (s: string) => /[^A-Za-z0-9_\-./]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s;
    const finalCmdLine = [payload.cmd, ...args.map((a: any) => quoteArg(String(a)))].join(' ');
    console.log('[worker] spawning child:', { cmd: payload.cmd, args, cwd: payload.cwd || process.cwd() });
    console.log(`[worker] exec: ${finalCmdLine} (cwd: ${payload.cwd ?? process.cwd()})`);
    const child = spawn(payload.cmd, args, {
      cwd: payload.cwd ?? process.cwd(),
      env: envMerged,
      stdio: payload.interactive ? 'inherit' : 'pipe',
    });
    this.currentChild = child;
    const timeoutMs = typeof (payload as any).timeoutMs === 'number' && (payload as any).timeoutMs > 0
      ? (payload as any).timeoutMs
      : (Number(process.env.CLI_JOB_TIMEOUT_MS) > 0 ? Number(process.env.CLI_JOB_TIMEOUT_MS) : 0);
    await new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout | null = null;
      if (timeoutMs > 0) {
        timeout = setTimeout(() => {
          console.warn(`[worker] job ${job.id} exceeded timeout ${timeoutMs}ms; sending SIGTERM`);
          try { child.kill('SIGTERM'); } catch {}
          setTimeout(() => {
            if (!child.killed) {
              console.warn(`[worker] job ${job.id} still running; sending SIGKILL`);
              try { child.kill('SIGKILL'); } catch {}
            }
          }, 500);
        }, timeoutMs);
      }
      if (child.stdout && !payload.interactive) child.stdout.on('data', (d) => process.stdout.write(d));
      if (child.stderr && !payload.interactive) child.stderr.on('data', (d) => process.stderr.write(d));
      child.on('error', reject);
      child.on('close', (code, signal) => {
        this.currentChild = null;
        if (timeout) clearTimeout(timeout);
        if (signal) {
          const err: any = new Error(`terminated by signal ${signal}`);
          err.cancelled = true;
          return reject(err);
        }
        if ((code ?? 0) !== 0) return reject(new Error(`exit code ${code}`));
        resolve();
      });
    });
  }

  private async handleTerminate(job: JobRecord) {
    const payload = (job.payload ?? {}) as TerminateJobPayload;
    // For now we only support terminating current child
    if (this.currentChild) {
      this.currentChild.kill('SIGTERM');
      // give it a moment, then SIGKILL if needed
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (!this.currentChild.killed) {
        this.currentChild.kill('SIGKILL');
      }
      // Mark the running job (if any) as cancelled
      if (this.currentJob && this.currentJob.id !== job.id) {
        await this.dbClient!
          .from('cli_jobs')
          .update({status: 'cancelled', finished_at: new Date().toISOString(), error_message: 'Cancelled by terminate job'})
          .eq('id', this.currentJob.id);
      }
      this.currentChild = null;
    }
  }

  private async finishJob(id: string, status: JobStatus, error?: string) {
    await this.dbClient!
      .from('cli_jobs')
      .update({status, finished_at: new Date().toISOString(), error_message: error ?? null})
      .eq('id', id);
  }
}
