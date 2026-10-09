import { postTransactionsLenient, type PostingProblem } from "@/lib/accounting/engine";
import type { Period } from "@/lib/accounting/reports";
import { isValidDate } from "@/lib/accounting/journal";
import { parseTransactionsCsvDetailed } from "@/lib/csvParse";
import { buildReports, type Books } from "@/lib/reportBundle";
import type { Account, SourceTransaction } from "@/types/accounting";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_ROWS = 5000;

export type UploadAnalysis =
  | { kind: "fatal"; message: string }
  | { kind: "errors"; rows: number; problems: PostingProblem[] }
  | { kind: "ok"; books: Books; rep: ReturnType<typeof buildReports>; period: Period; defaultPeriod: Period };

/** Indian financial year (1 Apr - 31 Mar) containing the date. */
export function financialYearOf(iso: string): Period {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return { start: `${start}-04-01`, end: `${start + 1}-03-31` };
}

/**
 * Whole upload pipeline, shared by the browser tester and the Excel API: parse -> post every row (collecting ALL
 * problems) -> build the same reports the main app builds. Pure: nothing is saved anywhere.
 */
export function analyzeUpload(text: string, accounts: Account[], requested?: Partial<Period>): UploadAnalysis {
  if (text.length > MAX_UPLOAD_BYTES) return { kind: "fatal", message: `File is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  let sources: SourceTransaction[], rowNumbers: number[], shapeProblems: { row: number; message: string }[];
  try { ({ sources, rowNumbers, shapeProblems } = parseTransactionsCsvDetailed(text)); } catch (e) { return { kind: "fatal", message: (e as Error).message }; }
  if (sources.length + shapeProblems.length > MAX_UPLOAD_ROWS) return { kind: "fatal", message: `Too many rows (${sources.length + shapeProblems.length}); the limit is ${MAX_UPLOAD_ROWS}.` };

  // Malformed rows (wrong number of fields) are reported first and never guessed at.
  const shape: PostingProblem[] = shapeProblems.map((p) => ({ txnId: "", row: p.row, message: p.message }));
  const { ledger, errors } = postTransactionsLenient(sources, accounts);
  // The engine numbers rows by position among well-formed rows; map back to the real spreadsheet row.
  const posted: PostingProblem[] = errors.map((e) => ({ ...e, row: rowNumbers[e.row - 2] ?? e.row }));
  const problems = [...shape, ...posted];
  if (problems.length) return { kind: "errors", rows: sources.length + shapeProblems.length, problems: problems.sort((a, b) => a.row - b.row) };

  const dates = sources.map((s) => s.date).sort();
  const defaultPeriod: Period = { start: financialYearOf(dates[0]).start, end: financialYearOf(dates[dates.length - 1]).end };
  const start = requested?.start && isValidDate(requested.start) ? requested.start : defaultPeriod.start;
  const end = requested?.end && isValidDate(requested.end) ? requested.end : defaultPeriod.end;
  const period = start <= end ? { start, end } : defaultPeriod;
  const books: Books = { accounts, sources, posted: ledger, storeMode: "upload", storeLabel: "Uploaded CSV (not saved)" };
  return { kind: "ok", books, rep: buildReports(books, period), period, defaultPeriod };
}
