import { AccountingError, type Account, type JournalEntry, type JournalLine } from "@/types/accounting";
import { D, ZERO, money, sum, type Dec } from "./money";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const f = fromIso.split("-").map(Number);
  const t = toIso.split("-").map(Number);
  return Math.round((Date.UTC(t[0], t[1] - 1, t[2]) - Date.UTC(f[0], f[1] - 1, f[2])) / 86_400_000);
}

export function debit(accountCode: string, amount: Dec | string | number, party?: string, memo?: string): JournalLine {
  return { accountCode, debit: money(amount), credit: ZERO, party, memo };
}

export function credit(accountCode: string, amount: Dec | string | number, party?: string, memo?: string): JournalLine {
  return { accountCode, debit: ZERO, credit: money(amount), party, memo };
}

export function totals(lines: JournalLine[]): { debit: Dec; credit: Dec } {
  return { debit: sum(lines.map((l) => l.debit)), credit: sum(lines.map((l) => l.credit)) };
}

/**
 * Core rule of double-entry bookkeeping: an entry may only be posted if total debits equal total credits.
 * Also checks that every line references a real account and carries exactly one positive side.
 * Throws AccountingError with a message that names the entry.
 */
export function validateJournalEntry(entry: JournalEntry, chart: Map<string, Account>): void {
  const label = entry.txnId || entry.id;
  if (!entry.id) throw new AccountingError("Journal entry has no ID", label);
  if (!isValidDate(entry.date)) throw new AccountingError(`Invalid date "${entry.date}" (expected YYYY-MM-DD)`, label);
  if (!entry.description.trim()) throw new AccountingError("Description is required", label);
  if (entry.lines.length < 2) throw new AccountingError("A journal entry needs at least two lines", label);
  for (const line of entry.lines) {
    if (!chart.has(line.accountCode)) throw new AccountingError(`Unknown account code "${line.accountCode}"`, label);
    const d = new D(line.debit);
    const c = new D(line.credit);
    if (d.isNegative() || c.isNegative()) throw new AccountingError("Debit and credit amounts cannot be negative", label);
    if (d.gt(0) === c.gt(0)) {
      throw new AccountingError(`Line for account ${line.accountCode} must have exactly one of debit or credit above zero`, label);
    }
    if (!d.eq(money(d)) || !c.eq(money(c))) throw new AccountingError("Amounts must have at most 2 decimal places", label);
  }
  const t = totals(entry.lines);
  if (!t.debit.eq(t.credit)) {
    throw new AccountingError(
      `Unbalanced entry: total debits ${t.debit.toFixed(2)} != total credits ${t.credit.toFixed(2)} (difference ${t.debit.minus(t.credit).toFixed(2)})`,
      label,
    );
  }
}
