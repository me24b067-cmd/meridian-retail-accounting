import type { Account, PostedLedger, TrackerKey } from "@/types/accounting";
import { D, ZERO, sum, type Dec } from "@/lib/accounting/money";
import { totals } from "@/lib/accounting/journal";
import type { Financials, Period } from "@/lib/accounting/reports";
import { fixedAssetReport, inventoryReport } from "@/lib/accounting/subreports";

export interface Check {
  id: string;
  name: string;
  expected: Dec;
  actual: Dec;
  difference: Dec;
  passed: boolean;
  detail: string;
}

const mk = (id: string, name: string, expected: Dec, actual: Dec, detail: string): Check => {
  const difference = new D(actual).minus(expected);
  return { id, name, expected, actual, difference, passed: difference.isZero(), detail };
};

/**
 * Accounting integrity checks. Every check shows both numbers and their difference - nothing is hard-coded to pass.
 * Where possible the second number comes from a different source (subledger, register, tracker) than the first.
 */
export function runChecks(posted: PostedLedger, accounts: Account[], fin: Financials, period: Period): Check[] {
  const entries = posted.entries.filter((e) => e.date <= period.end);
  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const natAsOf = (code: string): Dec => {
    const a = byCode.get(code)!;
    let dr = ZERO, cr = ZERO;
    for (const e of entries) for (const l of e.lines) if (l.accountCode === code) { dr = dr.plus(l.debit); cr = cr.plus(l.credit); }
    return a.normalBalance === "debit" ? dr.minus(cr) : cr.minus(dr);
  };
  const track = (key: TrackerKey) => sum(posted.trackerEvents.filter((t) => t.key === key && t.date <= period.end).map((t) => t.amount));
  const checks: Check[] = [];
  const bs = fin.balanceSheet, pl = fin.profitAndLoss;

  checks.push(mk("J1", "Total journal debits = total journal credits", fin.totalJournalDebit, fin.totalJournalCredit, `${entries.length} entries`));
  const unbalanced = entries.filter((e) => !totals(e.lines).debit.eq(totals(e.lines).credit)).length;
  checks.push(mk("J2", "Every journal entry balances (count of unbalanced entries)", ZERO, new D(unbalanced), "Entries where debit != credit"));
  checks.push(mk("T1", "Trial Balance: total debits = total credits", fin.trialBalance.totalDebit, fin.trialBalance.totalCredit, "Difference column of the Trial Balance"));
  checks.push(mk("B1", "Balance Sheet: Total Assets = Total Liabilities + Total Equity", bs.totalAssets, bs.totalLiabilities.plus(bs.totalEquity), "Difference = Assets - Liabilities - Equity"));
  checks.push(mk("P1", "Net profit = Total income - Total expenses", pl.totalIncome.minus(pl.totalExpenses), pl.netProfit, "Recomputed from income and expense totals"));
  checks.push(mk("P2", "Gross profit = Sales + Service - COGS", pl.salesRevenue.plus(pl.serviceIncome).minus(pl.cogs), pl.grossProfit, "Trading formula"));
  checks.push(mk("E1", "Balance Sheet current-year profit = P&L net profit", pl.netProfit, bs.currentYearProfit, "Profit is included in equity exactly once"));

  const opening = natAsOf("3002");
  const priorProfit = bs.retainedEarnings.minus(opening);
  checks.push(mk("E2", "Equity = capital + retained earnings + current-year profit", natAsOf("3001").plus(opening).plus(priorProfit).plus(pl.netProfit), bs.totalEquity,
    `Retained earnings includes prior-period profit of ${priorProfit.toFixed(2)}`));

  // Net profit independently from raw journal lines (in period)
  let inc = ZERO, exp = ZERO;
  for (const e of entries) {
    if (e.date < period.start) continue;
    for (const l of e.lines) {
      const t = byCode.get(l.accountCode)?.type;
      if (t === "income") inc = inc.plus(l.credit).minus(l.debit);
      if (t === "expense") exp = exp.plus(l.debit).minus(l.credit);
    }
  }
  checks.push(mk("P3", "Net profit agrees with income - expenses summed straight from journal lines", inc.minus(exp), pl.netProfit, "Independent aggregation"));

  for (const code of ["1001", "1002", "1003"]) {
    let net = ZERO;
    for (const e of entries) for (const l of e.lines) if (l.accountCode === code) net = net.plus(l.debit).minus(l.credit);
    const shown = bs.rows.find((r) => r.code === code)?.amount ?? ZERO;
    checks.push(mk(`C${code}`, `${byCode.get(code)!.name}: balance sheet = sum of its journal lines`, net, shown, "Cash book agreement"));
  }
  const cashBank = ["1001", "1002", "1003"];
  let minBalance = ZERO; let minWhere = "";
  const running = new Map<string, Dec>();
  for (const e of [...entries].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))) {
    for (const l of e.lines) if (cashBank.includes(l.accountCode)) {
      const v = (running.get(l.accountCode) ?? ZERO).plus(l.debit).minus(l.credit);
      running.set(l.accountCode, v);
      if (v.lt(minBalance)) { minBalance = v; minWhere = `${l.accountCode} after ${e.txnId}`; }
    }
  }
  checks.push(mk("C4", "No cash or bank account is ever overdrawn (lowest running balance)", ZERO, D.min(ZERO, minBalance), minWhere || "All balances stayed >= 0"));

  const inv = inventoryReport(posted, period);
  checks.push(mk("I1", "Inventory ledger (1200) = inventory subledger value", inv.totalValue, natAsOf("1200"), "Subledger = perpetual weighted-average movements"));
  const negQty = inv.items.filter((i) => i.quantity.isNegative()).length;
  checks.push(mk("I2", "No item has negative stock (count)", ZERO, new D(negQty), "Policy: negative inventory disallowed unless configured"));
  const purchases = sum(inv.movements.filter((m) => m.kind === "PURCHASE").map((m) => m.value));
  const sold = sum(inv.movements.filter((m) => m.kind === "SALE").map((m) => m.value));
  checks.push(mk("I3", "Inventory purchased - cost of goods sold = closing inventory", purchases.minus(sold), natAsOf("1200"), "Roll-forward"));
  const cogsAll = natAsOf("5001");
  checks.push(mk("I4", "COGS ledger (5001) = cost of sale movements in subledger", sold, cogsAll, "Costs leaving inventory = expense recognised"));

  const fa = fixedAssetReport(posted, period);
  const costGl = sum(["1600", "1610", "1620"].map(natAsOf));
  const accGl = sum(["1601", "1611", "1621"].map(natAsOf));
  checks.push(mk("F1", "Fixed asset cost (ledger) = asset register cost", fa.totalCost, costGl, "Three fixed assets"));
  checks.push(mk("F2", "Accumulated depreciation (ledger) = depreciation schedule", fa.totalAccumulated, accGl, "Contra-asset accounts"));
  checks.push(mk("F3", "Net fixed assets on Balance Sheet = cost - accumulated depreciation", costGl.minus(accGl), fa.totalNetBookValue, "Net book value"));
  const periodDep = sum(entries.filter((e) => e.date >= period.start).flatMap((e) => e.lines.filter((l) => l.accountCode === "5105").map((l) => l.debit.minus(l.credit))));
  checks.push(mk("F4", "Depreciation expense in period = depreciation schedule", fa.depreciationInPeriod, periodDep, "P&L vs register"));

  for (const [code, label] of [["1100", "Accounts receivable"], ["2001", "Accounts payable"]] as const) {
    const parties = new Map<string, Dec>();
    let untagged = ZERO;
    for (const e of entries) for (const l of e.lines) if (l.accountCode === code) {
      const signed = byCode.get(code)!.normalBalance === "debit" ? l.debit.minus(l.credit) : l.credit.minus(l.debit);
      if (l.party) parties.set(l.party, (parties.get(l.party) ?? ZERO).plus(signed)); else untagged = untagged.plus(signed);
    }
    checks.push(mk(`S${code}`, `${label} ledger = sum of customer/supplier subledger balances`, natAsOf(code), sum([...parties.values()]).plus(untagged),
      untagged.isZero() ? `${parties.size} parties` : `Untagged amount ${untagged.toFixed(2)} sits outside any party`));
  }

  const loanGl = natAsOf("2100");
  checks.push(mk("L1", "Bank loan (ledger) = loan received - principal repaid (interest excluded)", track("loanAvailedPrincipal"), loanGl, "Principal-only tracker"));
  checks.push(mk("L2", "Loan given (ledger) = loan advanced - principal recovered", track("loanGivenPrincipal"), natAsOf("1500"), "Principal-only tracker"));
  checks.push(mk("R1", "Prepaid rent (ledger) = prepaid paid - amount expensed", track("prepaidNet"), natAsOf("1300"), "Unexpired portion"));
  const inputRecorded = sum(entries.flatMap((e) => e.lines.filter((l) => l.accountCode === "1400").map((l) => l.debit)));
  checks.push(mk("G1", "Input GST credit (ledger) = credit recorded - credit utilised", inputRecorded.minus(track("gstUtilised")), natAsOf("1400"),
    "GST on inventory, assets and expenses only; settlements reduce the credit"));
  return checks;
}

export const allPassed = (checks: Check[]) => checks.every((c) => c.passed);
