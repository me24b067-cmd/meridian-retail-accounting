import type { Account, JournalEntry } from "@/types/accounting";
import { ZERO, sum, type Dec } from "./money";

export interface LedgerRow {
  date: string;
  entryId: string;
  txnId: string;
  description: string;
  party?: string;
  debit: Dec;
  credit: Dec;
  /** Running balance in the account's normal direction (contra accounts run in credit direction). */
  balance: Dec;
}

export interface LedgerAccount {
  account: Account;
  opening: Dec;
  rows: LedgerRow[];
  totalDebit: Dec;
  totalCredit: Dec;
  closing: Dec;
}

/** Positive = balance in the account's normal direction. */
export function naturalBalance(account: Account, debits: Dec, credits: Dec): Dec {
  return account.normalBalance === "debit" ? debits.minus(credits) : credits.minus(debits);
}

/**
 * Pipeline step 3: Journal entries -> general ledger.
 * `from` (optional) turns earlier postings into an opening balance; `to` (optional) is the cut-off date.
 */
export function buildLedger(entries: JournalEntry[], accounts: Account[], opts: { from?: string; to?: string } = {}): LedgerAccount[] {
  const byCode = new Map<string, LedgerAccount>();
  for (const account of accounts) {
    byCode.set(account.code, { account, opening: ZERO, rows: [], totalDebit: ZERO, totalCredit: ZERO, closing: ZERO });
  }
  const openingDr = new Map<string, Dec>();
  const openingCr = new Map<string, Dec>();
  const sorted = [...entries].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
  for (const e of sorted) {
    if (opts.to && e.date > opts.to) continue;
    for (const line of e.lines) {
      const la = byCode.get(line.accountCode);
      if (!la) continue;
      if (opts.from && e.date < opts.from) {
        openingDr.set(line.accountCode, (openingDr.get(line.accountCode) ?? ZERO).plus(line.debit));
        openingCr.set(line.accountCode, (openingCr.get(line.accountCode) ?? ZERO).plus(line.credit));
        continue;
      }
      la.rows.push({
        date: e.date, entryId: e.id, txnId: e.txnId, description: e.description, party: line.party,
        debit: line.debit, credit: line.credit, balance: ZERO,
      });
    }
  }
  for (const la of byCode.values()) {
    la.opening = naturalBalance(la.account, openingDr.get(la.account.code) ?? ZERO, openingCr.get(la.account.code) ?? ZERO);
    let running = la.opening;
    for (const r of la.rows) {
      running = running.plus(naturalBalance(la.account, r.debit, r.credit));
      r.balance = running;
    }
    la.totalDebit = sum(la.rows.map((r) => r.debit));
    la.totalCredit = sum(la.rows.map((r) => r.credit));
    la.closing = running;
  }
  return [...byCode.values()].sort((a, b) => a.account.code.localeCompare(b.account.code));
}
