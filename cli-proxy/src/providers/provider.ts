export type RunOptions = {
  args: string[];
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  interactive?: boolean; // if true, pass through stdio
};

export interface Provider {
  readonly name: string;
  readonly bin: string; // executable name to spawn

  // Optional: check that binary exists and is runnable
  ensureAvailable(): Promise<void>;

  // Run provider command with args; returns exit code
  run(opts: RunOptions): Promise<number>;
}
