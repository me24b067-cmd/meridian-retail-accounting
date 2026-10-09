import ExcelJS from "exceljs";
import type { Books } from "@/lib/books";
import { buildReports } from "@/lib/books";
import type { StatementRow } from "@/lib/accounting/reports";

type Reports = ReturnType<typeof buildReports>;
const MONEY = '#,##0.00;[Red](#,##0.00);0.00';
const DATE = "dd-mmm-yyyy";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3A5F" } };
const n = (d: { toNumber(): number } | undefined) => (d ? d.toNumber() : null);
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);

export const WORKBOOK_NAME = "Meridian_Retail_Accounting_Submission.xlsx";

function title(ws: ExcelJS.Worksheet, text: string, period: string, cols: number) {
  ws.addRow([text]).font = { bold: true, size: 14, color: { argb: "FF1F3A5F" } };
  ws.addRow([`Meridian Retail Traders | Period: ${period} | Currency: INR (₹) | Educational demo data`]).font = { italic: true, color: { argb: "FF555555" } };
  ws.addRow([]);
  ws.mergeCells(1, 1, 1, Math.max(cols, 2));
}

function header(ws: ExcelJS.Worksheet, labels: string[]): number {
  const row = ws.addRow(labels);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: row.number }]; // freeze everything above and including the header
  return row.number;
}

function widths(ws: ExcelJS.Worksheet, w: number[]) { w.forEach((x, i) => (ws.getColumn(i + 1).width = x)); }
function fmt(ws: ExcelJS.Worksheet, cols: number[], numFmt: string) { cols.forEach((c) => (ws.getColumn(c).numFmt = numFmt)); }
function boldRow(r: ExcelJS.Row) { r.font = { bold: true }; r.border = { top: { style: "thin" } }; }

function statementSheet(ws: ExcelJS.Worksheet, heading: string, period: string, rows: StatementRow[]) {
  title(ws, heading, period, 3);
  header(ws, ["Account code", "Particulars", "Amount (₹)"]);
  const rowOf = new Map<string, number>();
  for (const r of rows) {
    const x = ws.addRow([r.code ?? "", r.label, r.amount ? r.amount.toNumber() : null]);
    rowOf.set(r.label, x.number);
    if (r.kind === "heading") { x.font = { bold: true, color: { argb: "FF1F3A5F" } }; }
    if (r.kind === "subtotal") boldRow(x);
    if (r.kind === "total") { boldRow(x); x.border = { top: { style: "thin" }, bottom: { style: "double" } }; }
  }
  widths(ws, [14, 70, 20]); fmt(ws, [3], MONEY);
  return rowOf;
}

/** Writes the verified, engine-generated values into a submission workbook (formulas used for column totals and difference checks). */
export async function buildWorkbook(books: Books, rep: Reports): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Meridian Retail Accounting";
  wb.created = new Date();
  const period = `${rep.period.start} to ${rep.period.end}`;
  const fin = rep.financials;
  const acctName = new Map(books.accounts.map((a) => [a.code, a.name]));

  // 1. Read Me
  const readme = wb.addWorksheet("Read Me");
  title(readme, "Meridian Retail Traders - Accounting Submission", period, 2);
  const bs = fin.balanceSheet;
  const info: [string, string | number][] = [
    ["Business", "Meridian Retail Traders (fictional retail trading business)"],
    ["Reporting period", period], ["Base currency", "INR (₹)"],
    ["Source transactions", books.sources.length], ["Journal entries", books.posted.entries.length],
    ["Balance Sheet difference (Assets - Liabilities - Equity)", bs.difference.toFixed(2)],
    ["Net profit / (loss)", fin.profitAndLoss.netProfit.toFixed(2)],
    ["Validation", rep.checks.every((c) => c.passed) ? `All ${rep.checks.length} checks passed` : "SOME CHECKS FAILED - see Validation Results"],
    ["Pipeline", "Source Transactions -> Journal Entries -> General Ledger -> Trial Balance -> Profit and Loss + Balance Sheet"],
    ["Values", "Report values were produced by the accounting engine and written here; totals and difference columns are Excel formulas (cached results included, so no recalculation is needed)."],
    ["Disclaimer", "All data is fictional. GST rates and treatments are illustrative educational examples, not tax advice."],
  ];
  info.forEach(([k, v]) => { const r = readme.addRow([k, v]); r.getCell(1).font = { bold: true }; r.getCell(2).alignment = { wrapText: true, vertical: "top" }; });
  widths(readme, [48, 100]);

  // 2. Chart of accounts
  const coa = wb.addWorksheet("Chart of Accounts");
  title(coa, "Chart of Accounts", period, 6);
  header(coa, ["Code", "Account name", "Type", "Normal balance", "Group", "Contra?"]);
  books.accounts.forEach((a) => coa.addRow([a.code, a.name, a.type, a.normalBalance, a.group, a.isContra ? "Yes" : ""]));
  widths(coa, [10, 42, 12, 16, 26, 10]);

  // 3. Source transactions
  const src = wb.addWorksheet("Source Transactions");
  title(src, "Source Transactions (business events as entered)", period, 12);
  header(src, ["Txn ID", "Date", "Type", "Description", "Party", "Reference", "Category", "Item", "Qty", "Unit amount", "Amount", "GST %", "GST treatment", "Account", "Settle via", "To account", "Interest", "Deduction"]);
  for (const t of books.sources) {
    const num = (v: string) => (v === "" ? null : Number(v));
    src.addRow([t.txnId, toDate(t.date), t.type, t.description, t.party, t.reference, t.category, t.item, num(t.quantity), num(t.unitAmount), num(t.amount), num(t.gstRate), t.gstTreatment, t.account, t.settle, t.toAccount, num(t.interestAmount), num(t.deductionAmount)]);
  }
  src.addRow(["Count", { formula: `COUNTA(A5:A${4 + books.sources.length})`, result: books.sources.length }]).font = { bold: true };
  widths(src, [9, 13, 18, 60, 22, 11, 20, 8, 8, 12, 14, 7, 14, 9, 10, 10, 12, 12]); fmt(src, [2], DATE); fmt(src, [9, 10, 11, 17, 18], MONEY);

  // 4. Journal entries
  const je = wb.addWorksheet("Journal Entries");
  title(je, "Journal Entries (double-entry lines)", period, 10);
  header(je, ["Journal ID", "Txn ID", "Date", "Reference", "Description", "Category", "Account", "Account name", "Debit (₹)", "Credit (₹)", "Party", "GST %"]);
  let jr = 0;
  for (const e of books.posted.entries) for (const l of e.lines) {
    je.addRow([e.id, e.txnId, toDate(e.date), e.reference, e.description, e.category, l.accountCode, acctName.get(l.accountCode), n(l.debit) || null, n(l.credit) || null, l.party ?? "", e.gstRate ? Number(e.gstRate) : null]); jr++;
  }
  const jt = je.addRow(["", "", "", "", "", "", "", "TOTAL",
    { formula: `SUM(I5:I${4 + jr})`, result: fin.totalJournalDebit.toNumber() }, { formula: `SUM(J5:J${4 + jr})`, result: fin.totalJournalCredit.toNumber() }]);
  boldRow(jt);
  const jd = je.addRow(["", "", "", "", "", "", "", "DIFFERENCE", { formula: `I${5 + jr}-J${5 + jr}`, result: fin.totalJournalDebit.minus(fin.totalJournalCredit).toNumber() }]);
  jd.font = { bold: true };
  widths(je, [12, 9, 13, 11, 55, 20, 9, 36, 16, 16, 22, 7]); fmt(je, [3], DATE); fmt(je, [9, 10], MONEY);

  // 5. General ledger
  const gl = wb.addWorksheet("General Ledger");
  title(gl, "General Ledger", period, 8);
  header(gl, ["Account", "Account name", "Date", "Journal ID", "Description", "Debit (₹)", "Credit (₹)", "Running balance (₹)"]);
  for (const la of rep.ledger) {
    if (!la.rows.length && la.opening.isZero()) continue;
    const head = gl.addRow([la.account.code, la.account.name, null, "", `Opening balance (${la.account.normalBalance}-side positive)`, null, null, la.opening.toNumber()]);
    head.font = { bold: true };
    for (const r of la.rows) gl.addRow([la.account.code, la.account.name, toDate(r.date), r.entryId, r.description, n(r.debit) || null, n(r.credit) || null, r.balance.toNumber()]);
    const tot = gl.addRow(["", `Closing balance - ${la.account.name}`, null, "", "", la.totalDebit.toNumber(), la.totalCredit.toNumber(), la.closing.toNumber()]);
    boldRow(tot); gl.addRow([]);
  }
  widths(gl, [9, 38, 13, 12, 60, 16, 16, 20]); fmt(gl, [3], DATE); fmt(gl, [6, 7, 8], MONEY);

  // 6. Trial balance
  const tb = wb.addWorksheet("Trial Balance");
  title(tb, `Trial Balance as at ${rep.period.end}`, period, 4);
  header(tb, ["Account code", "Account name", "Debit (₹)", "Credit (₹)"]);
  fin.trialBalance.rows.forEach((r) => tb.addRow([r.code, r.name, r.debit.toNumber() || null, r.credit.toNumber() || null]));
  const last = 4 + fin.trialBalance.rows.length;
  boldRow(tb.addRow(["", "TOTAL", { formula: `SUM(C5:C${last})`, result: fin.trialBalance.totalDebit.toNumber() }, { formula: `SUM(D5:D${last})`, result: fin.trialBalance.totalCredit.toNumber() }]));
  tb.addRow(["", "DIFFERENCE (debits - credits)", { formula: `C${last + 1}-D${last + 1}`, result: fin.trialBalance.difference.toNumber() }]).font = { bold: true };
  widths(tb, [14, 56, 20, 20]); fmt(tb, [3, 4], MONEY);

  // 7-8. Statements
  statementSheet(wb.addWorksheet("Profit and Loss"), `Profit and Loss Statement for ${period}`, period, fin.profitAndLoss.rows);
  const bsRows = statementSheet(wb.addWorksheet("Balance Sheet"), `Balance Sheet as at ${rep.period.end}`, period, bs.rows);
  const bsWs = wb.getWorksheet("Balance Sheet")!;
  bsWs.addRow([]);
  const a = bsRows.get("TOTAL ASSETS")!, l = bsRows.get("TOTAL LIABILITIES")!, e = bsRows.get("TOTAL EQUITY")!;
  const diffRow = bsWs.addRow(["", "BALANCE SHEET DIFFERENCE (Assets - Liabilities - Equity)", { formula: `C${a}-C${l}-C${e}`, result: bs.difference.toNumber() }]);
  diffRow.font = { bold: true, color: { argb: bs.balanced ? "FF1B7F3B" : "FFC0392B" } };
  bsWs.addRow(["", "Status", bs.balanced ? "PASS - balanced" : "FAIL - not balanced"]).font = { bold: true };

  // 9. Inventory
  const inv = wb.addWorksheet("Inventory");
  title(inv, "Inventory (perpetual weighted-average cost)", period, 8);
  header(inv, ["Txn ID", "Date", "Item", "Movement", "Quantity", "Unit cost (₹)", "Value (₹)", "Balance qty", "Balance value (₹)"]);
  rep.inventory.movements.forEach((m) => inv.addRow([m.txnId, toDate(m.date), m.item, m.kind, m.quantity.toNumber(), m.unitCost.toNumber(), m.value.toNumber(), m.balanceQty.toNumber(), m.balanceValue.toNumber()]));
  inv.addRow([]);
  boldRow(inv.addRow(["Closing stock by item"]));
  rep.inventory.items.forEach((i) => inv.addRow(["", "", i.item, "CLOSING", i.quantity.toNumber(), i.averageCost.toNumber(), i.value.toNumber()]));
  inv.addRow(["", "", "Total inventory value", "", "", "", rep.inventory.totalValue.toNumber()]).font = { bold: true };
  widths(inv, [9, 13, 20, 11, 11, 14, 16, 13, 18]); fmt(inv, [2], DATE); fmt(inv, [6, 7, 9], MONEY);

  // 10. Fixed assets
  const fa = wb.addWorksheet("Fixed Assets and Depreciation");
  title(fa, "Fixed Assets and Depreciation (straight-line, daily pro-rata)", period, 9);
  header(fa, ["Asset ID", "Asset", "Purchase date", "Cost (₹)", "Residual (₹)", "Life (yrs)", "Accumulated depn (₹)", "Net book value (₹)", "Annual charge (₹)"]);
  rep.fixedAssets.rows.forEach((r) => fa.addRow([r.assetId, r.name, toDate(r.purchaseDate), r.cost.toNumber(), r.residual.toNumber(), r.lifeYears.toNumber(), r.accumulated.toNumber(), r.netBookValue.toNumber(), r.annualCharge.toNumber()]));
  const fl = 4 + rep.fixedAssets.rows.length;
  boldRow(fa.addRow(["", "TOTAL", null, { formula: `SUM(D5:D${fl})`, result: rep.fixedAssets.totalCost.toNumber() }, null, null, { formula: `SUM(G5:G${fl})`, result: rep.fixedAssets.totalAccumulated.toNumber() }, { formula: `SUM(H5:H${fl})`, result: rep.fixedAssets.totalNetBookValue.toNumber() }]));
  fa.addRow([]);
  boldRow(fa.addRow(["Depreciation postings", "Asset", "Posted on", "Days", "Amount (₹)"]));
  rep.fixedAssets.schedule.forEach((d) => fa.addRow([d.txnId, books.posted.assets.find((x) => x.assetId === d.assetId)?.name, toDate(d.toDate), d.days, d.amount.toNumber()]));
  widths(fa, [22, 24, 14, 16, 16, 10, 22, 20, 18]); fmt(fa, [3], DATE); fmt(fa, [4, 5, 7, 8, 9], MONEY);

  // 11. GST
  const gs = wb.addWorksheet("GST Summary");
  title(gs, "GST Summary (simplified: single combined rate)", period, 8);
  header(gs, ["Date", "Txn ID", "Description", "GST %", "Treatment", "Input GST (₹)", "Output GST (₹)", "Output set off/settled (₹)"]);
  rep.gst.rows.forEach((r) => gs.addRow([toDate(r.date), r.txnId, r.description, r.rate ? Number(r.rate) : null, r.treatment, r.inputGst.toNumber() || null, r.outputGst.toNumber() || null, r.settled.toNumber() || null]));
  const gl2 = 4 + rep.gst.rows.length;
  boldRow(gs.addRow(["", "", "TOTAL", "", "", { formula: `SUM(F5:F${gl2})`, result: rep.gst.inputRecorded.toNumber() }, { formula: `SUM(G5:G${gl2})`, result: rep.gst.outputCollected.toNumber() }, { formula: `SUM(H5:H${gl2})`, result: rep.gst.rows.reduce((s, r) => s + r.settled.toNumber(), 0) }]));
  gs.addRow(["", "", "Closing Input GST Credit (asset)", "", "", rep.gst.inputClosing.toNumber()]);
  gs.addRow(["", "", "Closing Output GST Payable (liability)", "", "", rep.gst.outputClosing.toNumber()]);
  widths(gs, [13, 9, 66, 8, 14, 16, 16, 24]); fmt(gs, [1], DATE); fmt(gs, [6, 7, 8], MONEY);

  // 12. Validation
  const va = wb.addWorksheet("Validation Results");
  title(va, "Accounting Validation Results", period, 7);
  header(va, ["Check", "Description", "Expected (₹)", "Actual (₹)", "Difference (₹)", "Result", "Detail"]);
  rep.checks.forEach((c, i) => {
    const r = 5 + i;
    va.addRow([c.id, c.name, c.expected.toNumber(), c.actual.toNumber(), { formula: `D${r}-C${r}`, result: c.difference.toNumber() }, c.passed ? "PASS" : "FAIL", c.detail]);
  });
  widths(va, [8, 78, 18, 18, 16, 9, 60]); fmt(va, [3, 4, 5], MONEY);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
