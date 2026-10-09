# Test Results

All results below were produced by commands actually run in this environment (macOS, Node v24.14.1, Next.js 16.4, Vitest 5.0.3) on the final dataset. Re-run them yourself with the commands shown.

## 1. Automated tests - `npm test`
```
Test Files  8 passed (8)
     Tests  90 passed (90)
```
`npx tsc --noEmit` → exit 0 (no type errors). `npm run build` → exit 0 (production build compiled, 20 routes).

| Test file | Tests | Covers |
|---|---:|---|
| `tests/journal.test.ts` | 10 | Journal balancing, debit/credit rules, invalid account/date/description, multi-line entries, decimal money, INR formatting |
| `tests/chart.test.ts` | 3 | Chart of accounts: unique codes, normal balances, contra-assets, every mandatory account present |
| `tests/engine.test.ts` | 25 | Posting rules for every treatment + negative tests (duplicates, invalid accounts, over-collection/payment, negative stock, bad GST, bad assets) |
| `tests/units.test.ts` | 12 | Weighted-average inventory, straight-line pro-rata depreciation, GST calculation and settlement |
| `tests/reports.test.ts` | 9 | Trial balance, P&L, Balance Sheet, period filtering, retained-earnings roll-forward, general ledger |
| `tests/integration.test.ts` | 17 | Full 111-transaction dataset through the normal pipeline, reproducibility, CSV and Excel exports, FX API failure handling |

| `tests/upload.test.ts` | 9 | CSV upload tester logic: same results as the main pipeline, tolerant parsing (BOM, header case, any line endings), wrong-field-count rows, collecting *all* problems with row numbers, financial-year defaults, template, Excel endpoint |
| `tests/upload-ui.test.tsx` | 5 | Browser UI (jsdom): drag-and-drop box, dropping a valid file, a faulty file, an unusable file, Clear |

<details><summary>All 90 test names</summary>

**units**

- inventory (perpetual weighted average) > averages cost across purchases at different prices
- inventory (perpetual weighted average) > sells the last units at exactly the remaining value (no rounding residue)
- inventory (perpetual weighted average) > prevents negative stock unless the override is configured
- inventory (perpetual weighted average) > selling an item with no stock at all is still refused (no cost basis)
- straight-line depreciation > pro-rates by days from the purchase date (inclusive) to the period end
- straight-line depreciation > continues from the previous depreciation date
- straight-line depreciation > never depreciates below the residual value
- straight-line depreciation > is zero before purchase
- GST calculation > computes tax on the net value, rounded to paise
- GST calculation > infers NON_TAXABLE for a 0% blank treatment
- GST calculation > rejects a rate on an exempt supply and unknown treatments
- GST calculation > settles output against input and reports cash payable

**chart**

- chart of accounts > has unique codes and valid normal balances
- chart of accounts > classifies accumulated depreciation as contra-assets
- chart of accounts > contains every mandatory account

**journal**

- journal entry validation > accepts a balanced entry
- journal entry validation > rejects an unbalanced entry with a clear message
- journal entry validation > rejects an invalid account code
- journal entry validation > rejects a line with both debit and credit or neither
- journal entry validation > rejects fewer than two lines, bad dates, and blank descriptions
- journal entry validation > supports multi-line entries (compound journal)
- decimal money > avoids floating-point drift
- decimal money > rounds half-up to 2 places
- decimal money > formats rupees with Indian grouping and brackets for negatives
- decimal money > rejects non-numeric input

**reports**

- trial balance, P&L and balance sheet > trial balance is balanced
- trial balance, P&L and balance sheet > P&L: trading formula
- trial balance, P&L and balance sheet > excludes capital, loan principal and GST from income and expense
- trial balance, P&L and balance sheet > balance sheet balances and includes profit once
- trial balance, P&L and balance sheet > shows contra accounts as deductions from fixed assets
- period filtering > reports only the requested window for income and expense accounts
- period filtering > rolls prior-period profit into retained earnings without double counting or imbalance
- period filtering > ignores transactions after the reporting date
- general ledger > aggregates running balances in the normal direction and honours opening balances

**engine**

- transaction validation > rejects duplicate transaction IDs
- transaction validation > rejects invalid account references
- transaction validation > rejects bad dates, types, blank descriptions and non-positive amounts
- transaction validation > does not allow cost of goods sold or depreciation to be expensed manually
- cash, banking and transfers > records a transfer between banks without touching income or expenses
- cash, banking and transfers > rejects a transfer to the same account
- inventory, sales and GST > keeps recoverable input GST out of inventory cost
- inventory, sales and GST > credit sale: revenue and output GST on sale, COGS from weighted average, receivable raised
- inventory, sales and GST > collection settles the receivable without a second revenue recognition
- inventory, sales and GST > rejects over-collection and unknown customers
- inventory, sales and GST > supplier payment settles payable without double-counting the purchase
- inventory, sales and GST > blocks negative inventory under the default policy
- inventory, sales and GST > credit transactions need a named party
- inventory, sales and GST > exempt and non-taxable transactions produce no GST; taxable needs a rate
- inventory, sales and GST > GST settlement offsets output against input and pays only the shortfall
- inventory, sales and GST > GST settlement keeps excess input credit as an asset
- fixed assets, prepaid, salaries > capitalises asset purchases and recoverable GST, never expensing them
- fixed assets, prepaid, salaries > rejects asset purchases to non-asset accounts and bad residual values
- fixed assets, prepaid, salaries > prepaid rent stays an asset until released
- fixed assets, prepaid, salaries > paying an accrued salary reduces the liability and does not repeat the expense
- loans > loan received is a liability, not income
- loans > repayment reduces principal only; interest is expensed separately
- loans > loan given is an asset; recovery reduces it and interest is income
- loans > accrued interest receivable is cleared by a later recovery before new income is recognised
- loans > JOURNAL cannot post to the computed current-year profit account

**integration**

- sample dataset through the full pipeline > has at least 60 uniquely identified, described transactions inside the default period
- sample dataset through the full pipeline > covers every transaction type
- sample dataset through the full pipeline > posts every entry balanced
- sample dataset through the full pipeline > exercises every mandatory account in the ledger
- sample dataset through the full pipeline > trial balance and balance sheet balance to exactly zero
- sample dataset through the full pipeline > passes every integrity check
- sample dataset through the full pipeline > produces the same statements on every run (reproducible)
- sample dataset through the full pipeline > is independent of the order the rows are supplied in
- sample dataset through the full pipeline > shows depreciation, GST credit and liability, prepaid remainder and loan principal-only balances
- sample dataset through the full pipeline > filtering to an earlier date still balances
- exports > round-trips the source CSV
- exports > creates all CSV exports with content
- exports > creates a workbook with the 12 required sheets and a zero balance sheet difference
- exports > submission files exist when generated
- optional FX API never breaks the app > returns unavailable (no throw) on network failure
- optional FX API never breaks the app > returns unavailable on HTTP errors and malformed bodies
- optional FX API never breaks the app > parses a valid response (mocked - no live data is claimed)

**upload**

- CSV upload analysis > gives the same statements for the uploaded sample as the main pipeline
- CSV upload analysis > is tolerant of a BOM, odd header case/spacing, reordered and missing optional columns, and blank lines
- CSV upload analysis > reports a clear fatal message for missing required columns, empty data and oversized files
- CSV upload analysis > collects EVERY problem with spreadsheet row numbers instead of stopping at the first
- CSV upload analysis > handles any line-ending style, including mixed endings, without merging rows
- CSV upload analysis > reports rows with the wrong number of fields (never guesses) and keeps true spreadsheet row numbers across blank lines
- CSV upload analysis > derives the financial year(s) from the dates and honours a requested period
- CSV upload analysis > serves a blank template that is itself a valid, balancing file
- CSV upload analysis > builds an Excel file for a valid upload and rejects bad ones without storing anything

**upload-ui**

- Upload & Test CSV (browser UI) > shows the drag-and-drop box and the helper buttons before any file is loaded
- Upload & Test CSV (browser UI) > dropping a valid file shows balanced statements, the checks and the download buttons
- Upload & Test CSV (browser UI) > dropping a file with mistakes lists every problem with its row number and shows no statements
- Upload & Test CSV (browser UI) > explains an unusable file in plain words
- Upload & Test CSV (browser UI) > clear resets the page

</details>

## 2. Dataset and account coverage (from the engine)
- **Source transactions:** 111 (unique IDs T001-T111; dates 2025-04-01 to 2026-03-31) → **111 journal entries**, **326 journal lines**.
- Transactions by type: ASSET_PURCHASE: 3, CAPITAL: 3, COLLECTION: 5, DEPRECIATION: 4, EXPENSE: 12, GST_SETTLEMENT: 4, INTEREST_INCOME: 2, JOURNAL: 2, LOAN_GIVEN: 1, LOAN_RECEIVED: 1, LOAN_RECOVERY: 1, LOAN_REPAYMENT: 3, PREPAID_RELEASE: 3, PREPAYMENT: 1, PURCHASE: 9, SALARY_ACCRUAL: 12, SALARY_PAYMENT: 14, SALE: 18, SERVICE: 4, SUPPLIER_PAYMENT: 5, TRANSFER: 4
- Every transaction type the engine supports is exercised (asserted by a test).

Journal lines posted per account (0 only for the computed account 3003, which is never posted):

| Code | Account | Journal lines |
|---|---|---:|
| 1001 | Cash in Hand | 8 |
| 1002 | Bank Account 1 - HDFC Current A/c | 42 |
| 1003 | Bank Account 2 - ICICI Current A/c | 31 |
| 1100 | Accounts Receivable | 10 |
| 1150 | Accrued Interest Receivable | 1 |
| 1200 | Inventory | 27 |
| 1300 | Prepaid Rent | 4 |
| 1400 | Input GST Credit | 26 |
| 1500 | Loan Given | 2 |
| 1600 | Furniture and Fixtures | 1 |
| 1601 | Accumulated Depreciation - Furniture | 4 |
| 1610 | Computer Equipment | 1 |
| 1611 | Accumulated Depreciation - Computers | 4 |
| 1620 | Delivery Vehicle | 1 |
| 1621 | Accumulated Depreciation - Vehicle | 4 |
| 2001 | Accounts Payable | 10 |
| 2002 | Salaries Payable | 23 |
| 2100 | Bank Loan | 4 |
| 2200 | Output GST Payable | 25 |
| 2300 | TDS and PF Payable | 15 |
| 2400 | Accrued Expenses | 1 |
| 3001 | Owner's Capital | 3 |
| 3002 | Retained Earnings | 0 |
| 3003 | Current-Year Profit or Loss | 0 (computed, never posted) |
| 4001 | Sales Revenue | 18 |
| 4002 | Service Income | 4 |
| 4003 | Interest Income | 4 |
| 5001 | Cost of Goods Sold | 18 |
| 5101 | Salaries Expense | 12 |
| 5102 | Rent Expense | 4 |
| 5103 | Utilities Expense | 4 |
| 5104 | Advertising Expense | 3 |
| 5105 | Depreciation Expense | 4 |
| 5106 | Bank Charges | 3 |
| 5107 | Interest Expense | 4 |
| 5108 | Other Operating Expenses | 1 |

## 3. Accounting validation (27 checks, all PASS; differences computed, not hard-coded)
Period 2025-04-01 to 2026-03-31. Full table with expected / actual / difference: `submission/Financial_Statements.md`, `submission/csv/validation_results.csv`, or the app's *Accounting Validation* page.

| Figure | ₹ |
|---|---:|
| Total journal debits | 2,00,05,554.14 |
| Total journal credits | 2,00,05,554.14 |
| Trial Balance total debits | 77,17,631.78 |
| Trial Balance total credits | 77,17,631.78 |
| Trial Balance difference | 0.00 |
| Total Income / Total Expenses | 37,93,100.00 / 31,42,634.14 |
| Net Profit (Total Income − Total Expenses) | 6,50,465.86 |
| Total Assets | 44,71,605.86 |
| Total Liabilities | 7,21,140.00 |
| Total Equity (owner's capital 31,00,000 + retained earnings 0 + current-year profit 6,50,465.86) | 37,50,465.86 |
| **Balance Sheet difference = Total Assets − Total Liabilities − Total Equity** | **0.00** (exactly zero as a Decimal, `balanceSheetDifference: "0.00"`) |

(Owner's capital is ₹31,00,000: ₹25,00,000 + ₹1,00,000 + ₹5,00,000 introduced in T001, T002 and the September top-up.)

Reconciliations that pass: cash/bank ledger = journal lines for all three accounts and never overdrawn; inventory ledger = subledger = ₹1,93,957.64; fixed-asset cost, accumulated depreciation and net book value agree with the register; receivables and payables agree with the per-party subledger; loan balances equal principal movements only; prepaid rent equals paid − expensed (₹66,000 unexpired); input GST credit equals credit recorded − credit utilised.

## 4. Application tests against the built app
Run on the production build (`npm run build` then `next start`) with `scripts/smoke.sh`:

| Environment | Result |
|---|---|
| Local JSON file store | `SMOKE OK`: 13 pages return 200; `/api/summary` → balanced `true`, TB difference `"0.00"`, checks 27/27; 9 export endpoints return 200 (xlsx, 7 CSVs, statements). |
| **Real PostgreSQL** (embedded PostgreSQL started from the `embedded-postgres` npm package in a temporary folder outside this repo - not Neon) | `npm run db:migrate` created the schema and loaded 111 transactions; `SMOKE OK`; posted a transaction (T112) via the API → restarted the server → still 112 transactions and balanced (persistence verified); duplicate ID rejected (422); reset restored 111 transactions (net profit ₹6,50,465.86). The deferred trigger rejected an unbalanced journal entry at COMMIT (`Unbalanced journal entry JE-ZZ1: debits 100.00 <> credits 99.00`) in an earlier run on the same schema. |
| Negative API tests | Unknown account → 422; oversell → 422 "Insufficient stock"; missing description → 400; invalid JSON → 400; reset without `DEMO_RESET_ENABLED` in production mode → 403. |
| Optional FX API | A live call returned HTTP 200 with USD/EUR/GBP→INR reference rates on 9 Oct 2026 (also one transient "unavailable" result during an earlier smoke run, after which the timeout handling was made per-request and parallel). The panel and `/api/fx` degrade to `{"available":false,...}` without affecting any accounting page (unit-tested with mocked failures). |

## 4b. Upload & Test CSV feature
Covered by `tests/upload.test.ts` and `tests/upload-ui.test.tsx` (see tables above) and by HTTP checks on the running app (`/upload` → 200; `/api/template?kind=blank` returns a valid file; `/api/analyze/excel` returned an `.xlsx` for a good file and HTTP 422 with the first problem for a bad one). Bugs found by these tests and fixed: (1) files with mixed or CR-only line endings could merge two rows into one - line endings are now normalised; (2) rows with too many/few fields were silently mis-aligned - they are now reported with their row number; (3) a tiny/odd file produced a confusing "cannot auto-detect delimiter" message instead of "missing required column" - fixed.
The DOM tests render the real component in jsdom and simulate a file drop; they are **not** a substitute for trying it in a real browser (a real-browser drag-and-drop was not run in this environment, because Chrome automation was not connected).

## 5. Not tested / limitations
- The UI was exercised through HTTP responses, the production build and (for the upload page only) jsdom DOM tests; **no real-browser or visual tests** were run and no screenshots exist.
- **Vercel and Neon were not tested** (no authenticated Vercel/Neon access from this environment). PostgreSQL behaviour was verified on a local embedded server, which should match Neon but is not the same service.
- The Excel file was created and read back with ExcelJS (12 sheets, formulas present); it was not opened in desktop Excel in this environment. ExcelJS does not store a cached value of exactly 0 for formula cells, so Excel/LibreOffice compute those on opening.
- The PDF option is browser *Print / Save as PDF*; no PDF files are generated.
