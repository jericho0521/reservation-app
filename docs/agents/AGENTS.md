# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 16 reservation app using the App Router. Route pages and API handlers live in `app/`, with key areas such as `app/admin`, `app/api`, `app/chat-booking`, and `app/form-booking`. Reusable UI is organized by domain in `components/`; shared primitives live in `components/ui` and common cross-page pieces in `components/shared`. Business utilities live in `lib/`, shared types in `types/`, scripts in `scripts/`, static assets in `public/`, and knowledge content in `data/knowledge.md`.

## Build, Test, and Development Commands

Use `pnpm`, since the repository includes `pnpm-lock.yaml` and CI expects pnpm.

- `pnpm dev`: starts the local Next.js server at `http://localhost:4000`.
- `pnpm build`: creates a production build.
- `pnpm start`: serves the production build.
- `pnpm lint`: runs ESLint with Next.js core web vitals and TypeScript rules.
- `pnpm test`: runs the Node test suite through `tsx`.
- `pnpm pr`: pushes the current branch and opens a PR with `scripts/pr.mjs`.

## Coding Style & Naming Conventions

Write TypeScript and React with strict typing. Use the `@/*` path alias for root-relative imports. Follow Next.js file conventions such as `page.tsx`, `layout.tsx`, and `route.ts`. Use PascalCase for React components, for example `BookingSummary.tsx`, and camelCase for functions and variables. Keep the existing two-space indentation style and double-quote imports. Run `pnpm lint` before submitting changes.

## Testing Guidelines

Tests use Node's built-in test runner with `tsx`. Keep tests close to the code they cover and name them `*.test.ts` or `*.test.tsx`, such as `lib/availability.test.ts` or `components/analytics/renderer/renderer.test.tsx`. When adding test files, update `package.json` because `pnpm test` lists paths explicitly. Prioritize coverage for API logic, data transforms, dashboard specifications, and availability rules.

## Commit & Pull Request Guidelines

Recent history uses short conventional-style subjects such as `feat: add draggable analytics layouts` and `ci: add deploy skeleton and PR helper`. Prefer `feat:`, `fix:`, `ci:`, `docs:`, or `refactor:` followed by a concise imperative summary. PRs should include a clear description, linked issue when applicable, screenshots for UI changes, and test coverage notes. Target feature branches to `staging`; target `staging` to `main` for release flow.

## Security & Configuration Tips

Keep secrets in `.env` locally and never commit real credentials. Supabase is hosted on a server, so use the configured hosted Supabase URL and anon key rather than assuming a local database. CI and production-like builds expect `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, and `OPENROUTER_API_KEY`. When touching Supabase or AI integrations, verify missing or placeholder environment values fail gracefully.
