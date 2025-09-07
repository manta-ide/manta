export type RunOptions = {
  args: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  interactive?: boolean;
  jobKind?: 'graph-editor' | 'build-nodes' | string;
};

export interface Provider {
  readonly name: string;
  readonly bin: string;
  ensureAvailable(): Promise<void>;
  run(opts: RunOptions): Promise<number>;
}
