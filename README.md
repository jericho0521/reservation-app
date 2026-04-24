This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
pnpm dev
```

Open [http://localhost:4000](http://localhost:4000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Continuous Integration

GitHub Actions CI is configured in `.github/workflows/ci.yml`.

The workflow runs on pushes, pull requests, and manual dispatches, and executes:

- `pnpm test`
- `pnpm lint`
- `pnpm build`

For the most reliable CI builds, configure these GitHub repository variables or secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_CHAT_MODEL` (optional, defaults to `google/gemini-2.5-flash`)

The workflow includes placeholder fallbacks so verification can still run before real secrets are configured, but production-like builds should use real values.

## Booking Assistant RAG

The chat assistant retrieves business information from `data/knowledge.md` through Supabase pgvector.

### First-time Setup

1. Run `supabase/knowledge.sql` in the Supabase SQL editor.
2. Add these local environment values to `.env`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `OPENROUTER_API_KEY`
   - `GOOGLE_EMBEDDING_MODEL` (optional, defaults to `gemini-embedding-001`)
3. Seed the knowledge chunks:

```bash
pnpm seed:knowledge
```

### Updating Knowledge Base

Whenever you edit `data/knowledge.md`, re-run the seed command to regenerate embeddings and push the updated content to Supabase:

```bash
pnpm seed:knowledge
```

That's it. The script clears old chunks, re-splits the markdown by headings, generates new 768-dimension embeddings via Gemini, and inserts them into the `knowledge_chunks` table. No manual SQL needed.

### Details

The knowledge setup assumes 768-dimensional embeddings so it matches `supabase/knowledge.sql`.

To test a stronger chat model without code changes, set:

```bash
OPENROUTER_CHAT_MODEL=google/gemini-2.5-pro
```

## AI Sales Report Processing

The AI Analytics reports panel needs two Supabase tables plus a private Storage bucket before uploads will work.

### First-time Setup

1. Run `supabase/sales-reports.sql` in the Supabase SQL editor.
2. Refresh `/admin/analytics`.
3. Upload a PDF, JPG, PNG, or WebP daily sales report from the Daily Sales Reports panel.

If the panel says sales report storage is not set up, Supabase has not applied `supabase/sales-reports.sql` yet or the PostgREST schema cache has not refreshed.

## Branch-Based Delivery Flow

The repository now supports a simple branch pipeline:

- feature branches: run CI on push and pull request
- `staging`: run CI plus the staging deploy skeleton in `.github/workflows/deploy.yml`
- `master`: run CI plus the production deploy skeleton in `.github/workflows/deploy.yml`

The deploy workflow currently verifies the app and then runs placeholder deploy jobs for the `staging` and `production` GitHub environments. This gives you the branch automation structure now without locking you into a deployment provider yet.

Recommended next setup in GitHub:

- create GitHub environments named `staging` and `production`
- add environment-specific secrets there if your deploy target needs them
- optionally require manual approval for the `production` environment

When you are ready to deploy for real, replace the placeholder deploy step in `.github/workflows/deploy.yml` with your provider-specific command.

## Fast PR Command

Use this command to push your current branch and create a pull request if one does not already exist:

```bash
pnpm pr
```

Default branch flow:

- feature branches -> `staging`
- `staging` -> `master`

Useful options:

- `pnpm pr -- --base staging`
- `pnpm pr -- --base master`
- `pnpm pr -- --dry-run`
