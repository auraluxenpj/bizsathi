# BizSathi — Cloudflare Workers migration preparation

**Audit date:** 2026-11-19  
**Source branch:** `main`  
**Source commit audited:** `57c95dafffbf5c752573d7f6a47fdd876aaba182`  
**Target:** Cloudflare Workers with Static Assets (not Pages), GitHub-based builds, existing Supabase retained.

## Executive decision

Move the TanStack Start application runtime from Vercel to Cloudflare Workers, keep GitHub as the source of truth, and keep the existing production Supabase project as the database/auth/storage backend. Do not migrate, reset, recreate, or modify production database records as part of the hosting move.

Keep the existing Vercel production deployment and domain routing unchanged until a Cloudflare preview has passed the full acceptance checklist. Cloudflare account access is not currently available through the connected tools, so the account/GitHub authorization and deployment setup must be completed in the Cloudflare dashboard by the account owner.

Use **Workers with Static Assets**, not a Pages-only static deployment: BizSathi uses TanStack Start server functions, SSR and server-side integrations.

## What was verified

- Repository: `auraluxenpj/bizsathi`, default branch `main`.
- Audited main commit: `57c95dafffbf5c752573d7f6a47fdd876aaba182`.
- Framework: TanStack Start `1.168.60` (above Cloudflare's documented minimum `1.132.0`).
- The project is Vite-based; it is not an Rsbuild app.
- A separate `vitest.config.ts` already exists, so Vitest need not load the Cloudflare Vite plugin.
- `src/server.ts` is a custom server entry that wraps TanStack's server entry to normalize a particular SSR 500 response. Preserve this behavior and point Wrangler at this custom entry after verifying it under Workers.
- Existing Vercel production deployment was reported READY; keep it as the rollback target.
- Existing Supabase production data is to remain in place. No schema or data migration is required for a hosting-only move.

## Lovable dependencies that must be removed or replaced

| Current dependency / behavior | Migration action |
|---|---|
| `@lovable.dev/vite-tanstack-config` in `vite.config.ts` | Replace the wrapper with the Cloudflare Vite plugin + TanStack Start + React + the app's required Vite plugins. Preserve aliases, Tailwind and public env defines. |
| `nitro` dev dependency | Remove the Vercel/Nitro adapter after confirming no other tooling depends on it. |
| `@lovable.dev/cloud-auth-js` and `src/integrations/lovable/index.ts` | Replace Google OAuth with Supabase JS `supabase.auth.signInWithOAuth({ provider: 'google' })`; remove Lovable OAuth UI and SDK. |
| `previewAuthStorage.ts` | Remove Lovable preview postMessage session broker; use normal Supabase browser storage on the real app origin. |
| `@lovable.dev/ai-gateway` in receipt scanning | Replace with a direct AI provider API using a server-side secret; verify image and PDF receipt extraction, structured output, rate limits and free-tier availability. |
| Lovable AI Gateway in security summaries | Replace the gateway URL, SDK headers, model identifier and run-ID tracking with a direct supported provider; keep AI output advisory-only. |
| `connector-gateway.lovable.dev/google_sheets` | Replace with Google Sheets API access. Public CSV fallback can remain for read-only public sheets; private sheet reads and status-cell writes need a Google OAuth or service-account flow. |
| `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS` | Rename to platform-neutral cron secret names and update callers together; keep the old secret only during a controlled rotation window if a live cron still calls it. |
| `LOVABLE_DB_MIGRATION_URL` in Drizzle config | Replace with a neutral database migration variable name if Drizzle migrations are still used. This is tooling-only, not a runtime secret. |

**Important authentication finding:** open PR #94 only removes the Lovable sign-in button and narrows a TypeScript parameter. Its Google sign-in handler still calls `lovable.auth.signInWithOAuth`, imports the Lovable SDK, and imports its CSS. It is therefore not a complete Lovable auth removal and should not be treated as the finished migration fix.

## Cloudflare runtime changes

1. Install `@cloudflare/vite-plugin` and `wrangler` as development dependencies using Bun (the repository's current package manager).
2. Replace the Lovable Vite wrapper. Put `cloudflare({ viteEnvironment: { name: 'ssr' } })` first, then `tanstackStart()`, then React; retain the app's Tailwind plugin, path handling and `publicCloudDefines` behavior.
3. Align the TanStack Start framework packages (Start, Router and Router plugin) to a mutually compatible release before the Worker build. Do not blindly re-resolve the entire dependency tree; TanStack's migration guide warns that lockfile re-resolution can alter server-function wire format.
4. Add `wrangler.jsonc` with Worker name `bizsathi`, the repository's actual custom entrypoint `src/server.ts`, a current compatibility date, and observability enabled. Do not set a static-assets directory manually when the Cloudflare Vite plugin owns that output.
5. Add `public/_headers` for immutable caching of hashed `/assets/*` files.
6. Add `.wrangler/` and `.dev.vars*` to `.gitignore`.
7. Generate Worker types and include the generated declaration file in TypeScript.
8. Run unit tests, lint, production build, Workers preview and route/server-function smoke tests before any deployment.

Cloudflare's current TanStack Start migration guide: https://developers.cloudflare.com/workers/static-assets/migration-guides/vercel-to-workers/tanstack-start/

## Environment variable inventory and transfer plan

The connected Vercel project-level production inventory showed Supabase/Postgres variables, including:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- legacy Supabase key aliases (`SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Postgres connection variables (`POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, and component fields)

The project-level inventory did **not** show the Vite build variables currently referenced by the app (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) or the app-specific Google Sheets, AI and website-sync settings. Check shared Vercel variables and the current Lovable environment before concluding they do not exist.

Expected Cloudflare configuration (names only; never commit values):

### Build-time public variables
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

### Worker secrets / runtime variables
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (secret; server only)
- `WEBSITE_SYNC_URL` (if website stock sync remains enabled)
- `INVENTORY_SYNC_SECRET` (secret; must match the website side)
- neutral cron secret names (after the code rename)
- direct AI provider API key (after provider choice)
- Google Sheets OAuth/service-account credentials (after implementation)

Do not expose service-role, AI, Google credential, website-sync or cron secrets in any `VITE_*` variable or browser bundle. Do not copy old Postgres credentials unless a confirmed app feature still uses them. Never copy secret values into GitHub, this document, chat, or a public build log.

## Free-tier feasibility and operational constraints

- Cloudflare Workers Free currently documents 100,000 requests/day and a 10 ms CPU-time limit per request. The CPU limit is the main risk for a full-stack accounting app: SSR, PDF/report generation and heavier server functions must be measured under the actual Workers runtime.
- Do not promise that every workload will remain free until the preview tests and usage profile prove it. If legitimate BizSathi traffic or CPU exceeds the Free limits, a paid Workers plan may be required.
- Supabase Free remains subject to database, storage, bandwidth and inactivity limits. Monitor the production project; do not assume it is unlimited.
- Google AI free-tier quotas and model availability can change. AI scanning must degrade gracefully to manual entry if no free quota is available.
- Keep Vercel active until Cloudflare is proven stable. Do not delete Vercel, remove the existing domain, change DNS or rotate/delete old secrets during preparation.

Cloudflare limits: https://developers.cloudflare.com/workers/platform/limits/

## Acceptance checklist before cutover

- [ ] Production Supabase URL and publishable key are available as Cloudflare build/runtime variables.
- [ ] Service-role key is a Worker secret only and is never present in client assets.
- [ ] Google OAuth login completes on the Cloudflare preview origin and redirects correctly.
- [ ] Email/password, recovery, mobile login and employee-ID login work.
- [ ] Existing users, memberships, roles, business scope, branch scope and approval rules are unchanged.
- [ ] Dashboard, business switcher, branch switcher and permission checks work.
- [ ] Sales, purchases, POS, stock, barcode, vouchers, cash counters, reports, HR and payroll work.
- [ ] Receipt uploads work; AI extraction works when configured and manual entry still works without AI.
- [ ] Google Sheets catalogue/stock import works; status write-back works for authorized sheets.
- [ ] Website stock sync still works with the same shared secret on both systems.
- [ ] PWA install, offline behavior and push notifications are tested separately; push delivery and notification credentials are not assumed to transfer automatically.
- [ ] Workers CPU, request volume, cold-start and external API limits are acceptable on Free.
- [ ] Production build, tests, lint and smoke tests pass.
- [ ] Cloudflare custom domain is tested only after the Worker preview is accepted; Vercel rollback remains available.

## Current scope of this preparation branch

This branch is a migration plan and audit record only. It intentionally makes no application, database, authentication, environment-secret, DNS or production deployment changes. The next implementation tranche should be a reviewed pull request that replaces the Vite runtime adapter and direct Supabase OAuth/storage integration, followed by AI and Google Sheets provider migrations.
