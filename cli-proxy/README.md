# CLI Proxy (oclif)

A lightweight oclif-based CLI that proxies other CLIs via provider implementations. First provider: `codex` (https://github.com/openai/codex).

## Features

- Provider architecture to add new proxied CLIs
- Interactive passthrough using stdio inheritance
- `run` command delegates to provider with interactive passthrough

## Install / Dev

- Dev (TS directly):

```
cd cli-proxy
npm install
npm run dev -- providers
npm run dev -- run codex -- --help
```

- Build + run:

```
npm run build
npm start -- providers
npm start -- run codex -- --help
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

## Authentication

- The proxy does not handle login. Please run provider login directly before using the proxy. For example:

```
codex login
```

## Add a Provider

- Implement `Provider` in `src/providers/provider.ts`
- Add new provider class under `src/providers/<name>.ts`
- Register it in `src/providers/index.ts`

## Notes

- Interactive CLIs are supported via stdio passthrough. If deeper PTY emulation is needed later, we can add `node-pty` as an optional enhancement.
- Ensure the provider binary is available on PATH and you are already authenticated. For `codex`, install Codex CLI and run `codex login` as per its repository instructions.
