# Deployment Guide

## Status (honest summary)
- **GitHub:** https://github.com/me24b067-cmd/meridian-retail-accounting (public; pushed and verified).
- **Vercel:** the app is *ready* to deploy and passes `npm run build`, but **a Vercel deployment was not performed from this environment** - the Vercel CLI is not installed/authenticated here and a database cannot be provisioned without a Vercel/Neon login. No Vercel URL is claimed anywhere. Follow the steps below to deploy it yourself (about 5 minutes, free).

## How data is stored (and why)
| Mode | When | Persistence |
|---|---|---|
| **PostgreSQL** | `DATABASE_URL` is set (recommended for Vercel; e.g. Neon) | Durable. Source transactions + a mirrored journal in relational tables with constraints (including a commit-time trigger that rejects unbalanced entries). |
| **Local JSON file** | No `DATABASE_URL`, running locally | `.data/store.json` (git-ignored). For local demos. |
| **Read-only demo** | No `DATABASE_URL` and running on Vercel | Serves the bundled `data/sample_transactions.csv`; posting is disabled with a clear message. Reports, exports and the Preview button work. |

A local SQLite file is deliberately **not** used in production: Vercel's filesystem is ephemeral.

## Option A - read-only public demo (no database, simplest)
1. Push the repo to GitHub.
2. In Vercel: **Add New → Project → Import** the repository. Framework: Next.js (auto-detected). No environment variables needed. Deploy.
3. The deployed app shows all 111 demo transactions and every report; "Post transaction" is disabled. **Upload & Test Your CSV works in this mode** (it runs in the visitor's browser and stores nothing).

## Option B - full read/write with Neon Postgres
1. Create the Vercel project as in Option A (do not deploy yet, or redeploy afterwards).
2. In the Vercel project: **Storage → Create Database → Neon (Marketplace)** and connect it to the project. This adds `DATABASE_URL` (and others) to the project's environment variables. Alternatively create a database at https://neon.com and add `DATABASE_URL` yourself under **Settings → Environment Variables** (mark it Sensitive; never commit it).
3. Create the schema and load the demo data (from your machine, with the connection string exported - never put it in a file you commit):
   ```bash
   DATABASE_URL='postgresql://...' npm run db:migrate
   ```
   This applies `migrations/001_init.sql` (idempotent) and loads the demo only if the database is empty. (The app also does this automatically on first request if the tables are empty.)
4. Deploy (push to the main branch, or `npx vercel --prod`).
5. Optional: set `DEMO_RESET_ENABLED=true` to allow the "Reset to demo dataset" button/API in production. Leave it unset to forbid resets on a public site.

### CLI alternative
```bash
npx vercel login          # interactive, once
npx vercel link
npx vercel env add DATABASE_URL production   # paste value when prompted
npx vercel --prod
```
(Use `printf`/`echo -n` if you pipe a value, to avoid a trailing newline.)

## Smoke tests after deploying
Replace `$URL` with your deployment URL.
```bash
curl -s $URL/api/summary          # expect balanceSheet.balanced=true, difference "0.00", trialBalance.difference "0.00", checks.failed=[]
curl -s -o /dev/null -w "%{http_code}\n" $URL/ $URL/balance-sheet $URL/profit-and-loss $URL/trial-balance
curl -s -o bs.csv $URL/api/export/balance_sheet && tail -2 bs.csv
curl -s -o wb.xlsx $URL/api/export/xlsx && file wb.xlsx
curl -s -o /dev/null -w "%{http_code}\n" $URL/upload $URL/api/template
curl -s $URL/api/fx               # {"available":false,...} is acceptable and must not break anything else
```
With a database (Option B) also: post a transaction, reload, and confirm it persists (`/api/summary` → `sourceTransactions` increases by 1).

## Security notes
- `DATABASE_URL` is read only on the server (`src/lib/database/postgresStore.ts`); nothing is sent to the browser (`NEXT_PUBLIC_*` is not used).
- All inputs are validated with zod and by the accounting engine; SQL uses parameterised queries only.
- **There is no authentication.** On a public Option-B deployment, anyone can post transactions. Fine for a classroom demo; for anything else put the site behind Vercel Deployment Protection or add auth. The reset endpoint is disabled in production unless `DEMO_RESET_ENABLED=true` and requires `{"confirm":"RESET"}`; it only touches this app's own tables.
- Vercel Hobby is for non-commercial use; Neon Free has storage/compute limits (see `API_RESEARCH.md` §8).
