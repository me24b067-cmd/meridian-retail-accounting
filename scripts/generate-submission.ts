/* Regenerates the submission/ folder (workbook, CSVs, statements) from the demo dataset using the normal accounting pipeline. */
import fs from "node:fs";
import path from "node:path";
import { postTransactions } from "../src/lib/accounting/engine";
import { buildReports, resolvePeriod, type Books } from "../src/lib/books";
import { loadBaseChart, loadSampleTransactions } from "../src/lib/database/csv";
import { CSV_FILES, csvFor } from "../src/lib/exports/csv";
import { WORKBOOK_NAME, buildWorkbook } from "../src/lib/exports/excel";
import { statementsMarkdown } from "../src/lib/exports/markdown";

async function main() {
  const accounts = loadBaseChart();
  const sources = loadSampleTransactions();
  const posted = postTransactions(sources, accounts);
  const books: Books = { accounts, sources, posted, storeMode: "demo", storeLabel: "Bundled demo dataset" };
  const rep = buildReports(books, resolvePeriod({}));

  const out = path.join(process.cwd(), "submission");
  fs.mkdirSync(path.join(out, "csv"), { recursive: true });
  fs.writeFileSync(path.join(out, WORKBOOK_NAME), await buildWorkbook(books, rep));
  for (const f of CSV_FILES) fs.writeFileSync(path.join(out, "csv", `${f}.csv`), csvFor(f, books, rep));
  fs.writeFileSync(path.join(out, "Financial_Statements.md"), statementsMarkdown(books, rep));

  const docs = ["README.md", "ACCOUNTING_METHODOLOGY.md", "API_RESEARCH.md", "TEST_RESULTS.md", "DEPLOYMENT.md"];
  fs.mkdirSync(path.join(out, "docs"), { recursive: true });
  for (const d of docs) if (fs.existsSync(d)) fs.copyFileSync(d, path.join(out, "docs", d));
  fs.copyFileSync("data/sample_transactions.csv", path.join(out, "csv", "sample_transactions_input.csv"));

  const bs = rep.financials.balanceSheet, tb = rep.financials.trialBalance;
  console.log(JSON.stringify({
    sourceTransactions: sources.length, journalEntries: posted.entries.length, tbDebit: tb.totalDebit.toFixed(2), tbCredit: tb.totalCredit.toFixed(2),
    totalAssets: bs.totalAssets.toFixed(2), totalLiabilities: bs.totalLiabilities.toFixed(2), totalEquity: bs.totalEquity.toFixed(2),
    balanceSheetDifference: bs.difference.toFixed(2), netProfit: rep.financials.profitAndLoss.netProfit.toFixed(2),
    checksPassed: rep.checks.filter((c) => c.passed).length, checksTotal: rep.checks.length,
  }, null, 2));
  if (!rep.checks.every((c) => c.passed)) { console.error("Validation failed"); process.exit(1); }
}
main();
