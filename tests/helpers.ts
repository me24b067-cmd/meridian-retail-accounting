import { postTransactions } from "@/lib/accounting/engine";
import { buildFinancials, DEFAULT_PERIOD } from "@/lib/accounting/reports";
import { emptySource, loadBaseChart, loadSampleTransactions } from "@/lib/database/csv";
import type { SourceTransaction } from "@/types/accounting";

export const chart = loadBaseChart();
export const sample = () => loadSampleTransactions();
let counter = 0;

/** Build a source transaction with defaults; override whatever the test cares about. */
export function tx(over: Partial<SourceTransaction>): SourceTransaction {
  counter++;
  return { ...emptySource(), txnId: `X${String(counter).padStart(3, "0")}`, date: "2025-04-01", description: "test", ...over };
}

export const post = (txs: SourceTransaction[]) => postTransactions(txs, chart);
export const fin = (txs: SourceTransaction[], period = DEFAULT_PERIOD) => buildFinancials(post(txs).entries, chart, period);
export const capital = (amount = 1_000_000, bank = "1002") => tx({ type: "CAPITAL", amount: String(amount), settle: bank, date: "2025-04-01" });

export function balanceOf(txs: SourceTransaction[], code: string): number {
  const row = fin(txs).trialBalance.rows.find((r) => r.code === code);
  return row ? row.debit.minus(row.credit).toNumber() : 0;
}
