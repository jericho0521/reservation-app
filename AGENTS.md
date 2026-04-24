# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 16 reservation app using the App Router. Route pages and API handlers live in `app/`; key areas include `app/admin`, `app/api`, `app/chat-booking`, and `app/form-booking`. Reusable UI is organized by domain in `components/`, with shared primitives under `components/ui` and `components/shared`. Business utilities live in `lib/`, shared types in `types/`, scripts in `scripts/`, static assets in `public/`, and knowledge content in `data/knowledge.md`.

## Build, Test, and Development Commands

Use pnpm because the repository includes `pnpm-lock.yaml` and CI runs pnpm.

- `pnpm dev`: starts the local Next.js server on `http://localhost:4000`.
- `pnpm build`: creates a production build with Next.js.
- `pnpm start`: serves the production build.
- `pnpm lint`: runs ESLint with Next.js core web vitals and TypeScript rules.
- `pnpm test`: runs the Node test suite through `tsx`.
- `pnpm pr`: pushes the current branch and opens a PR using `scripts/pr.mjs`.

## Coding Style & Naming Conventions

Write TypeScript and React components with strict typing enabled. Use the `@/*` path alias for clear root-relative imports. Keep route files named by Next.js convention, such as `page.tsx`, `layout.tsx`, and `route.ts`. Use PascalCase for React components (`BookingSummary.tsx`), camelCase for functions and variables, and descriptive route folders. Follow the existing two-space indentation style and double-quote imports. Run `pnpm lint` before submitting changes.

## Testing Guidelines

Tests use Node's built-in test runner with `tsx`. Keep tests close to the code they cover and name them `*.test.ts` or `*.test.tsx`, as in `lib/availability.test.ts` and `components/analytics/renderer/renderer.test.tsx`. Update `package.json` when adding tests because `pnpm test` lists paths explicitly. Cover API logic, data transforms, dashboard specs, and availability rules when changing those areas.

## Commit & Pull Request Guidelines

Recent history uses short conventional-style subjects such as `feat: add draggable analytics layouts` and `ci: add deploy skeleton and PR helper`. Prefer `feat:`, `fix:`, `ci:`, `docs:`, or `refactor:` followed by a concise imperative summary. PRs should include a clear description, linked issue when applicable, screenshots for UI changes, and notes about test coverage. Target feature branches to `staging`; target `staging` to `master` for release flow.

## Security & Configuration Tips

Keep secrets in `.env` locally and never commit real credentials. CI and production-like builds expect `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, and `OPENROUTER_API_KEY`. When touching Supabase or AI integrations, verify missing or placeholder environment values fail gracefully.
