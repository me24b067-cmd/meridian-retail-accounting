# Meridian Retail Accounting

A complete double-entry accounting application for a fictional Indian retail trading business, **Meridian Retail Traders** (FY 1 Apr 2025 – 31 Mar 2026, INR). It turns 111 source transactions into balanced journal entries, a general ledger, a trial balance, a Profit & Loss statement and a Balance Sheet, validates them with 27 integrity checks, and exports an Excel workbook and CSVs.

> **Educational project.** All data is fictional. GST rates and treatments are illustrative and simplified - **not tax advice**.

## Quick start
```bash
npm install
npm run dev            # http://localhost:3000  (uses a local JSON file store, seeded with the demo data)
```
Production-style run: `npm run build && DEMO_RESET_ENABLED=true npm start`.
Regenerate the submission files: `npm run generate:submission`. Run tests: `npm test`.

Requires **Node.js ≥ 20.9** (developed and verified on Node 24). No database, API key or account is needed locally.

## Final results (demo dataset, 1 Apr 2025 – 31 Mar 2026)
| | ₹ |
|---|---:|
| Trial Balance debits = credits | 77,17,631.78 = 77,17,631.78 (difference 0.00) |
| Total Assets | 44,71,605.86 |
| Total Liabilities | 7,21,140.00 |
| Total Equity | 37,50,465.86 |
| **Balance Sheet difference** (Assets − Liabilities − Equity) | **0.00** |
| Net Profit | 6,50,465.86 |

111 source transactions → 111 journal entries (326 lines). Details: `submission/Financial_Statements.md`, `TEST_RESULTS.md`.

## Assignment requirements → where they are met
| Requirement | Where |
|---|---|
| Balance Sheet & Profit and Loss | `/balance-sheet`, `/profit-and-loss`; `src/lib/accounting/reports.ts` |
| One cash account, two bank accounts | 1001, 1002, 1003 in `data/chart_of_accounts.csv`; used in many entries |
| Three fixed assets + depreciation | Furniture, Computers, Van (T005, T006, T008); 4 depreciation postings; `/fixed-assets` |
| Prepaid expenses | Prepaid Rent (T034 → releases T058…); ₹66,000 unexpired on the Balance Sheet |
| Accounts payable / receivable | 2001 / 1100 with per-party subledger checks |
| Salaries | Accrual → payment; Salaries Payable, TDS/PF Payable |
| Loans given and availed | 1500 Loan Given; 2100 Bank Loan; principal-only balances, interest separate |
| Inventory | Perpetual weighted-average cost, quantity + value subledger, `/inventory` |
| GST credits | Input GST Credit (1400), Output GST Payable (2200), settlements, `/gst` |
| Three income types | Sales, Service Income, Interest Income |
| Five+ expense types | COGS, Salaries, Rent, Utilities, Advertising (+ Depreciation, Bank Charges, Interest, Other) |
| ≥ 50 test entries | **111** in `data/sample_transactions.csv` (also exported as `submission/csv/`) |
| Verify the Balance Sheet balances | `/validation` page, `/api/summary`, tests, workbook formula |
| Publish software, entries, Balance Sheet, P&L | This repo + `submission/` folder |

## Features
Dashboard with KPIs and charts · editable chart of accounts · validated *Record Transaction* form with journal **preview** · transaction register with filters (date, account, category, type, text) and per-transaction journal drill-down · general ledger · trial balance · P&L · Balance Sheet with pass/fail and the numeric difference · inventory · fixed assets & depreciation · GST summary · accounting validation (27 checks with expected/actual/difference) · CSV, Excel and print-to-PDF · reporting-period selector · demo reset.

## Screenshots
No screenshots are included (none have been captured). To add them: run the app, open each page, save PNGs into a `docs/screenshots/` folder and reference them here.

## Technology and architecture
| Choice | Why |
|---|---|
| **Next.js 16 + React 19 + TypeScript** | Deploys to Vercel with no server to babysit; the system Python available for this build was 3.9 (the original brief asked for 3.11+ and Streamlit), and the extended brief prefers Next.js/Vercel. |
| **`decimal.js`** | Exact decimal arithmetic; no floating-point money. |
| **Tailwind CSS 4, Recharts** | Simple styling and dashboard charts. |
| **PostgreSQL (`pg`) in production** | Vercel's filesystem is not durable. Works with Neon's free plan. Schema in `migrations/001_init.sql` with constraints and a commit-time "entry must balance" trigger. |
| **Local JSON file** (dev) / **read-only CSV demo** (Vercel without DB) | Zero-setup local use; safe public demo. |
| **ExcelJS, Papa Parse, zod** | Workbook, CSV, input validation. |
| **Vitest** | Tests. |

The accounting engine (`src/lib/accounting/`) is pure TypeScript with no framework or I/O, so rules are identical locally and deployed. The UI never calculates accounting numbers.

### Directory structure
```
data/                    chart_of_accounts.csv, sample_transactions.csv (111 rows, editable)
migrations/              001_init.sql (PostgreSQL schema)
src/types/               shared types
src/lib/accounting/      money, journal, engine (posting rules), inventory, depreciation, gst, ledger, reports, subreports
src/lib/validation/      checks.ts (27 integrity checks)
src/lib/database/        csv loader, file / postgres / read-only stores
src/lib/exports/         csv, excel, markdown statements
src/lib/books.ts         load → post → report; write path with validation
src/app/                 pages and API routes
src/components/          UI components, forms
scripts/                 generate-submission.ts, migrate.ts
tests/                   76 tests (6 files)
submission/              final deliverables (workbook, CSVs, statements, docs)
```

## How the accounting works (short)
Source transaction → **journal entry** (≥ 2 lines, debits = credits, else rejected) → **ledger** → **trial balance** → **P&L + Balance Sheet** for the chosen period. Current-year profit is computed from income/expense accounts and included in equity once; there is no plug or suspense account. Full formulas and worked examples: [`ACCOUNTING_METHODOLOGY.md`](ACCOUNTING_METHODOLOGY.md). Summary of the key treatments:
- **Depreciation:** straight-line, daily pro-rata: (cost − residual) ÷ (life × 365) × days.
- **Inventory:** perpetual weighted average; negative stock rejected by default.
- **GST:** input credit and output payable kept out of cost/revenue/expense; settlement offsets output against input and pays the shortfall.
- **Loans:** principal on the balance sheet only; interest in P&L; loan given is an asset, loan received a liability.
- **Receivables/payables:** revenue/expense recognised once; collections/payments only move balance-sheet accounts.

## Recording and inspecting transactions
1. **Record Transaction** → pick the type → fill the fields → **Preview journal entry** → **Post**.
2. The engine re-runs *all* transactions plus the new one and all 27 checks; if anything is invalid or any check fails, nothing is saved and the reason is shown.
3. Inspect it in **Transaction Register** (click a journal entry to expand its lines) or **General Ledger**.
4. Posted entries are not edited. Correct with a reversing *Manual journal* plus the right transaction.

CSV columns of `data/sample_transactions.csv`: `txn_id, date, type, description, party, reference, category, item, quantity, unit_amount, amount, gst_rate, gst_treatment, account, settle, to_account, interest_amount, deduction_amount, useful_life_years, residual_value`. `settle` is a cash/bank code (1001/1002/1003) or `CREDIT`. Valid types: see `TRANSACTION_TYPES` in `src/types/accounting.ts`.

## Environment variables (all optional)
See `.env.example`: `DATABASE_URL` (PostgreSQL), `DEMO_RESET_ENABLED`, `FX_API_BASE_URL`. Never commit real values.

## Database setup (PostgreSQL, optional)
```bash
DATABASE_URL='postgresql://user:pass@host/db' npm run db:migrate   # creates tables, loads demo data if empty
DATABASE_URL='postgresql://user:pass@host/db' npm run dev
```
Reset to the demo dataset: **Export** page → *Reset to demo dataset* (dev, or `DEMO_RESET_ENABLED=true`), which asks for confirmation and only touches this app's own tables.

## Downloading reports
**Export & Submission Files** page, or directly:
`/api/export/xlsx` (12-sheet workbook), `/api/export/{source_transactions,journal_entries,chart_of_accounts,trial_balance,profit_and_loss,balance_sheet,validation_results}` (CSV), `/api/export/statements` (Markdown). Append `?from=YYYY-MM-DD&to=YYYY-MM-DD` for another period. PDF: *Print / Save as PDF* on the statement pages. Excel notes: totals and difference cells are formulas; Excel/LibreOffice recalculate them on open.

## Reproducing the results
```bash
npm install
npm test                         # 76 tests, includes the full 111-transaction pipeline
npm run generate:submission      # rewrites submission/ and prints the headline figures; exits non-zero if any check fails
```
Validate the Balance Sheet in the app: **Balance Sheet** page (green banner with the difference) or **Accounting Validation** page; or `curl localhost:3000/api/summary` → `balanceSheet.difference` is `"0.00"`.

## API usage
Only one optional external API (Frankfurter / ECB reference FX rates, no key) shown as reference data on the Dashboard; the accounting never uses it. See [`API_RESEARCH.md`](API_RESEARCH.md).

## Repository and deployment
See [`DEPLOYMENT.md`](DEPLOYMENT.md). GitHub URL and Vercel URL, if published, are listed here: *GitHub: see below · Vercel: not deployed from this environment (needs Vercel login; steps in DEPLOYMENT.md).*

## Known limitations / future work
Disposals, multi-currency, bank-statement import & true reconciliation, CGST/SGST/IGST split and GST returns, amortisation schedules, authentication/multi-user, editing workflow (reversal helper), audited PDF layout. Depreciation uses a 365-day year. Sample loan interest is entered, not computed. The UI was verified by HTTP/API tests and a production build, not by automated browser tests.
