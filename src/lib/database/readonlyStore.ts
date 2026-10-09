import { loadSampleTransactions } from "./csv";
import { ReadOnlyError, type TransactionStore } from "./store";

/** Used on a deployment without a database: serves the bundled demo dataset, rejects writes. */
export const readonlyStore: TransactionStore = {
  mode: "readonly",
  label: "Read-only demo dataset (bundled CSV)",
  async listTransactions() { return loadSampleTransactions(); },
  async listCustomAccounts() { return []; },
  async appendTransaction() { throw new ReadOnlyError(); },
  async addAccount() { throw new ReadOnlyError(); },
  async resetToDemo() { throw new ReadOnlyError(); },
};
