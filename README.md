# Bizsathi

Create a new project with Supabase enabled.

Biz sathi Nepal

Implement the BizSathi Nepal PostgreSQL schema and security foundation in the connected Supabase project.

Create migrations for businesses, profiles, memberships, roles, branches, financial periods, audit logs, and business settings.

Require authenticated users and verified business membership for all tenant data. Enable RLS on every tenant-owned table. Derive permissions from trusted database records, never from client-supplied role values.

Create secure database functions for membership checks and privileged operations. Prevent users from granting themselves owner or administrator permissions. Ensure business creation and owner membership assignment are secure and atomic.

Add foreign keys, unique constraints, indexes, and appropriate deletion restrictions. Avoid cascading deletion of posted financial records.

Provide two-business isolation tests, unauthorized access tests, and migration rollback or recovery instructions. Do not insert real business data. Report any security policies or functions that still need manual review.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://bizsathi.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/91d3bad1-4fef-49f9-8131-e40dddcbf188).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
