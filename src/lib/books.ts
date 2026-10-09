import { z } from "zod";
import { postTransactions } from "@/lib/accounting/engine";
import { buildLedger } from "@/lib/accounting/ledger";
import { buildFinancials, DEFAULT_PERIOD, type Period } from "@/lib/accounting/reports";
import { fixedAssetReport, gstReport, inventoryReport } from "@/lib/accounting/subreports";
import { isValidDate } from "@/lib/accounting/journal";
import { runChecks } from "@/lib/validation/checks";
import { AccountingError, TRANSACTION_TYPES, type Account, type PostedLedger, type SourceTransaction } from "@/types/accounting";
import { loadBaseChart, loadSampleTransactions } from "@/lib/database/csv";
import { getStore } from "@/lib/database";
import { isEmptyDatabase } from "@/lib/database/postgresStore";

export interface Books {
  accounts: Account[];
  sources: SourceTransaction[];
  posted: PostedLedger;
  storeMode: string;
  storeLabel: string;
}

/** Load stored source transactions and run them through the accounting engine (the only way to get a ledger). */
export async function loadBooks(): Promise<Books> {
  const store = getStore();
  if (store.mode === "postgres" && (await isEmptyDatabase())) await resetDemo();
  const accounts = [...loadBaseChart(), ...(await store.listCustomAccounts())];
  const sources = await store.listTransactions();
  const posted = postTransactions(sources, accounts);
  return { accounts, sources, posted, storeMode: store.mode, storeLabel: store.label };
}

export function resolvePeriod(params: { from?: string; to?: string }): Period {
  const start = params.from && isValidDate(params.from) ? params.from : DEFAULT_PERIOD.start;
  const end = params.to && isValidDate(params.to) ? params.to : DEFAULT_PERIOD.end;
  return start <= end ? { start, end } : DEFAULT_PERIOD;
}

/** Everything the UI / exports need for one period, all derived from the same posted journal. */
export function buildReports(books: Books, period: Period) {
  const financials = buildFinancials(books.posted.entries, books.accounts, period);
  const checks = runChecks(books.posted, books.accounts, financials, period);
  return {
    period, financials, checks,
    inventory: inventoryReport(books.posted, period),
    fixedAssets: fixedAssetReport(books.posted, period),
    gst: gstReport(books.posted.entries, period),
    ledger: buildLedger(books.posted.entries, books.accounts, { from: period.start, to: period.end }),
  };
}

// ---------- writes ----------
const text = z.string().trim().max(300).default("");
export const newTransactionSchema = z.object({
  txnId: text, date: z.string().trim(), type: z.enum(TRANSACTION_TYPES), description: z.string().trim().min(1, "Description is required").max(300),
  party: text, reference: text, category: text, item: text, quantity: text, unitAmount: text, amount: text, gstRate: text, gstTreatment: text,
  account: text, settle: text, toAccount: text, interestAmount: text, deductionAmount: text, usefulLifeYears: text, residualValue: text,
});

/**
 * Validate and post one new transaction. The full batch (existing + new) is re-run through the engine, and the full set of
 * integrity checks must still pass, before anything is written. Throws AccountingError / ZodError otherwise.
 */
export interface PostedPreview {
  txnId: string; entryId: string; saved: boolean;
  lines: { accountCode: string; accountName: string; debit: string; credit: string; party?: string }[];
}

export async function postNewTransaction(input: unknown, opts: { dryRun?: boolean } = {}): Promise<PostedPreview> {
  const parsed = newTransactionSchema.parse(input);
  const store = getStore();
  const existing = await loadBooks();
  const txnId = parsed.txnId || nextTxnId(existing.sources);
  const tx: SourceTransaction = { ...parsed, txnId, reference: parsed.reference || txnId };
  if (existing.sources.some((s) => s.txnId === txnId)) throw new AccountingError(`Duplicate transaction ID "${txnId}"`, txnId);
  const posted = postTransactions([...existing.sources, tx], existing.accounts); // throws on any rule violation
  const period = resolvePeriod({});
  const lastDate = posted.entries.reduce((m, e) => (e.date > m ? e.date : m), period.end);
  const wide = { start: period.start, end: lastDate > period.end ? lastDate : period.end };
  const fin = buildFinancials(posted.entries, existing.accounts, wide);
  const failed = runChecks(posted, existing.accounts, fin, wide).filter((c) => !c.passed);
  if (failed.length) throw new AccountingError(`Posting rejected - integrity check failed: ${failed.map((f) => `${f.name} (diff ${f.difference.toFixed(2)})`).join("; ")}`, txnId);
  const entry = posted.entries.find((e) => e.txnId === txnId)!;
  if (!opts.dryRun) await store.appendTransaction(tx, posted.entries);
  const names = new Map(existing.accounts.map((a) => [a.code, a.name]));
  return {
    txnId, entryId: entry.id, saved: !opts.dryRun,
    lines: entry.lines.map((l) => ({ accountCode: l.accountCode, accountName: names.get(l.accountCode) ?? "", debit: l.debit.toFixed(2), credit: l.credit.toFixed(2), party: l.party })),
  };
}

export function nextTxnId(sources: SourceTransaction[]): string {
  const max = sources.reduce((m, s) => Math.max(m, Number(/^T(\d+)$/.exec(s.txnId)?.[1] ?? 0)), 0);
  return `T${String(max + 1).padStart(3, "0")}`;
}

export const accountInputSchema = z.object({
  code: z.string().trim().regex(/^\d{4}$/, "Account code must be 4 digits"),
  name: z.string().trim().min(2).max(80),
  type: z.enum(["asset", "liability", "equity", "income", "expense"]),
  group: z.string().trim().min(2).max(60),
});

export async function addCustomAccount(input: unknown): Promise<Account> {
  const p = accountInputSchema.parse(input);
  const books = await loadBooks();
  if (books.accounts.some((a) => a.code === p.code)) throw new AccountingError(`Account code ${p.code} already exists`);
  const account: Account = {
    ...p, normalBalance: p.type === "asset" || p.type === "expense" ? "debit" : "credit", isContra: false, description: "User-added account",
  };
  await getStore().addAccount(account);
  return account;
}

export async function resetDemo(): Promise<number> {
  const demo = loadSampleTransactions();
  const posted = postTransactions(demo, loadBaseChart());
  await getStore().resetToDemo(demo, posted.entries);
  return demo.length;
}
