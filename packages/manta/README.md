# Manta CLI

Provider proxy + Supabase-backed job worker with Codex + MCP integration.

## Install

- Local (recommended for development):
  - `npm i` (in your repo root)
  - `npm --prefix packages/manta run build`
  - `npm --prefix packages/manta start -- --help`

- Global (after publish):
  - `npm i -g manta`

## Commands

- `manta init` — open sign-in, prompt for token, store API key + user id, ensure `manta-mcp` is installed.
- `manta run` — start the worker (uses saved user id by default). Requires Supabase env (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- `manta providers` — list available providers.

## Notes

- The Codex provider runs `codex exec "<prompt>"` and injects MCP config. It uses `manta-mcp` if available, falling back to the local script.
- Credentials are stored in `~/.manta/config.json`.
- The worker processes `cli_jobs` serially. Jobs can target a provider (`{ provider: 'codex', prompt: '...' }`).

