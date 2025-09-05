export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type JobName = 'run' | 'terminate';

export interface BaseJobPayload {
  [key: string]: unknown;
}

export interface RunJobPayload extends BaseJobPayload {
  cmd?: string;
  args?: string[];
  provider?: string;
  prompt?: string;
  cwd?: string;
  env?: Record<string, string>;
  interactive?: boolean;
}

export interface TerminateJobPayload extends BaseJobPayload {
  targetJobId?: string;
}

export interface JobRecord {
  id: string;
  user_id: string;
  job_name: 'run' | 'terminate';
  status: JobStatus;
  payload: any | null;
  priority: number;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  error_message?: string | null;
}

