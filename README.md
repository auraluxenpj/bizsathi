# Sutra

**Sutra by Auraluxe** is the internal business management platform for Auraluxe.

## Production application

- **Dashboard:** https://bizsathi-migration.auraluxe26.workers.dev/dashboard
- **Hosting:** Cloudflare Workers
- **Database and authentication:** Supabase
- **Source control:** https://github.com/auraluxenpj/bizsathi

## Development

Requirements: Node.js and npm.

```sh
git clone https://github.com/auraluxenpj/bizsathi.git
cd bizsathi
npm install
npm run dev
```

## Validation

```sh
npm test
npm run lint
npm run build
```

## Deployment

The production Worker is managed in the Cloudflare account. Do not deploy from an unverified local build or change production routing without confirming the release checklist.

Required runtime configuration is managed as Cloudflare Worker secrets. Never commit credentials, access tokens, private keys, or populated environment files to this repository.

## Data and security

The application uses Supabase for authentication and business data. Tenant access must be enforced by trusted database permissions and row-level security; never trust role or business identifiers supplied by the browser.
