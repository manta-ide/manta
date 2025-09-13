# Repository Guidelines

## Project Structure & Module Organization
- Root app: Next.js (TypeScript) in `src` with App Router.
  - UI in `src/components`, hooks in `src/hooks`, utilities in `src/lib`.
  - Routes: pages under `src/app` (e.g., `page.tsx`), API under `src/app/api/*`.
- Public assets in `public/`.
- Helper scripts in `scripts/` (e.g., `scripts/setup-db.ts`).
- Vite template in `vite-base-template/` (standalone dev environment).

## Build, Test, and Development Commands
- Root app:
  - `npm run dev` — start Next.js with Turbopack on `http://localhost:3000`.
  - `npm run build` — production build.
  - `npm run start` — run built app.
  - `npm run lint` — ESLint checks.
- Vite template:
  - `cd vite-base-template && npm run dev` — start Vite (default `:5173`).
  - `npm --prefix vite-base-template run build` — build Vite app.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict` enabled, `noEmit: true`). Path alias `@/*` → `src/*`.
- Linting: Next.js + TypeScript config (`eslint.config.mjs`); `@typescript-eslint/no-explicit-any` is disabled.
- Indentation: 2 spaces. Components in PascalCase, variables/functions in camelCase, files in kebab-case (Next.js conventions like `page.tsx`, `route.ts`).
- Styling: Tailwind CSS v4 is configured.

## Testing Guidelines
- No test runner is currently configured. Prefer:
  - Unit/UI: Vitest or Jest + React Testing Library.
  - E2E: Playwright.
- Place tests next to source: `Component.test.tsx` or under `__tests__/`.
- Aim for critical-path coverage (core components, API handlers).

## Commit & Pull Request Guidelines
- Commit messages: imperative, concise, scoped if helpful.
  - Examples: `feat(editor): add split panes`, `fix(api): handle 500 on export`.
- PRs must include:
  - Summary of changes and rationale.
  - Steps to test locally; attach screenshots for UI changes.
  - Linked issue(s) and checklist: builds, lints, and runs locally.

## Security & Configuration Tips
- Environment: use `.env.local` for developer machines; do not commit secrets.
- Key vars: `NEXT_PUBLIC_*` are client-exposed.
- Rotate any leaked credentials promptly; prefer per-env keys.
- Proxy/iframe: app rewrites `/iframe/*` to a dynamic API (`src/app/api/iframe`).
