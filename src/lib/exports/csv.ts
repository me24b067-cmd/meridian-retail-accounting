import Papa from "papaparse";
import type { Books } from "@/lib/books";
import { buildReports } from "@/lib/books";
import { sourcesToCsv } from "@/lib/database/csv";
import type { Period, StatementRow } from "@/lib/accounting/reports";

type Reports = ReturnType<typeof buildReports>;
const num = (d?: { toFixed(n: number): string }) => (d ? d.toFixed(2) : "");
const csv = (fields: string[], data: (string | number)[][]) => Papa.unparse({ fields, data }, { newline: "\n" });

export const CSV_FILES = [
  "source_transactions", "journal_entries", "chart_of_accounts", "trial_balance", "profit_and_loss", "balance_sheet", "validation_results",
] as const;
export type CsvFile = (typeof CSV_FILES)[number];

function statementCsv(rows: StatementRow[]): string {
  return csv(["line_type", "account_code", "description", "amount_inr"], rows.map((r) => [r.kind, r.code ?? "", r.label, num(r.amount)]));
}

export function journalCsv(books: Books): string {
  const name = new Map(books.accounts.map((a) => [a.code, a.name]));
  const data: (string | number)[][] = [];
  for (const e of books.posted.entries) {
    e.lines.forEach((l, i) => data.push([
      e.id, e.txnId, e.date, e.reference, e.description, e.category, i + 1, l.accountCode, name.get(l.accountCode) ?? "",
      num(l.debit), num(l.credit), l.party ?? "", e.gstRate ?? "", e.gstTreatment ?? "",
    ]));
  }
  return csv(["journal_id", "txn_id", "date", "reference", "description", "category", "line_no", "account_code", "account_name", "debit", "credit", "party", "gst_rate", "gst_treatment"], data);
}

export function csvFor(file: CsvFile, books: Books, rep: Reports): string {
  switch (file) {
    case "source_transactions": return sourcesToCsv(books.sources);
    case "journal_entries": return journalCsv(books);
    case "chart_of_accounts":
      return csv(["code", "name", "type", "normal_balance", "group", "is_contra", "description"],
        books.accounts.map((a) => [a.code, a.name, a.type, a.normalBalance, a.group, String(a.isContra), a.description]));
    case "trial_balance": {
      const tb = rep.financials.trialBalance;
      return csv(["account_code", "account_name", "debit", "credit"], [
        ...tb.rows.map((r) => [r.code, r.name, num(r.debit), num(r.credit)]),
        ["", "TOTAL", num(tb.totalDebit), num(tb.totalCredit)], ["", "DIFFERENCE (debits - credits)", num(tb.difference), ""],
      ]);
    }
    case "profit_and_loss": return statementCsv(rep.financials.profitAndLoss.rows);
    case "balance_sheet": {
      const bs = rep.financials.balanceSheet;
      return statementCsv([...bs.rows, { label: "BALANCE SHEET DIFFERENCE (Assets - Liabilities - Equity)", amount: bs.difference, kind: "memo" }]);
    }
    case "validation_results":
      return csv(["check_id", "check", "expected", "actual", "difference", "result", "detail"],
        rep.checks.map((c) => [c.id, c.name, num(c.expected), num(c.actual), num(c.difference), c.passed ? "PASS" : "FAIL", c.detail]));
  }
}

export function periodLabel(p: Period) { return `${p.start} to ${p.end}`; }
