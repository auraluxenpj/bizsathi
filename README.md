# Auralink

**Auralink by Auraluxe** is the internal business management platform for Auraluxe.

## Application

- **Dashboard:** https://bizsathi-migration.auraluxe26.workers.dev/dashboard
- **Runtime:** Cloudflare Workers
- **Database and authentication:** Supabase
- **Source control:** https://github.com/auraluxenpj/bizsathi

## Development

Requirements: Bun.

```sh
git clone https://github.com/auraluxenpj/bizsathi.git
cd bizsathi
bun install
bun run dev
```

## Validation

```sh
bun run test
bun run lint
bun run build
bunx cf deploy --dry-run
```

## Deployment safety

The existing Worker is the deployment target. Do not create another Worker, change production routing, attach a custom domain, or deploy an unverified build. Keep the current live deployment available until the release checklist and end-to-end acceptance tests pass.

Runtime credentials belong in Cloudflare Worker secrets. Never commit credentials, access tokens, private keys, or populated environment files to this repository.

## Data and security

Supabase handles authentication and business data. Tenant access must be enforced by trusted database permissions and row-level security; never trust role or business identifiers supplied by the browser.
