export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobName = 'run' | 'terminate';

export interface BaseJobPayload {
  // free-form fields for future providers or behaviors
  [key: string]: unknown;
}

export interface RunJobPayload extends BaseJobPayload {
  // Either specify a raw command to execute OR a provider to delegate to
  cmd?: string; // binary or shell command to execute
  args?: string[]; // args to pass to the command
  provider?: string; // e.g., 'codex'
  prompt?: string; // optional single-string prompt for provider CLIs
  cwd?: string;
  env?: Record<string, string>;
  interactive?: boolean; // defaults to false in worker
}

export interface TerminateJobPayload extends BaseJobPayload {
  targetJobId?: string; // optional target job id to cancel; defaults to current
}

export interface JobRecord {
  id: string;
  user_id: string;
  job_name: JobName;
  status: JobStatus;
  payload: any | null;
  priority: number;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
}
