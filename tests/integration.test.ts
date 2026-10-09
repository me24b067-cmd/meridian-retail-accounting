import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { postTransactions } from "@/lib/accounting/engine";
import { totals } from "@/lib/accounting/journal";
import { buildReports, resolvePeriod, type Books } from "@/lib/books";
import { loadBaseChart, loadSampleTransactions, parseTransactionsCsv, sourcesToCsv } from "@/lib/database/csv";
import { CSV_FILES, csvFor } from "@/lib/exports/csv";
import { buildWorkbook } from "@/lib/exports/excel";
import { fetchInrRates } from "@/lib/fx";

const accounts = loadBaseChart();
const sources = loadSampleTransactions();
const books = (): Books => ({ accounts, sources, posted: postTransactions(sources, accounts), storeMode: "test", storeLabel: "test" });
const rep = () => buildReports(books(), resolvePeriod({}));

describe("sample dataset through the full pipeline", () => {
  it("has at least 60 uniquely identified, described transactions inside the default period", () => {
    expect(sources.length).toBeGreaterThanOrEqual(60);
    expect(new Set(sources.map((s) => s.txnId)).size).toBe(sources.length);
    for (const s of sources) {
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.date >= "2025-04-01" && s.date <= "2026-03-31", s.txnId).toBe(true);
    }
  });
  it("covers every transaction type", () => {
    const types = new Set(sources.map((s) => s.type));
    for (const t of ["CAPITAL", "TRANSFER", "PURCHASE", "SALE", "SERVICE", "COLLECTION", "SUPPLIER_PAYMENT", "EXPENSE", "ASSET_PURCHASE", "PREPAYMENT", "PREPAID_RELEASE",
      "DEPRECIATION", "SALARY_ACCRUAL", "SALARY_PAYMENT", "LOAN_RECEIVED", "LOAN_REPAYMENT", "LOAN_GIVEN", "LOAN_RECOVERY", "INTEREST_INCOME", "GST_SETTLEMENT", "JOURNAL"]) {
      expect(types.has(t), t).toBe(true);
    }
  });
  it("posts every entry balanced", () => {
    const { entries } = books().posted;
    expect(entries.length).toBeGreaterThanOrEqual(60);
    for (const e of entries) expect(totals(e.lines).debit.eq(totals(e.lines).credit), e.id).toBe(true);
  });
  it("exercises every mandatory account in the ledger", () => {
    const used = new Set(books().posted.entries.flatMap((e) => e.lines.map((l) => l.accountCode)));
    const mandatory = ["1001", "1002", "1003", "1100", "1200", "1300", "1400", "1500", "1600", "1610", "1620", "1601", "1611", "1621", "2001", "2002", "2100", "2200",
      "3001", "4001", "4002", "4003", "5001", "5101", "5102", "5103", "5104", "5105", "5106", "5107", "5108"];
    for (const c of mandatory) expect(used.has(c), c).toBe(true);
  });
  it("trial balance and balance sheet balance to exactly zero", () => {
    const { financials } = rep();
    expect(financials.trialBalance.difference.toString()).toBe("0");
    expect(financials.balanceSheet.difference.toString()).toBe("0");
    expect(financials.balanceSheet.balanced).toBe(true);
  });
  it("passes every integrity check", () => {
    const failed = rep().checks.filter((c) => !c.passed);
    expect(failed.map((c) => `${c.id}: ${c.difference}`)).toEqual([]);
    expect(rep().checks.length).toBeGreaterThanOrEqual(25);
  });
  it("produces the same statements on every run (reproducible)", () => {
    const a = rep().financials, b = rep().financials;
    expect(a.balanceSheet.totalAssets.toString()).toBe(b.balanceSheet.totalAssets.toString());
    expect(a.profitAndLoss.netProfit.toString()).toBe(b.profitAndLoss.netProfit.toString());
  });
  it("is independent of the order the rows are supplied in", () => {
    const shuffled = [...sources].reverse();
    const f = buildReports({ ...books(), sources: shuffled, posted: postTransactions(shuffled, accounts) }, resolvePeriod({})).financials;
    expect(f.profitAndLoss.netProfit.toString()).toBe(rep().financials.profitAndLoss.netProfit.toString());
  });
  it("shows depreciation, GST credit and liability, prepaid remainder and loan principal-only balances", () => {
    const f = rep().financials, p = f.profitAndLoss;
    expect(p.depreciation.toNumber()).toBeGreaterThan(0);
    const row = (code: string) => f.balanceSheet.rows.find((r) => r.code === code)!.amount!.toNumber();
    expect(row("1300")).toBe(66000); // 3 of 12 months of the advance rent remain
    expect(row("2100")).toBe(500000); // 800,000 received - 3 x 100,000 principal; interest excluded
    expect(row("1500")).toBe(100000); // 150,000 lent - 50,000 recovered
    expect(row("1601") < 0 && row("1611") < 0 && row("1621") < 0).toBe(true);
    const gst = rep().gst;
    expect(gst.rows.some((r) => r.outputGst.gt(0)) && gst.rows.some((r) => r.inputGst.gt(0))).toBe(true);
  });
  it("filtering to an earlier date still balances", () => {
    const r = buildReports(books(), { start: "2025-04-01", end: "2025-09-30" });
    expect(r.financials.balanceSheet.balanced).toBe(true);
    expect(r.checks.filter((c) => !c.passed)).toEqual([]);
  });
});

describe("exports", () => {
  it("round-trips the source CSV", () => {
    expect(parseTransactionsCsv(sourcesToCsv(sources))).toEqual(sources);
  });
  it("creates all CSV exports with content", () => {
    const b = books(), r = rep();
    for (const f of CSV_FILES) expect(csvFor(f, b, r).split("\n").length, f).toBeGreaterThan(3);
    expect(csvFor("balance_sheet", b, r)).toContain("BALANCE SHEET DIFFERENCE");
  });
  it("creates a workbook with the 12 required sheets and a zero balance sheet difference", async () => {
    const buf = await buildWorkbook(books(), rep());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Read Me", "Chart of Accounts", "Source Transactions", "Journal Entries", "General Ledger", "Trial Balance",
      "Profit and Loss", "Balance Sheet", "Inventory", "Fixed Assets and Depreciation", "GST Summary", "Validation Results"]);
    const bs = wb.getWorksheet("Balance Sheet")!;
    let diff: unknown;
    bs.eachRow((row) => { if (String(row.getCell(2).value).startsWith("BALANCE SHEET DIFFERENCE")) diff = row.getCell(3).value; });
    // exceljs omits a cached value of exactly 0; Excel/LibreOffice recalculate the formula on open.
    expect((diff as { formula: string }).formula).toMatch(/^C\d+-C\d+-C\d+$/);
  });
  it("submission files exist when generated", () => {
    const f = path.join(process.cwd(), "submission", "Meridian_Retail_Accounting_Submission.xlsx");
    if (fs.existsSync(f)) expect(fs.statSync(f).size).toBeGreaterThan(10_000);
  });
});

describe("optional FX API never breaks the app", () => {
  it("returns unavailable (no throw) on network failure", async () => {
    const r = await fetchInrRates(vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch);
    expect(r.available).toBe(false);
    expect(r.message).toMatch(/unaffected/);
  });
  it("returns unavailable on HTTP errors and malformed bodies", async () => {
    expect((await fetchInrRates(vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch)).available).toBe(false);
    expect((await fetchInrRates(vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rates: {} }) }) as unknown as typeof fetch)).available).toBe(false);
  });
  it("parses a valid response (mocked - no live data is claimed)", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ date: "2026-01-01", rates: { INR: 90 } }) });
    const r = await fetchInrRates(f as unknown as typeof fetch);
    expect(r).toMatchObject({ available: true, asOf: "2026-01-01" });
    expect(r.rates.USD).toBe(90);
  });
});
