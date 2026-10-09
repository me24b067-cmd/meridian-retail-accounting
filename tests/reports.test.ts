import { describe, expect, it } from "vitest";
import { buildLedger } from "@/lib/accounting/ledger";
import { buildFinancials } from "@/lib/accounting/reports";
import { chart, capital, fin, post, tx } from "./helpers";

const buy = tx({ type: "PURCHASE", date: "2025-04-02", item: "CHG", quantity: "100", unitAmount: "100", gstRate: "18", settle: "1002", party: "S" });
const sale = (date: string, qty = "40") => tx({ type: "SALE", date, item: "CHG", quantity: qty, unitAmount: "200", gstRate: "18", settle: "1001" });
const rent = (date: string) => tx({ type: "EXPENSE", date, amount: "1000", account: "5102", settle: "1002", gstRate: "0", gstTreatment: "NON_TAXABLE" });

describe("trial balance, P&L and balance sheet", () => {
  const txs = [capital(), buy, sale("2025-05-01"), rent("2025-05-05")];
  const f = fin(txs);
  it("trial balance is balanced", () => {
    expect(f.trialBalance.difference.toNumber()).toBe(0);
    expect(f.trialBalance.totalDebit.toNumber()).toBe(f.trialBalance.totalCredit.toNumber());
  });
  it("P&L: trading formula", () => {
    const p = f.profitAndLoss;
    expect(p.salesRevenue.toNumber()).toBe(8000);
    expect(p.cogs.toNumber()).toBe(4000);
    expect(p.grossProfit.toNumber()).toBe(4000);
    expect(p.netProfit.toNumber()).toBe(3000);
    expect(p.netProfit.toNumber()).toBe(p.totalIncome.minus(p.totalExpenses).toNumber());
  });
  it("excludes capital, loan principal and GST from income and expense", () => {
    const g = fin([capital(), tx({ type: "LOAN_RECEIVED", amount: "50000", settle: "1002", party: "B" }), buy]);
    expect(g.profitAndLoss.totalIncome.toNumber()).toBe(0);
    expect(g.profitAndLoss.totalExpenses.toNumber()).toBe(0);
  });
  it("balance sheet balances and includes profit once", () => {
    const b = f.balanceSheet;
    expect(b.difference.toNumber()).toBe(0);
    expect(b.currentYearProfit.toNumber()).toBe(3000);
    expect(b.totalEquity.toNumber()).toBe(1_000_000 + 3000);
  });
  it("shows contra accounts as deductions from fixed assets", () => {
    const g = fin([capital(), tx({ type: "ASSET_PURCHASE", date: "2025-04-03", item: "Desk", account: "1600", amount: "36500", gstRate: "18", settle: "1002", usefulLifeYears: "10", residualValue: "0" }),
      tx({ type: "DEPRECIATION", date: "2025-06-30" })]);
    const net = g.balanceSheet.rows.find((r) => r.label === "Net Fixed Assets")!.amount!;
    const acc = g.balanceSheet.rows.find((r) => r.code === "1601")!.amount!;
    expect(acc.isNegative()).toBe(true);
    expect(net.toNumber()).toBe(36500 + acc.toNumber());
  });
});

describe("period filtering", () => {
  const txs = [capital(), buy, sale("2025-05-01"), sale("2025-07-01"), rent("2025-07-05")];
  const entries = post(txs).entries;
  it("reports only the requested window for income and expense accounts", () => {
    const q1 = buildFinancials(entries, chart, { start: "2025-04-01", end: "2025-06-30" });
    expect(q1.profitAndLoss.salesRevenue.toNumber()).toBe(8000);
    const q2 = buildFinancials(entries, chart, { start: "2025-07-01", end: "2025-09-30" });
    expect(q2.profitAndLoss.salesRevenue.toNumber()).toBe(8000);
    expect(q2.profitAndLoss.netProfit.toNumber()).toBe(3000);
  });
  it("rolls prior-period profit into retained earnings without double counting or imbalance", () => {
    const q2 = buildFinancials(entries, chart, { start: "2025-07-01", end: "2025-09-30" });
    expect(q2.balanceSheet.retainedEarnings.toNumber()).toBe(4000); // Q1 profit: 8000 - 4000 cogs
    expect(q2.balanceSheet.currentYearProfit.toNumber()).toBe(3000);
    expect(q2.balanceSheet.difference.toNumber()).toBe(0);
    expect(q2.trialBalance.difference.toNumber()).toBe(0);
  });
  it("ignores transactions after the reporting date", () => {
    const early = buildFinancials(entries, chart, { start: "2025-04-01", end: "2025-04-30" });
    expect(early.profitAndLoss.salesRevenue.toNumber()).toBe(0);
    expect(early.balanceSheet.difference.toNumber()).toBe(0);
  });
});

describe("general ledger", () => {
  it("aggregates running balances in the normal direction and honours opening balances", () => {
    const entries = post([capital(), buy, sale("2025-05-01")]).entries;
    const all = buildLedger(entries, chart);
    const bank = all.find((a) => a.account.code === "1002")!;
    expect(bank.closing.toNumber()).toBe(1_000_000 - 11800);
    const later = buildLedger(entries, chart, { from: "2025-05-01" }).find((a) => a.account.code === "1002")!;
    expect(later.opening.toNumber()).toBe(1_000_000 - 11800);
    expect(later.rows.length).toBe(0);
  });
});
