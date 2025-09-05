# CLI Proxy (oclif)

A lightweight oclif-based CLI that proxies other CLIs via provider implementations. First provider: `codex` (https://github.com/openai/codex).

## Features

- Provider architecture to add new proxied CLIs
- Interactive passthrough using stdio inheritance
- `run` command delegates to provider with interactive passthrough
- `worker` command subscribes to Supabase Realtime jobs and executes them serially
- `auth` command logs into the Manta app, stores API key + user id

## Install / Dev

- Dev (TS directly):

```
cd cli-proxy
npm install
npm run dev -- providers
npm run dev -- run codex -- --help
npm run dev -- worker --user <user-id>
```

- Build + run:

```
npm run build
npm start -- providers
npm start -- run codex -- --help
npm start -- worker --user <user-id>
```

## Usage

- List providers:

```
mproxy providers
```

- Run arbitrary provider command (args after `--` are passed to the provider binary):

```
mproxy run codex -- <provider-args>
# examples
mproxy run codex -- --help
```

## Authenticate

```
mproxy auth --url http://localhost:3000
# Follow the printed steps to sign in and paste your session token.
# The CLI stores your API key + user id in ~/.mproxy/config.json.
```

## Authentication

- The proxy does not handle login. Please run provider login directly before using the proxy. For example:

```
codex login
```

## Job Worker

- Start worker (serial, non-parallel):

```
export SUPABASE_URL=...
export SUPABASE_ANON_KEY=...
export SUPABASE_SERVICE_ROLE_KEY=...
mproxy worker --user <user-id>
```

- Jobs table: `cli_jobs` (created by scripts/setup-supabase-tables.sql)
- Supported job_name values: `run`, `terminate`
- Queueing: jobs are processed one at a time, ordered by `priority` desc, then `created_at` asc. A worker atomically claims a job by setting `status=running`.
- Payloads:
  - `run`: `{ cmd: string, args?: string[], cwd?: string, env?: Record<string,string>, interactive?: boolean }`
  - `terminate`: `{ targetJobId?: string }` (terminates current process if running)

### Supabase SQL Setup

- Run `scripts/setup-supabase-tables.sql` in Supabase SQL editor to add the `cli_jobs` table, indexes, RLS, and realtime publication. It also enables `pgcrypto` for `gen_random_uuid()`.

### Env Vars

- Required: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- Recommended: `SUPABASE_SERVICE_ROLE_KEY` (to update job statuses reliably under RLS)
- Use the `user` flag to scope jobs by `user_id`; otherwise, the worker sees all queued jobs.

- Env loading: the worker auto-loads `.env` and `.env.local` from both `cli-proxy/` and the repo root. You can put your keys in the root `.env` and run the worker without exporting variables.

### Passing the user message to your command

- The API enqueues jobs with environment variables:
  - `JOB_MESSAGE_TEXT`: the message content as plain text
  - `JOB_MESSAGE_JSON`: the full message object as JSON
  - `JOB_NODE_ID`: selected node id (if provided)
  - `JOB_REBUILD_ALL`: "true" or "false"
- You can reference these directly in your command args using `$VAR` substitution (handled by the worker):

```
export CLI_JOB_CMD="your-binary"
export CLI_JOB_ARGS='["--message","$JOB_MESSAGE_TEXT"]'
```

- Example using bash to echo the message:

```
export CLI_JOB_CMD=bash
export CLI_JOB_ARGS='["-lc","echo Message: \"$JOB_MESSAGE_TEXT\""]'
```

### Codex MCP configuration (via env)

- The Codex provider automatically injects MCP config pointing to `scripts/mcp/server.ts` and forwards `MANTA_API_URL` and `MANTA_API_KEY` from the CLI config/env.

## Add a Provider

- Implement `Provider` in `src/providers/provider.ts`
- Add new provider class under `src/providers/<name>.ts`
- Register it in `src/providers/index.ts`

## Notes

- Interactive CLIs are supported via stdio passthrough. If deeper PTY emulation is needed later, we can add `node-pty` as an optional enhancement.
- Ensure the provider binary is available on PATH and you are already authenticated. For `codex`, install Codex CLI and run `codex login` as per its repository instructions.
