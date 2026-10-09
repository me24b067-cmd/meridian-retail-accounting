import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { Account, AccountType, NormalBalance, SourceTransaction } from "@/types/accounting";

export const DATA_DIR = path.join(process.cwd(), "data");

const SOURCE_FIELDS: Record<string, keyof SourceTransaction> = {
  txn_id: "txnId", date: "date", type: "type", description: "description", party: "party", reference: "reference",
  category: "category", item: "item", quantity: "quantity", unit_amount: "unitAmount", amount: "amount", gst_rate: "gstRate",
  gst_treatment: "gstTreatment", account: "account", settle: "settle", to_account: "toAccount", interest_amount: "interestAmount",
  deduction_amount: "deductionAmount", useful_life_years: "usefulLifeYears", residual_value: "residualValue",
};

export function emptySource(): SourceTransaction {
  const out = {} as Record<string, string>;
  for (const k of Object.values(SOURCE_FIELDS)) out[k] = "";
  return out as unknown as SourceTransaction;
}

export function parseTransactionsCsv(text: string): SourceTransaction[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`Could not parse transactions CSV: ${parsed.errors[0].message} (row ${parsed.errors[0].row})`);
  const missing = Object.keys(SOURCE_FIELDS).filter((h) => !(parsed.meta.fields ?? []).includes(h));
  if (missing.length) throw new Error(`Transactions CSV is missing columns: ${missing.join(", ")}`);
  return parsed.data.map((row) => {
    const tx = emptySource() as unknown as Record<string, string>;
    for (const [header, field] of Object.entries(SOURCE_FIELDS)) tx[field] = (row[header] ?? "").trim();
    return tx as unknown as SourceTransaction;
  });
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

export function loadSampleTransactions(): SourceTransaction[] {
  return parseTransactionsCsv(fs.readFileSync(path.join(DATA_DIR, "sample_transactions.csv"), "utf8"));
}

export function loadBaseChart(): Account[] {
  return parseChartCsv(fs.readFileSync(path.join(DATA_DIR, "chart_of_accounts.csv"), "utf8"));
}
