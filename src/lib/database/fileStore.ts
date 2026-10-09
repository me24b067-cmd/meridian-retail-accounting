import fs from "node:fs/promises";
import path from "node:path";
import type { Account, SourceTransaction } from "@/types/accounting";
import { loadSampleTransactions } from "./csv";
import type { TransactionStore } from "./store";

interface FileState { transactions: SourceTransaction[]; accounts: Account[] }

const FILE = path.join(process.cwd(), ".data", "store.json");

async function read(): Promise<FileState> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as FileState;
  } catch {
    return { transactions: loadSampleTransactions(), accounts: [] }; // first run: seed with the demo dataset
  }
}

async function write(state: FileState): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, FILE); // atomic replace: a crash never leaves a half-written file
}

/** Local development store: a JSON file in .data/ (git-ignored). */
export const fileStore: TransactionStore = {
  mode: "file",
  label: "Local JSON file (.data/store.json)",
  async listTransactions() { return (await read()).transactions; },
  async listCustomAccounts() { return (await read()).accounts; },
  async appendTransaction(tx) {
    const s = await read();
    s.transactions.push(tx);
    await write(s);
  },
  async addAccount(account) {
    const s = await read();
    s.accounts.push(account);
    await write(s);
  },
  async resetToDemo(demo) { await write({ transactions: demo, accounts: [] }); },
};
