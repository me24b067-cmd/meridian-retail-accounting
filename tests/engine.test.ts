import { describe, expect, it } from "vitest";
import { balanceOf, capital, fin, post, tx } from "./helpers";

const buy = (over = {}) => tx({ type: "PURCHASE", date: "2025-04-02", item: "CHG", quantity: "100", unitAmount: "100", gstRate: "18", settle: "1002", party: "Supplier A", ...over });
const sell = (over = {}) => tx({ type: "SALE", date: "2025-04-05", item: "CHG", quantity: "40", unitAmount: "200", gstRate: "18", settle: "1001", ...over });

describe("transaction validation", () => {
  it("rejects duplicate transaction IDs", () => {
    const a = capital(); const b = { ...capital(), txnId: a.txnId };
    expect(() => post([a, b])).toThrow(/Duplicate transaction ID/);
  });
  it("rejects invalid account references", () => {
    expect(() => post([capital(), tx({ type: "EXPENSE", amount: "100", account: "9999", settle: "1002" })])).toThrow(/unknown account code "9999"/);
    expect(() => post([capital(), tx({ type: "EXPENSE", amount: "100", account: "5103", settle: "5103" })])).toThrow(/must be a cash or bank account/);
  });
  it("rejects bad dates, types, blank descriptions and non-positive amounts", () => {
    expect(() => post([tx({ type: "CAPITAL", amount: "10", settle: "1001", date: "01/04/2025" })])).toThrow(/Invalid date/);
    expect(() => post([tx({ type: "NOPE" })])).toThrow(/Unknown transaction type/);
    expect(() => post([tx({ type: "CAPITAL", amount: "10", settle: "1001", description: " " })])).toThrow(/Description/);
    expect(() => post([tx({ type: "CAPITAL", amount: "-5", settle: "1001" })])).toThrow(/greater than zero/);
    expect(() => post([tx({ type: "CAPITAL", amount: "abc", settle: "1001" })])).toThrow(/Invalid number/);
  });
  it("does not allow cost of goods sold or depreciation to be expensed manually", () => {
    expect(() => post([capital(), tx({ type: "EXPENSE", amount: "10", account: "5001", settle: "1002" })])).toThrow(/posted automatically/);
  });
});

describe("cash, banking and transfers", () => {
  it("records a transfer between banks without touching income or expenses", () => {
    const f = fin([capital(), tx({ type: "TRANSFER", amount: "200000", settle: "1002", toAccount: "1003" })]);
    expect(f.profitAndLoss.totalIncome.toNumber()).toBe(0);
    expect(f.profitAndLoss.totalExpenses.toNumber()).toBe(0);
    expect(f.trialBalance.rows.find((r) => r.code === "1003")!.debit.toNumber()).toBe(200000);
  });
  it("rejects a transfer to the same account", () => {
    expect(() => post([capital(), tx({ type: "TRANSFER", amount: "5", settle: "1002", toAccount: "1002" })])).toThrow(/same account/);
  });
});

describe("inventory, sales and GST", () => {
  it("keeps recoverable input GST out of inventory cost", () => {
    const txs = [capital(), buy()];
    expect(balanceOf(txs, "1200")).toBe(10000); // 100 x 100, GST excluded
    expect(balanceOf(txs, "1400")).toBe(1800); // 18% recoverable
    expect(balanceOf(txs, "1002")).toBe(1_000_000 - 11800);
  });
  it("credit sale: revenue and output GST on sale, COGS from weighted average, receivable raised", () => {
    const txs = [capital(), buy(), sell({ settle: "CREDIT", party: "Cust A" })];
    expect(balanceOf(txs, "4001")).toBe(-8000);
    expect(balanceOf(txs, "2200")).toBe(-1440);
    expect(balanceOf(txs, "1100")).toBe(9440);
    expect(balanceOf(txs, "5001")).toBe(4000); // 40 x avg 100
    expect(balanceOf(txs, "1200")).toBe(6000);
  });
  it("collection settles the receivable without a second revenue recognition", () => {
    const txs = [capital(), buy(), sell({ settle: "CREDIT", party: "Cust A" }), tx({ type: "COLLECTION", date: "2025-04-10", party: "Cust A", amount: "9440", settle: "1002" })];
    expect(balanceOf(txs, "1100")).toBe(0);
    expect(balanceOf(txs, "4001")).toBe(-8000); // unchanged
  });
  it("rejects over-collection and unknown customers", () => {
    const base = [capital(), buy(), sell({ settle: "CREDIT", party: "Cust A" })];
    expect(() => post([...base, tx({ type: "COLLECTION", date: "2025-04-10", party: "Cust A", amount: "9441", settle: "1002" })])).toThrow(/exceeds/);
    expect(() => post([...base, tx({ type: "COLLECTION", date: "2025-04-10", party: "Nobody", amount: "1", settle: "1002" })])).toThrow(/exceeds/);
  });
  it("supplier payment settles payable without double-counting the purchase", () => {
    const txs = [capital(), buy({ settle: "CREDIT" }), tx({ type: "SUPPLIER_PAYMENT", date: "2025-04-20", party: "Supplier A", amount: "11800", settle: "1002" })];
    expect(balanceOf(txs, "2001")).toBe(0);
    expect(balanceOf(txs, "1200")).toBe(10000);
    expect(balanceOf(txs, "1002")).toBe(1_000_000 - 11800);
    expect(() => post([capital(), buy({ settle: "CREDIT" }), tx({ type: "SUPPLIER_PAYMENT", date: "2025-04-20", party: "Supplier A", amount: "11801", settle: "1002" })])).toThrow(/exceeds/);
  });
  it("blocks negative inventory under the default policy", () => {
    expect(() => post([capital(), buy(), sell({ quantity: "101" })])).toThrow(/Insufficient stock/);
  });
  it("credit transactions need a named party", () => {
    expect(() => post([capital(), buy({ settle: "CREDIT", party: "" })])).toThrow(/needs a customer\/supplier/);
  });
  it("exempt and non-taxable transactions produce no GST; taxable needs a rate", () => {
    const e = post([capital(), tx({ type: "SERVICE", amount: "1000", gstRate: "0", gstTreatment: "EXEMPT", settle: "1001" })]).entries[1];
    expect(e.gstTreatment).toBe("EXEMPT");
    expect(e.lines.some((l) => l.accountCode === "2200")).toBe(false);
    expect(() => post([tx({ type: "SERVICE", amount: "1000", gstRate: "0", gstTreatment: "TAXABLE", settle: "1001" })])).toThrow(/above 0/);
    expect(() => post([tx({ type: "SERVICE", amount: "1000", gstRate: "7", settle: "1001" })])).toThrow(/Unsupported GST rate/);
  });
  it("GST settlement offsets output against input and pays only the shortfall", () => {
    const base = [capital(), buy({ quantity: "10" }), sell({ quantity: "10", unitAmount: "300" })]; // input 180, output 540
    const e = post([...base, tx({ type: "GST_SETTLEMENT", date: "2025-04-30", settle: "1002" })]).entries.at(-1)!;
    const line = (c: string) => e.lines.find((l) => l.accountCode === c)!;
    expect(line("2200").debit.toNumber()).toBe(540);
    expect(line("1400").credit.toNumber()).toBe(180);
    expect(line("1002").credit.toNumber()).toBe(360);
  });
  it("GST settlement keeps excess input credit as an asset", () => {
    const base = [capital(), buy(), sell({ quantity: "10", unitAmount: "100" })]; // input 1800, output 180
    const txs = [...base, tx({ type: "GST_SETTLEMENT", date: "2025-04-30", settle: "1002" })];
    expect(balanceOf(txs, "1400")).toBe(1620);
    expect(balanceOf(txs, "2200")).toBe(0);
  });
});

describe("fixed assets, prepaid, salaries", () => {
  const asset = tx({ type: "ASSET_PURCHASE", date: "2025-04-03", item: "Van", account: "1620", amount: "500000", gstRate: "18", settle: "1002", usefulLifeYears: "5", residualValue: "50000" });
  it("capitalises asset purchases and recoverable GST, never expensing them", () => {
    expect(balanceOf([capital(), asset], "1620")).toBe(500000);
    expect(balanceOf([capital(), asset], "1400")).toBe(90000);
    expect(fin([capital(), asset]).profitAndLoss.totalExpenses.toNumber()).toBe(0);
  });
  it("rejects asset purchases to non-asset accounts and bad residual values", () => {
    expect(() => post([capital(), { ...asset, account: "5102" }])).toThrow(/not a fixed-asset cost account/);
    expect(() => post([capital(), { ...asset, residualValue: "500000" }])).toThrow(/Residual/);
  });
  it("prepaid rent stays an asset until released", () => {
    const pre = tx({ type: "PREPAYMENT", date: "2025-04-05", amount: "120000", gstRate: "18", settle: "1002" });
    const rel = tx({ type: "PREPAID_RELEASE", date: "2025-06-30", amount: "30000" });
    const txs = [capital(), pre, rel];
    expect(balanceOf(txs, "1300")).toBe(90000);
    expect(balanceOf(txs, "5102")).toBe(30000);
    expect(() => post([capital(), pre, tx({ type: "PREPAID_RELEASE", date: "2025-06-30", amount: "120001" })])).toThrow(/exceeds prepaid/);
  });
  it("paying an accrued salary reduces the liability and does not repeat the expense", () => {
    const acc = tx({ type: "SALARY_ACCRUAL", date: "2025-04-30", amount: "50000", deductionAmount: "5000" });
    const pay = tx({ type: "SALARY_PAYMENT", date: "2025-05-02", amount: "45000", settle: "1002" });
    const txs = [capital(), acc, pay];
    expect(balanceOf(txs, "5101")).toBe(50000);
    expect(balanceOf(txs, "2002")).toBe(0);
    expect(balanceOf(txs, "2300")).toBe(-5000);
    expect(() => post([capital(), acc, tx({ type: "SALARY_PAYMENT", date: "2025-05-02", amount: "45001", settle: "1002" })])).toThrow(/exceeds the liability/);
  });
});

describe("loans", () => {
  const rec = tx({ type: "LOAN_RECEIVED", date: "2025-04-02", amount: "100000", settle: "1002", party: "Bank" });
  it("loan received is a liability, not income", () => {
    const f = fin([rec]);
    expect(f.profitAndLoss.totalIncome.toNumber()).toBe(0);
    expect(f.balanceSheet.totalLiabilities.toNumber()).toBe(100000);
  });
  it("repayment reduces principal only; interest is expensed separately", () => {
    const txs = [rec, tx({ type: "LOAN_REPAYMENT", date: "2025-05-02", amount: "20000", interestAmount: "1500", settle: "1002" })];
    expect(balanceOf(txs, "2100")).toBe(-80000);
    expect(balanceOf(txs, "5107")).toBe(1500);
    expect(balanceOf(txs, "1002")).toBe(100000 - 21500);
    expect(() => post([rec, tx({ type: "LOAN_REPAYMENT", date: "2025-05-02", amount: "100001", settle: "1002" })])).toThrow(/exceeds the loan/);
  });
  it("loan given is an asset; recovery reduces it and interest is income", () => {
    const given = tx({ type: "LOAN_GIVEN", date: "2025-04-05", amount: "50000", party: "Kavita", settle: "1002" });
    const rec2 = tx({ type: "LOAN_RECOVERY", date: "2025-06-05", amount: "20000", interestAmount: "900", party: "Kavita", settle: "1002" });
    const txs = [capital(), given, rec2];
    expect(balanceOf(txs, "1500")).toBe(30000);
    expect(balanceOf(txs, "4003")).toBe(-900);
    expect(fin([capital(), given]).profitAndLoss.totalExpenses.toNumber()).toBe(0);
  });
  it("accrued interest receivable is cleared by a later recovery before new income is recognised", () => {
    const given = tx({ type: "LOAN_GIVEN", date: "2025-04-05", amount: "50000", party: "Kavita", settle: "1002" });
    const accrual = tx({ type: "JOURNAL", date: "2025-06-30", amount: "700", account: "1150", toAccount: "4003", party: "Kavita" });
    const rec2 = tx({ type: "LOAN_RECOVERY", date: "2025-07-05", amount: "10000", interestAmount: "900", party: "Kavita", settle: "1002" });
    const txs = [capital(), given, accrual, rec2];
    expect(balanceOf(txs, "1150")).toBe(0);
    expect(balanceOf(txs, "4003")).toBe(-900); // 700 accrued + 200 new, not 1,600
  });
  it("JOURNAL cannot post to the computed current-year profit account", () => {
    expect(() => post([capital(), tx({ type: "JOURNAL", amount: "1", account: "1001", toAccount: "3003" })])).toThrow(/computed/);
  });
});
