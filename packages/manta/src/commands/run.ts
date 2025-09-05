import {Command, Flags} from '@oclif/core';
import {readConfig} from '../config/store.js';
import {JobWorker} from '../jobs/worker.js';

export default class Run extends Command {
  static description = 'Start the Manta job worker (queues: run/terminate)';

  static flags = {
    user: Flags.string({ description: 'Optional user id to scope jobs; defaults to saved user id' }),
  } as const;

  async run(): Promise<void> {
    const {flags} = await this.parse(Run);

    const cfg = readConfig();
    if (!cfg.mantaApiUrl || !cfg.mantaApiKey) return this.error('Run `manta init` first to save API URL and key.');
    // Fetch Supabase public config from backend
    let supabaseUrl: string | undefined;
    let supabaseAnonKey: string | undefined;
    try {
      const resp = await fetch(`${cfg.mantaApiUrl.replace(/\/$/, '')}/api/supabase/config`, { headers: { authorization: `Bearer ${cfg.mantaApiKey}` } });
      if (resp.ok) {
        const data: any = await resp.json();
        supabaseUrl = data?.url; supabaseAnonKey = data?.anonKey;
      }
    } catch {}
    if (!supabaseUrl || !supabaseAnonKey) return this.error('Failed to resolve Supabase config from backend.');
    const userId = flags.user ?? cfg.userId ?? undefined;
    if (!flags.user && cfg.userId) this.log(`[manta] using saved user id: ${cfg.userId}`);

    // Make API URL + token available to worker HTTP calls
    if (cfg.mantaApiUrl) process.env.MANTA_API_URL = cfg.mantaApiUrl;
    if (cfg.mantaApiKey) process.env.MANTA_API_KEY = cfg.mantaApiKey;
    const worker = new JobWorker({ supabaseUrl, supabaseAnonKey, userId });
    worker.on('error', (e) => this.logToStderr(`[worker:error] ${e?.message ?? e}`));
    await worker.start();
    this.log('Worker started. Listening for queued jobs...');
    await new Promise<void>(() => {});
  }
}
