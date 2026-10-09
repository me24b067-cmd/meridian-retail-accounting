# Accounting Methodology

All figures below come from the real sample dataset (`data/sample_transactions.csv`, FY 1 Apr 2025 – 31 Mar 2026, INR). They are fictional, and GST rates are illustrative, **not tax advice**.

## 1. Pipeline

```
Source transactions (CSV / form) ──► Journal entries ──► General ledger ──► Trial balance ──► P&L + Balance Sheet
 data/sample_transactions.csv        postTransactions()    buildLedger()     buildFinancials()   same call, same period
```

| Step | Code | Notes |
|---|---|---|
| Source → journal | `src/lib/accounting/engine.ts` | One posting rule per transaction type; every entry validated by `validateJournalEntry` (`journal.ts`) before it is kept. The whole batch is rejected if any transaction is invalid - nothing is partially posted. |
| Journal → ledger | `ledger.ts` | Per-account rows with running balances in the account's normal direction. |
| Ledger → TB / P&L / BS | `reports.ts` | One function, one period, one set of journal lines - so the three statements can never disagree on data or dates. |
| Checks | `src/lib/validation/checks.ts` | 27 checks with expected, actual and difference shown. |

Statements are never computed from the raw CSV.

## 2. Double entry and sign conventions
Each journal entry has ≥ 2 lines; each line has exactly one of Debit or Credit (> 0). **Total debits = total credits**, otherwise the entry is rejected with the difference in the message.

| Type | Normal balance | Increases with | Examples |
|---|---|---|---|
| Asset | Debit | Debit | Cash, bank, receivables, inventory, input GST, loan given, fixed assets |
| Contra-asset | Credit | Credit | Accumulated depreciation (shown as a deduction) |
| Liability | Credit | Credit | Payables, salaries payable, bank loan, output GST |
| Equity | Credit | Credit | Owner's capital, retained earnings |
| Income | Credit | Credit | Sales, service, interest income |
| Expense | Debit | Debit | COGS, salaries, rent, utilities … |

**Money** uses `decimal.js` (40-digit precision, ROUND_HALF_UP), rounded to 2 places wherever an amount enters the books (`src/lib/accounting/money.ts`). In Postgres, money is `NUMERIC(18,2)`.

## 3. Statement formulas

**Trial balance** (as at the period end): every account's net Dr−Cr; positive → Debit column, negative → Credit column. Balance-sheet accounts are cumulative to the end date; income/expense accounts show only postings inside the period. Prior-period profit (if the period starts after 1 Apr 2025) is added to Retained Earnings so the TB still balances. *Difference = Σ Debits − Σ Credits* (₹0.00).

**Profit & Loss**
```
Total Income         = Sales Revenue + Service Income + Interest Income
Gross Profit         = Sales Revenue + Service Income − Cost of Goods Sold   (trading formula)
Total Expenses       = COGS + Operating Expenses + Depreciation + Interest Expense
Net Profit / (Loss)  = Total Income − Total Expenses
```
Capital, loan principal (given or received), GST collected/paid and inter-account transfers touch only balance-sheet accounts, so they cannot reach the P&L.

**Balance Sheet** (as at the end date)
```
Total Assets      = current assets (cash, 2 banks, receivables, interest receivable, inventory, prepaid, input GST)
                  + loan given + (fixed assets at cost − accumulated depreciation)
Total Liabilities = payables, salaries payable, TDS/PF payable, accrued expenses, output GST, bank loan
Total Equity      = Owner's Capital + Retained Earnings (posted + prior-period profit) + Current-Year Profit
Difference        = Total Assets − Total Liabilities − Total Equity   → must be exactly 0.00
```
**Current-year profit** is *computed* from the income and expense accounts for the period (account 3003 is never posted to; the engine rejects any journal that tries). It enters equity once. Because income and expense accounts are not closed to Retained Earnings by an entry, there is no double counting. No suspense account or plug exists anywhere in the code.

## 4. Treatments with worked examples
(IDs refer to rows of `data/sample_transactions.csv`.)

### Cash, banks, transfers
`TRANSFER` posts Dr destination, Cr source - both asset accounts. Transfers between the two banks (T003 funding Bank 2 with ₹8,00,000; T104 moving ₹2,00,000 back) change no income or expense. A cash withdrawal (T004) and a cash deposit (T078) are transfers with cash as one side. The check *C4* verifies no cash/bank account is ever overdrawn.

### Credit purchase with recoverable GST - T011
Backpacks 400 × ₹900 = ₹3,60,000 + 12% GST ₹43,200, on credit:
`Dr Inventory 3,60,000 · Dr Input GST Credit 43,200 · Cr Accounts Payable 4,03,200`. GST is **not** in inventory cost, and no expense is booked. Payment (T024, ₹2,00,000): `Dr Accounts Payable · Cr Bank` - no second purchase.

### Credit sale and collection - T014, T023
60 backpacks at ₹1,650 = ₹99,000 + 12% GST ₹11,880 to Bright Offices LLP:
`Dr Accounts Receivable 1,10,880 · Cr Sales 99,000 · Cr Output GST 11,880`, plus the cost entry `Dr COGS 54,000 · Cr Inventory 54,000` (60 × ₹900). Revenue is recognised at sale. The ₹40,000 part-payment (T023) is `Dr Bank · Cr Accounts Receivable` - revenue is not recognised again. Collections larger than the customer's outstanding balance are rejected.

### Inventory (perpetual weighted average)
Average cost = inventory value ÷ quantity on hand, updated at each purchase. Sale cost = value × qty sold ÷ qty on hand (the entire remaining value if everything is sold, avoiding rounding residue).
Chargers: T010 buys 1,000 @ ₹280 → 1,000 / ₹2,80,000; T013 sells 100 → COGS ₹28,000; later sales leave 750 / ₹2,10,000; T031 buys 500 @ ₹290 (₹1,45,000) → 1,250 / ₹3,55,000 (avg ₹284); T045 sells 200 → COGS ₹56,800. Selling more than on hand is rejected (`allowNegativeInventory` defaults to false). Check *I1* proves account 1200 equals the movement-based subledger; *I3* that purchases − cost of sales = closing stock.

### Fixed assets and depreciation - T005, T006, T008, T038
Purchases are capitalised, e.g. T008 delivery van: `Dr Delivery Vehicle 5,00,000 · Dr Input GST 90,000 · Cr Bank 5,90,000`. Life/residual are columns in the CSV (furniture 10 y / ₹10,000; computers 3 y / ₹6,000; van 8 y / ₹80,000).

Straight-line, daily pro-rata:
```
depreciation = (cost − residual) ÷ (useful life × 365) × days
```
Days run from the purchase date (inclusive) to the posting date, then from the previous posting date. Total is capped so net book value never falls below residual. T038 (30 Jun 2025): van (5,00,000 − 80,000) ÷ 2,920 × 86 days = ₹12,369.86; computers (1,20,000 − 6,000) ÷ 1,095 × 88 = ₹9,161.64; furniture (1,50,000 − 10,000) ÷ 3,650 × 89 = ₹3,413.70; total ₹24,945.20 → `Dr Depreciation Expense · Cr each accumulated-depreciation account`. Four posts (June, Sep, Dec, Mar) give ₹1,03,391.78 for the year. Net fixed assets = ₹7,70,000 − ₹1,03,391.78 = ₹6,66,608.22. A leap year would make the 365-day basis a simplification. *Disposals are not implemented.*

### Prepaid rent - T034, T058
12 months from 1 Jul 2025 at ₹22,000 = ₹2,64,000 + 18% GST: `Dr Prepaid Rent 2,64,000 · Dr Input GST 47,520 · Cr Bank 3,11,520`. Each quarter an entry (T058, then in Dec and Mar) releases `Dr Rent Expense 66,000 · Cr Prepaid Rent 66,000`. After three releases, the unexpired ₹66,000 (Apr–Jun 2026) remains an asset on the Balance Sheet. Releases larger than the balance are rejected.

### Salaries - T018, T020
Accrual (30 Apr): `Dr Salaries Expense 40,000 · Cr Salaries Payable 37,000 · Cr TDS & PF Payable 3,000`. Payment on 2 May: `Dr Salaries Payable 37,000 · Cr Bank` - no second expense. Payments above the liability outstanding are rejected. The statutory deposit uses the same type against account 2300.

### Loans
- **Received (T007):** `Dr Bank 8,00,000 · Cr Bank Loan 8,00,000` - a liability, not income.
- **Repayment (T056, 15 Sep):** principal ₹1,00,000 and interest ₹39,300 in one cash payment: `Dr Bank Loan 1,00,000 · Dr Interest Expense 39,300 · Cr Bank 1,39,300`. Only the principal reduces the liability. Interest amounts are entered as illustrative figures (≈ 11% p.a. on the outstanding balance); the model does not compute an amortisation schedule.
- **Given (T032):** `Dr Loan Given 1,50,000 · Cr Bank` - an asset, not an expense.
- **Recovery (T081):** `Dr Bank 54,500 · Cr Loan Given 50,000 · Cr Interest Income 4,500`.
- **Accrual treatment:** at year-end (31 Mar) a JOURNAL accrues interest earned but not yet received (`Dr Accrued Interest Receivable · Cr Interest Income`, ₹2,100) and interest on the bank loan not yet paid (`Dr Interest Expense · Cr Accrued Expenses`, ₹3,200). If a later loan recovery includes interest and an accrued receivable exists, the engine clears the receivable first and recognises only the remainder as income (no double counting).
- Checks *L1/L2* compare each loan account with a separate principal-only tracker.

### GST (simplified, educational)
- One combined rate per transaction from a configurable list (0, 5, 12, 18, 28 %). Treatments: **TAXABLE** (rate > 0), **EXEMPT**, **NON_TAXABLE** (both 0 % and produce no GST lines). Examples: electricity bills are NON_TAXABLE; a school workshop fee is EXEMPT.
- **Input GST** on inventory, assets, prepaid rent and expenses goes to *Input GST Credit* (an asset) - never into inventory cost, asset cost or expense.
- **Output GST** on sales and services goes to *Output GST Payable* (a liability) - never into revenue.
- **Settlement** (`GST_SETTLEMENT`): output payable is set off against available input credit, any shortfall is paid from a bank account, and surplus credit carries forward. T043 (20 Jul): `Dr Output GST 95,220 · Cr Input GST 95,220` (no cash). T099 (20 Feb 2026): `Dr Output GST 69,840 · Cr Input GST 66,840 · Cr Bank 3,000`.
- At 31 Mar 2026 the unsettled Feb–Mar GST remains: Input credit ₹21,240 and Output payable ₹29,700 (the return would be filed after year-end).
- **Limitations:** no CGST/SGST/IGST split, place of supply, reverse charge, blocked credits, rate changes, invoice matching, return forms or interest/penalties. Real eligibility depends on the transaction and current law.

### Receivables, payables
Customer and supplier names are stored on the AR/AP journal lines; checks *S1100/S2001* confirm the ledger balance equals the sum of party balances. Year-end: receivables ₹2,77,200 (Bright Offices LLP), payables ₹1,39,240 (Sharma Electronics).

### Income categories and expenses exercised
Income: Sales (18 sale entries), Service Income (4 service entries), Interest Income (bank interest, loan interest). Expenses: COGS, Salaries, Rent (cash rent + prepaid release), Utilities, Advertising, Depreciation, Bank Charges, Interest Expense, Other Operating. A test asserts every mandatory account appears in the ledger.

## 5. Corrections
Posted transactions cannot be edited or deleted in the UI/API. To correct a mistake, post a reversing **Manual journal** (swap the debit and credit of the wrong entry) and then the correct transaction, preserving the audit trail.

## 6. Reporting periods
`?from=YYYY-MM-DD&to=YYYY-MM-DD` (or the sidebar picker). Income/expenses are limited to the window; balance-sheet items are cumulative to `to`; earlier-period profit moves to Retained Earnings. Example: Apr–Sep 2025 balances (tested), and a Q2-only window with Q1 profit rolled to retained earnings (tested).

## 7. Known limitations
No disposals or revaluation; no multi-currency; no bank-statement import (the "reconciliation" is limited to agreeing cash/bank ledger accounts with the sum of their journal lines and checking they never go negative); single-company; no authentication; GST is simplified; depreciation uses a 365-day year; sample loan interest is entered, not computed.
