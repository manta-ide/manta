# Manta CLI

Provider proxy + job worker with Codex + MCP integration.

## Install

- Local (recommended for development):
  - `npm i` (in your repo root)
  - `npm --prefix packages/manta run build`
  - `npm --prefix packages/manta start -- --help`

- Global (after publish):
  - `npm i -g manta`

## Commands

- `manta init` — download a project template into the current directory (no auth required).
- `manta run` — launch the local editor in your browser and start a local job worker. Uses filesystem-backed storage in `./_graph`.
- `manta providers` — list available providers.

## Notes

- The Codex provider runs `codex exec "<prompt>"` and injects MCP config. It uses `manta-mcp` if available, falling back to the local script.
- The worker processes jobs serially. Jobs can target a provider (`{ provider: 'codex', prompt: '...' }`).
- Storage: `./_graph/graph.xml` for the graph (XML), `./_graph/vars.json` for variables, `./_graph/jobs.json` for the local job queue.

## Usage (local)

- Initialize a project folder with a template:
  - `manta init` (run inside your target directory)
- Run the editor + worker against the current folder:
  - `manta run` (opens `http://localhost:3000`)
  - Flags: `--project <dir>`, `--port 3000`, `--open`, `--dev` (dev vs start), `--editorDir <path>`

## Packaging the Editor Into the CLI

- Build the Next.js app in standalone mode at the repo root:
  - Ensure `next.config.ts` has `output: 'standalone'` (already set).
  - Run: `npm run build` (requires network for fonts; or self-host fonts).
- Copy the build artifacts into the CLI package:
  - `npm --prefix packages/manta run build`
  - `npm --prefix packages/manta run pack:editor`
- After publishing the CLI (`npm publish`), `manta run` will launch the embedded editor without needing the repo.
