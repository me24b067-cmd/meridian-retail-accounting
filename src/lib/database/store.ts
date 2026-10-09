import type { Account, JournalEntry, SourceTransaction } from "@/types/accounting";

export type StoreMode = "postgres" | "file" | "readonly";

/**
 * Persistence of SOURCE transactions (and user-added accounts). The ledger is always re-derived from these by the
 * accounting engine, so a store can never hold a "stale" statement. The Postgres store additionally mirrors the posted
 * journal into relational tables, in the same database transaction, protected by constraints.
 */
export interface TransactionStore {
  readonly mode: StoreMode;
  readonly label: string;
  listTransactions(): Promise<SourceTransaction[]>;
  listCustomAccounts(): Promise<Account[]>;
  /** Persist one new source transaction; `journal` is the full posted journal after adding it. */
  appendTransaction(tx: SourceTransaction, journal: JournalEntry[]): Promise<void>;
  addAccount(account: Account): Promise<void>;
  /** Replace everything with the demo dataset. Only touches this application's tables/files. */
  resetToDemo(demo: SourceTransaction[], demoJournal: JournalEntry[]): Promise<void>;
}

export class ReadOnlyError extends Error {
  constructor() {
    super("This deployment is in read-only demo mode (no DATABASE_URL configured). Set DATABASE_URL to enable posting transactions.");
    this.name = "ReadOnlyError";
  }
}
