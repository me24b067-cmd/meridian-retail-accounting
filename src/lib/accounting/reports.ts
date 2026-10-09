import type { Account, JournalEntry } from "@/types/accounting";
import { naturalBalance } from "./ledger";
import { ZERO, sum, type Dec } from "./money";

export interface Period {
  start: string; // inclusive, YYYY-MM-DD
  end: string; // inclusive reporting date
}

export const DEFAULT_PERIOD: Period = { start: "2025-04-01", end: "2026-03-31" };

export type RowKind = "heading" | "line" | "subtotal" | "total" | "memo";
export interface StatementRow {
  label: string;
  code?: string;
  amount?: Dec;
  kind: RowKind;
}

export interface TrialBalanceRow { code: string; name: string; debit: Dec; credit: Dec }
export interface TrialBalance { period: Period; rows: TrialBalanceRow[]; totalDebit: Dec; totalCredit: Dec; difference: Dec }

export interface ProfitAndLoss {
  period: Period;
  rows: StatementRow[];
  salesRevenue: Dec; serviceIncome: Dec; interestIncome: Dec; totalIncome: Dec;
  cogs: Dec; grossProfit: Dec; operatingExpenses: Dec; depreciation: Dec; interestExpense: Dec;
  totalExpenses: Dec; netProfit: Dec;
}

export interface BalanceSheet {
  asOf: string;
  rows: StatementRow[];
  totalAssets: Dec; totalLiabilities: Dec; totalEquity: Dec; totalLiabilitiesAndEquity: Dec;
  retainedEarnings: Dec; currentYearProfit: Dec;
  difference: Dec; balanced: boolean;
}

export interface Financials {
  period: Period;
  /** Net debit-minus-credit per account over the period (income/expense) or cumulative to `end` (balance sheet). */
  trialBalance: TrialBalance;
  profitAndLoss: ProfitAndLoss;
  balanceSheet: BalanceSheet;
  totalJournalDebit: Dec;
  totalJournalCredit: Dec;
  entriesIncluded: number;
}

const isPnl = (a: Account) => a.type === "income" || a.type === "expense";

/**
 * Pipeline steps 4-6: general ledger -> trial balance -> P&L + Balance Sheet, for one period.
 *  - Balance-sheet accounts: cumulative to the period end date.
 *  - Income/expense accounts: only postings inside [start, end] (this is the "current-year profit").
 *  - Profit earned before `start` is carried into Retained Earnings automatically (no double counting, no plug).
 */
export function buildFinancials(entries: JournalEntry[], accounts: Account[], period: Period): Financials {
  const dr = new Map<string, Dec>();
  const cr = new Map<string, Dec>();
  let priorProfit = ZERO;
  let totalJournalDebit = ZERO;
  let totalJournalCredit = ZERO;
  let included = 0;
  const byCode = new Map(accounts.map((a) => [a.code, a]));

  for (const e of entries) {
    if (e.date > period.end) continue;
    included++;
    for (const l of e.lines) {
      const acct = byCode.get(l.accountCode);
      if (!acct) continue;
      totalJournalDebit = totalJournalDebit.plus(l.debit);
      totalJournalCredit = totalJournalCredit.plus(l.credit);
      if (isPnl(acct) && e.date < period.start) {
        // Prior-period result: income is credit-normal, so profit = credits - debits.
        priorProfit = priorProfit.plus(l.credit).minus(l.debit);
        continue;
      }
      dr.set(l.accountCode, (dr.get(l.accountCode) ?? ZERO).plus(l.debit));
      cr.set(l.accountCode, (cr.get(l.accountCode) ?? ZERO).plus(l.credit));
    }
  }

  const nat = (code: string): Dec => {
    const a = byCode.get(code);
    return a ? naturalBalance(a, dr.get(code) ?? ZERO, cr.get(code) ?? ZERO) : ZERO;
  };

  // ---- Trial balance ----
  const tbRows: TrialBalanceRow[] = [];
  for (const a of accounts) {
    if (a.code === "3003") continue; // computed, never posted
    let net = (dr.get(a.code) ?? ZERO).minus(cr.get(a.code) ?? ZERO);
    if (a.code === "3002") net = net.minus(priorProfit); // roll prior-period profit into retained earnings (credit)
    if (net.isZero() && !(dr.has(a.code) || cr.has(a.code))) continue;
    tbRows.push({
      code: a.code, name: a.code === "3002" && !priorProfit.isZero() ? `${a.name} (incl. prior-period profit)` : a.name,
      debit: net.gt(0) ? net : ZERO, credit: net.lt(0) ? net.negated() : ZERO,
    });
  }
  const totalDebit = sum(tbRows.map((r) => r.debit));
  const totalCredit = sum(tbRows.map((r) => r.credit));
  const trialBalance: TrialBalance = { period, rows: tbRows, totalDebit, totalCredit, difference: totalDebit.minus(totalCredit) };

  const profitAndLoss = buildProfitAndLoss(accounts, nat, period);
  const balanceSheet = buildBalanceSheet(accounts, nat, period.end, priorProfit, profitAndLoss.netProfit);
  return { period, trialBalance, profitAndLoss, balanceSheet, totalJournalDebit, totalJournalCredit, entriesIncluded: included };
}

function buildProfitAndLoss(accounts: Account[], nat: (c: string) => Dec, period: Period): ProfitAndLoss {
  const income = accounts.filter((a) => a.type === "income");
  const expense = accounts.filter((a) => a.type === "expense");
  const salesRevenue = nat("4001");
  const serviceIncome = nat("4002");
  const interestIncome = nat("4003");
  const customIncome = income.filter((a) => !["4001", "4002", "4003"].includes(a.code));
  const cogs = nat("5001");
  const depreciation = nat("5105");
  const interestExpense = nat("5107");
  const operating = expense.filter((a) => !["5001", "5105", "5107"].includes(a.code));
  const operatingExpenses = sum(operating.map((a) => nat(a.code)));
  const otherIncome = interestIncome.plus(sum(customIncome.map((a) => nat(a.code))));
  const totalIncome = salesRevenue.plus(serviceIncome).plus(otherIncome);
  const grossProfit = salesRevenue.plus(serviceIncome).minus(cogs);
  const totalExpenses = cogs.plus(operatingExpenses).plus(depreciation).plus(interestExpense);
  const netProfit = totalIncome.minus(totalExpenses);

  const line = (a: Account): StatementRow => ({ label: a.name, code: a.code, amount: nat(a.code), kind: "line" });
  const rows: StatementRow[] = [
    { label: "INCOME", kind: "heading" },
    line(accounts.find((a) => a.code === "4001")!),
    line(accounts.find((a) => a.code === "4002")!),
    line(accounts.find((a) => a.code === "4003")!),
    ...customIncome.map(line),
    { label: "Total Income", amount: totalIncome, kind: "subtotal" },
    { label: "COST OF GOODS SOLD", kind: "heading" },
    line(accounts.find((a) => a.code === "5001")!),
    { label: "Gross Profit (Sales + Service Income - Cost of Goods Sold)", amount: grossProfit, kind: "subtotal" },
    { label: "OPERATING EXPENSES", kind: "heading" },
    ...operating.map(line),
    { label: "Total Operating Expenses", amount: operatingExpenses, kind: "subtotal" },
    { label: "OTHER EXPENSES", kind: "heading" },
    line(accounts.find((a) => a.code === "5105")!),
    line(accounts.find((a) => a.code === "5107")!),
    { label: "Total Expenses (COGS + Operating + Depreciation + Interest)", amount: totalExpenses, kind: "subtotal" },
    { label: netProfit.gte(0) ? "NET PROFIT (Total Income - Total Expenses)" : "NET LOSS (Total Income - Total Expenses)", amount: netProfit, kind: "total" },
  ];
  return {
    period, rows, salesRevenue, serviceIncome, interestIncome, totalIncome, cogs, grossProfit,
    operatingExpenses, depreciation, interestExpense, totalExpenses, netProfit,
  };
}

const CURRENT_ASSET_GROUPS = ["Cash and Bank", "Receivables", "Inventory", "Prepaid Expenses", "GST"];

function buildBalanceSheet(accounts: Account[], nat: (c: string) => Dec, asOf: string, priorProfit: Dec, currentProfit: Dec): BalanceSheet {
  const rows: StatementRow[] = [];
  const assetAccts = accounts.filter((a) => a.type === "asset");
  const liabAccts = accounts.filter((a) => a.type === "liability");
  const signed = (a: Account) => (a.isContra ? nat(a.code).negated() : nat(a.code)); // contra-assets deduct
  const line = (a: Account): StatementRow => ({ label: a.name, code: a.code, amount: signed(a), kind: "line" });

  const isCurrent = (a: Account) => !["Loans", "Fixed Assets"].includes(a.group);
  const current = assetAccts.filter(isCurrent).sort(byGroupThenCode(CURRENT_ASSET_GROUPS));
  const loans = assetAccts.filter((a) => a.group === "Loans");
  const fixed = assetAccts.filter((a) => a.group === "Fixed Assets");
  const fixedCost = sum(fixed.filter((a) => !a.isContra).map((a) => nat(a.code)));
  const fixedAccum = sum(fixed.filter((a) => a.isContra).map((a) => nat(a.code)));
  const netFixed = fixedCost.minus(fixedAccum);
  const currentTotal = sum(current.map(signed));
  const loansTotal = sum(loans.map(signed));
  const totalAssets = currentTotal.plus(loansTotal).plus(netFixed);

  rows.push({ label: "ASSETS", kind: "heading" }, { label: "Current Assets", kind: "heading" }, ...current.map(line));
  rows.push({ label: "Total Current Assets", amount: currentTotal, kind: "subtotal" });
  rows.push({ label: "Loans Given", kind: "heading" }, ...loans.map(line), { label: "Total Loans Given", amount: loansTotal, kind: "subtotal" });
  rows.push({ label: "Fixed Assets (at cost less accumulated depreciation)", kind: "heading" });
  rows.push(...fixed.filter((a) => !a.isContra).map(line), { label: "Fixed assets at original cost", amount: fixedCost, kind: "subtotal" });
  rows.push(...fixed.filter((a) => a.isContra).map(line), { label: "Net Fixed Assets", amount: netFixed, kind: "subtotal" });
  rows.push({ label: "TOTAL ASSETS", amount: totalAssets, kind: "total" });

  const loanLiab = liabAccts.filter((a) => a.group === "Loans");
  const currentLiab = liabAccts.filter((a) => a.group !== "Loans");
  const currentLiabTotal = sum(currentLiab.map((a) => nat(a.code)));
  const loanLiabTotal = sum(loanLiab.map((a) => nat(a.code)));
  const totalLiabilities = currentLiabTotal.plus(loanLiabTotal);
  rows.push({ label: "LIABILITIES", kind: "heading" }, { label: "Current Liabilities", kind: "heading" }, ...currentLiab.map(line));
  rows.push({ label: "Total Current Liabilities", amount: currentLiabTotal, kind: "subtotal" });
  rows.push({ label: "Loan Liabilities", kind: "heading" }, ...loanLiab.map(line), { label: "Total Loan Liabilities", amount: loanLiabTotal, kind: "subtotal" });
  rows.push({ label: "TOTAL LIABILITIES", amount: totalLiabilities, kind: "total" });

  const capital = nat("3001");
  const retainedEarnings = nat("3002").plus(priorProfit);
  const otherEquity = accounts.filter((a) => a.type === "equity" && !["3001", "3002", "3003"].includes(a.code));
  const totalEquity = capital.plus(retainedEarnings).plus(currentProfit).plus(sum(otherEquity.map((a) => nat(a.code))));
  rows.push({ label: "EQUITY", kind: "heading" });
  rows.push({ label: "Owner's Capital", code: "3001", amount: capital, kind: "line" });
  rows.push({ label: "Retained Earnings / Opening Equity (incl. prior-period profit)", code: "3002", amount: retainedEarnings, kind: "line" });
  rows.push({ label: "Current-Year Profit or Loss", code: "3003", amount: currentProfit, kind: "line" });
  rows.push(...otherEquity.map(line));
  rows.push({ label: "TOTAL EQUITY", amount: totalEquity, kind: "total" });
  const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);
  rows.push({ label: "TOTAL LIABILITIES AND EQUITY", amount: totalLiabilitiesAndEquity, kind: "total" });

  const difference = totalAssets.minus(totalLiabilities).minus(totalEquity);
  return {
    asOf, rows, totalAssets, totalLiabilities, totalEquity, totalLiabilitiesAndEquity,
    retainedEarnings, currentYearProfit: currentProfit, difference, balanced: difference.isZero(),
  };
}

function byGroupThenCode(order: string[]) {
  return (a: Account, b: Account) => {
    const ga = order.indexOf(a.group), gb = order.indexOf(b.group);
    const ra = ga === -1 ? order.length : ga, rb = gb === -1 ? order.length : gb;
    return ra - rb || a.code.localeCompare(b.code);
  };
}
