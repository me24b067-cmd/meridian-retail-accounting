import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { POST as excelPost } from "@/app/api/analyze/excel/route";
import { GET as templateGet } from "@/app/api/template/route";
import { postTransactions } from "@/lib/accounting/engine";
import { buildReports, resolvePeriod } from "@/lib/books";
import { loadBaseChart, loadSampleTransactions } from "@/lib/database/csv";
import { MAX_UPLOAD_ROWS, analyzeUpload, financialYearOf } from "@/lib/uploadAnalysis";

const accounts = loadBaseChart();
const sampleText = fs.readFileSync(path.join(process.cwd(), "data", "sample_transactions.csv"), "utf8");
const lines = sampleText.trim().split("\n");
const HEADER = lines[0];

describe("CSV upload analysis", () => {
  it("gives the same statements for the uploaded sample as the main pipeline", () => {
    const r = analyzeUpload(sampleText, accounts);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const main = buildReports({ accounts, sources: loadSampleTransactions(), posted: postTransactions(loadSampleTransactions(), accounts), storeMode: "x", storeLabel: "x" }, resolvePeriod({}));
    expect(r.period).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    expect(r.rep.financials.balanceSheet.totalAssets.toString()).toBe(main.financials.balanceSheet.totalAssets.toString());
    expect(r.rep.financials.profitAndLoss.netProfit.toString()).toBe(main.financials.profitAndLoss.netProfit.toString());
    expect(r.rep.financials.balanceSheet.balanced).toBe(true);
    expect(r.rep.checks.every((c) => c.passed)).toBe(true);
  });

  it("is tolerant of a BOM, odd header case/spacing, reordered and missing optional columns, and blank lines", () => {
    const csv = "﻿Txn ID, DATE ,Type,Description,Amount,Settle\n\nT1,2025-05-01,CAPITAL,Owner capital,\"1,00,000\",1002\n";
    const r = analyzeUpload(csv, accounts);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.rep.financials.balanceSheet.totalAssets.toNumber()).toBe(100000);
      expect(r.rep.financials.balanceSheet.balanced).toBe(true);
    }
  });

  it("reports a clear fatal message for missing required columns, empty data and oversized files", () => {
    expect(analyzeUpload("a,b,c\n1,2,3", accounts)).toMatchObject({ kind: "fatal", message: expect.stringMatching(/missing required column.*txn_id/) });
    expect(analyzeUpload("txn_id,date,type,description\n", accounts)).toMatchObject({ kind: "fatal", message: expect.stringMatching(/no transaction rows/) });
    expect(analyzeUpload("", accounts).kind).toBe("fatal");
    const many = `txn_id,date,type,description,amount,settle\n` + Array.from({ length: MAX_UPLOAD_ROWS + 1 }, (_, i) => `T${i},2025-05-01,CAPITAL,x,1,1002`).join("\n");
    expect(analyzeUpload(many, accounts)).toMatchObject({ kind: "fatal", message: expect.stringMatching(/Too many rows/) });
  });

  const COLS = HEADER.replace(/\r$/, "").split(",");
  /** Builds one CSV row with exactly the right number of fields. */
  const row = (o: Record<string, string>) => COLS.map((c) => o[c] ?? "").join(",");

  it("collects EVERY problem with spreadsheet row numbers instead of stopping at the first", () => {
    const bad = [
      COLS.join(","),
      row({ txn_id: "T1", date: "2025-05-01", type: "CAPITAL", description: "ok", amount: "1000", settle: "1002" }),
      row({ txn_id: "T900", date: "2025-05-01", type: "EXPENSE", description: "Unknown account", amount: "100", gst_rate: "0", gst_treatment: "NON_TAXABLE", account: "9999", settle: "1002" }),
      row({ txn_id: "T901", date: "2025-05-02", type: "SALE", description: "Oversell", party: "Walk-in", item: "CHG", quantity: "5", unit_amount: "10", gst_rate: "18", settle: "1002" }),
      row({ txn_id: "T902", date: "2025-13-45", type: "CAPITAL", description: "Bad date", amount: "10", settle: "1002" }),
      row({ txn_id: "T1", date: "2025-05-03", type: "CAPITAL", description: "dup id", amount: "10", settle: "1002" }),
      row({ txn_id: "T903", date: "2025-05-03", type: "NOT_A_TYPE", description: "Bad type", amount: "10", settle: "1002" }),
    ].join("\n");
    const r = analyzeUpload(bad, accounts);
    expect(r.kind).toBe("errors");
    if (r.kind !== "errors") return;
    expect(r.problems.map((p) => p.row)).toEqual([3, 4, 5, 6, 7]);
    const msgs = r.problems.map((p) => p.message).join("\n");
    expect(msgs).toMatch(/unknown account code "9999"/);
    expect(msgs).toMatch(/Insufficient stock|No stock/);
    expect(msgs).toMatch(/Invalid date/);
    expect(msgs).toMatch(/Duplicate transaction ID/);
    expect(msgs).toMatch(/Unknown transaction type/);
  });

  it("handles any line-ending style, including mixed endings, without merging rows", () => {
    const rows = [
      row({ txn_id: "A", date: "2025-05-01", type: "CAPITAL", description: "one", amount: "100", settle: "1002" }),
      row({ txn_id: "B", date: "2025-05-02", type: "CAPITAL", description: "two", amount: "200", settle: "1002" }),
      row({ txn_id: "C", date: "2025-05-03", type: "CAPITAL", description: "three", amount: "300", settle: "1002" }),
    ];
    for (const text of [`${COLS.join(",")}\n${rows.join("\n")}`, `${COLS.join(",")}\r\n${rows.join("\r\n")}\r\n`, `${COLS.join(",")}\r${rows.join("\r")}`, `${COLS.join(",")}\r\n${rows[0]}\n${rows[1]}\r${rows[2]}`]) {
      const r = analyzeUpload(text, accounts);
      expect(r.kind, JSON.stringify(text)).toBe("ok");
      if (r.kind === "ok") expect(r.books.sources.map((s) => s.txnId)).toEqual(["A", "B", "C"]);
    }
  });

  it("reports rows with the wrong number of fields (never guesses) and keeps true spreadsheet row numbers across blank lines", () => {
    const text = [
      COLS.join(","),
      row({ txn_id: "A", date: "2025-05-01", type: "CAPITAL", description: "ok", amount: "100", settle: "1002" }),
      "",
      "B,2025-05-02,CAPITAL,too few fields",
      row({ txn_id: "C", date: "2025-05-03", type: "CAPITAL", description: "ok", amount: "100", settle: "1002" }) + ",extra,extra",
      row({ txn_id: "D", date: "2025-05-04", type: "EXPENSE", description: "bad account", amount: "5", account: "9999", settle: "1002", gst_rate: "0", gst_treatment: "NON_TAXABLE" }),
    ].join("\n");
    const r = analyzeUpload(text, accounts);
    expect(r.kind).toBe("errors");
    if (r.kind !== "errors") return;
    expect(r.problems.map((p) => [p.row, p.txnId])).toEqual([[4, ""], [5, ""], [6, "D"]]);
    expect(r.problems[0].message).toMatch(/fewer fields/);
    expect(r.problems[1].message).toMatch(/more fields/);
  });

  it("derives the financial year(s) from the dates and honours a requested period", () => {
    expect(financialYearOf("2025-04-01")).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    expect(financialYearOf("2026-03-31")).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    const csv = "txn_id,date,type,description,amount,settle\nA,2024-06-01,CAPITAL,x,1000,1002\nB,2025-06-01,CAPITAL,y,500,1002\n";
    const r = analyzeUpload(csv, accounts);
    expect(r.kind === "ok" && r.period).toEqual({ start: "2024-04-01", end: "2026-03-31" });
    const early = analyzeUpload(csv, accounts, { start: "2024-04-01", end: "2024-12-31" });
    expect(early.kind === "ok" && early.rep.financials.balanceSheet.totalAssets.toNumber()).toBe(1000);
  });

  it("serves a blank template that is itself a valid, balancing file", async () => {
    const res = await templateGet(new Request("http://x/api/template?kind=blank"));
    const text = await res.text();
    const r = analyzeUpload(text, accounts);
    expect(r.kind, JSON.stringify(r)).toBe("ok");
    if (r.kind === "ok") {
      expect(r.books.sources.length).toBe(5);
      expect(r.rep.financials.balanceSheet.balanced).toBe(true);
    }
    expect((await (await templateGet(new Request("http://x/api/template?kind=sample"))).text()).split("\n").length).toBeGreaterThan(100);
  });

  it("builds an Excel file for a valid upload and rejects bad ones without storing anything", async () => {
    const post = (body: unknown) => excelPost(new Request("http://x/api/analyze/excel", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
    const ok = await post({ csv: sampleText });
    expect(ok.status).toBe(200);
    const bytes = new Uint8Array(await ok.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK"); // xlsx is a zip
    expect((await post({ csv: "txn_id,date,type,description,amount,settle\nA,2025-05-01,EXPENSE,x,10,1002" })).status).toBe(422);
    expect((await post({ csv: "" })).status).toBe(400);
    expect((await post("{not json")).status).toBe(400);
  });
});
