import { Command, Flags } from '@oclif/core';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { readConfig } from '../config/store.js';
import { JobWorker } from '../jobs/worker.js';
class Worker extends Command {
    async run() {
        const { flags } = await this.parse(Worker);
        // Load env from common locations so manual `export` is unnecessary
        const tryLoad = (p) => {
            if (fs.existsSync(p)) {
                dotenv.config({ path: p });
                this.log(`[worker] loaded env: ${p}`);
            }
        };
        const cwd = process.cwd();
        // Local env in cli-proxy/
        tryLoad(path.join(cwd, '.env'));
        tryLoad(path.join(cwd, '.env.local'));
        // Repo root env one level up
        tryLoad(path.join(cwd, '..', '.env'));
        tryLoad(path.join(cwd, '..', '.env.local'));
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!supabaseUrl || !supabaseAnonKey) {
            this.error('Supabase URL and anon key are required. Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.');
            return;
        }
        const cfg = readConfig();
        const scopedUser = flags.user ?? cfg.userId ?? undefined;
        if (!flags.user && cfg.userId) {
            this.log(`[worker] using saved user id: ${cfg.userId}`);
        }
        const worker = new JobWorker({
            supabaseUrl,
            supabaseAnonKey,
            supabaseServiceRoleKey,
            userId: scopedUser,
        });
        worker.on('error', (e) => this.logToStderr(`[worker:error] ${e?.message ?? e}`));
        await worker.start();
        this.log('Worker started. Listening for queued jobs...');
        // keep process alive
        await new Promise(() => { });
    }
}
Worker.description = 'Start a Supabase-backed job worker that processes run/terminate jobs serially';
Worker.flags = {
    user: Flags.string({
        description: 'Optional user id to scope jobs to',
    }),
};
export default Worker;
//# sourceMappingURL=worker.js.map