import fs from "node:fs";
import path from "node:path";
import { parseChartCsv, parseTransactionsCsv } from "@/lib/csvParse";
import type { Account, SourceTransaction } from "@/types/accounting";

export { emptySource, parseChartCsv, parseTransactionsCsv, sourcesToCsv, SOURCE_FIELDS } from "@/lib/csvParse";

export const DATA_DIR = path.join(process.cwd(), "data");

export function loadSampleTransactions(): SourceTransaction[] {
  return parseTransactionsCsv(fs.readFileSync(path.join(DATA_DIR, "sample_transactions.csv"), "utf8"));
}

export function loadBaseChart(): Account[] {
  return parseChartCsv(fs.readFileSync(path.join(DATA_DIR, "chart_of_accounts.csv"), "utf8"));
}
