import Papa from "papaparse";
import type { Account, AccountType, NormalBalance, SourceTransaction } from "@/types/accounting";

/** CSV header -> SourceTransaction field. Browser-safe (no filesystem access). */
export const SOURCE_FIELDS: Record<string, keyof SourceTransaction> = {
  txn_id: "txnId", date: "date", type: "type", description: "description", party: "party", reference: "reference",
  category: "category", item: "item", quantity: "quantity", unit_amount: "unitAmount", amount: "amount", gst_rate: "gstRate",
  gst_treatment: "gstTreatment", account: "account", settle: "settle", to_account: "toAccount", interest_amount: "interestAmount",
  deduction_amount: "deductionAmount", useful_life_years: "usefulLifeYears", residual_value: "residualValue",
};

/** Only these columns must be present; every other column is optional and defaults to blank. */
export const REQUIRED_COLUMNS = ["txn_id", "date", "type", "description"];

export function emptySource(): SourceTransaction {
  const out = {} as Record<string, string>;
  for (const k of Object.values(SOURCE_FIELDS)) out[k] = "";
  return out as unknown as SourceTransaction;
}

export interface RowShapeProblem { row: number; message: string }

/**
 * Parses a transactions CSV, tolerant of a BOM, any mix of line endings (\r\n, \n, \r), header case/spacing, extra
 * columns and blank lines. Rows whose field count does not match the header are NOT guessed at: they are returned in
 * `shapeProblems` (spreadsheet row numbers, header = row 1) so the caller can report them.
 * Throws an Error with a readable message for unreadable files / missing required columns.
 */
export function parseTransactionsCsvDetailed(text: string): { sources: SourceTransaction[]; rowNumbers: number[]; shapeProblems: RowShapeProblem[] } {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true, skipEmptyLines: false, newline: "\n", transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
  });
  const fatal = parsed.errors.find((e) => e.type !== "FieldMismatch" && e.code !== "UndetectableDelimiter");
  if (fatal) throw new Error(`Could not read the CSV: ${fatal.message}${fatal.row !== undefined ? ` (data row ${fatal.row + 2})` : ""}`);
  const fields = parsed.meta.fields ?? [];
  const missing = REQUIRED_COLUMNS.filter((h) => !fields.includes(h));
  if (missing.length) throw new Error(`The CSV is missing required column(s): ${missing.join(", ")}. Expected header: ${Object.keys(SOURCE_FIELDS).join(",")}`);

  const isBlank = (r: Record<string, string>) => Object.values(r).every((v) => (Array.isArray(v) ? v.every((x) => !x) : !String(v ?? "").trim()));
  const mismatch = new Map<number, string>();
  for (const e of parsed.errors) if (e.type === "FieldMismatch" && e.row !== undefined) mismatch.set(e.row, e.code === "TooManyFields" ? "has more fields than the header" : "has fewer fields than the header");

  const sources: SourceTransaction[] = [];
  const rowNumbers: number[] = [];
  const shapeProblems: RowShapeProblem[] = [];
  parsed.data.forEach((row, i) => {
    if (isBlank(row)) return;
    const rowNo = i + 2;
    const shape = mismatch.get(i);
    if (shape) {
      shapeProblems.push({ row: rowNo, message: `Row ${shape} (${fields.length} columns expected) - check for a missing/extra comma, or put text containing commas in quotes.` });
      return;
    }
    const tx = emptySource() as unknown as Record<string, string>;
    for (const [header, field] of Object.entries(SOURCE_FIELDS)) tx[field] = String(row[header] ?? "").trim();
    sources.push(tx as unknown as SourceTransaction);
    rowNumbers.push(rowNo);
  });
  if (!sources.length && !shapeProblems.length) throw new Error("The CSV has a header but no transaction rows.");
  return { sources, rowNumbers, shapeProblems };
}

/** Convenience wrapper used by the loaders: throws on the first malformed row. */
export function parseTransactionsCsv(text: string): SourceTransaction[] {
  const { sources, shapeProblems } = parseTransactionsCsvDetailed(text);
  if (shapeProblems.length) throw new Error(`Row ${shapeProblems[0].row}: ${shapeProblems[0].message}`);
  return sources;
}

export function parseChartCsv(text: string): Account[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return parsed.data.map((r) => ({
    code: r.code.trim(), name: r.name.trim(), type: r.type.trim() as AccountType, normalBalance: r.normal_balance.trim() as NormalBalance,
    group: r.group.trim(), isContra: r.is_contra.trim() === "true", description: (r.description ?? "").trim(),
  }));
}

export function sourcesToCsv(rows: SourceTransaction[]): string {
  const headers = Object.keys(SOURCE_FIELDS);
  return Papa.unparse({ fields: headers, data: rows.map((r) => headers.map((h) => (r as unknown as Record<string, string>)[SOURCE_FIELDS[h]])) });
}
