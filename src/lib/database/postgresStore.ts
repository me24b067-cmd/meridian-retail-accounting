import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import type { Account, JournalEntry, SourceTransaction } from "@/types/accounting";
import { loadBaseChart } from "./csv";
import type { TransactionStore } from "./store";

const COLS: [keyof SourceTransaction, string][] = [
  ["txnId", "txn_id"], ["date", "date"], ["type", "type"], ["description", "description"], ["party", "party"],
  ["reference", "reference"], ["category", "category"], ["item", "item"], ["quantity", "quantity"], ["unitAmount", "unit_amount"],
  ["amount", "amount"], ["gstRate", "gst_rate"], ["gstTreatment", "gst_treatment"], ["account", "account"], ["settle", "settle"],
  ["toAccount", "to_account"], ["interestAmount", "interest_amount"], ["deductionAmount", "deduction_amount"],
  ["usefulLifeYears", "useful_life_years"], ["residualValue", "residual_value"],
];

let pool: Pool | undefined;
let ready: Promise<void> | undefined;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!;
    // Server-side only. Neon/most hosted Postgres require TLS.
    pool = new Pool({ connectionString: url, max: 3, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  }
  return pool;
}

/** Applies migrations/001_init.sql and seeds the chart of accounts once. */
async function ensureSchema(): Promise<void> {
  ready ??= (async () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "migrations", "001_init.sql"), "utf8");
    const c = await getPool().connect();
    try {
      await c.query("SELECT pg_advisory_lock(7204001)");
      await c.query(sql);
      for (const a of loadBaseChart()) {
        await c.query(
          `INSERT INTO accounts (code,name,type,normal_balance,grp,is_contra,description) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO NOTHING`,
          [a.code, a.name, a.type, a.normalBalance, a.group, a.isContra, a.description],
        );
      }
    } finally {
      await c.query("SELECT pg_advisory_unlock(7204001)").catch(() => undefined);
      c.release();
    }
  })();
  try { await ready; } catch (e) { ready = undefined; throw e; }
}

async function insertSource(c: PoolClient, tx: SourceTransaction) {
  const cols = COLS.map(([, db]) => db === "date" ? `"date"` : db).join(",");
  const ph = COLS.map((_, i) => `$${i + 1}`).join(",");
  await c.query(`INSERT INTO source_transactions (${cols}) VALUES (${ph})`, COLS.map(([k]) => tx[k] || ""));
}

/** Replace the journal mirror with the freshly derived journal (inside the caller's transaction). */
async function writeJournal(c: PoolClient, journal: JournalEntry[]) {
  await c.query("DELETE FROM journal_entries");
  if (!journal.length) return;
  await c.query(
    `INSERT INTO journal_entries (id,txn_id,date,reference,description,category,party,gst_rate,gst_treatment,gst_amount)
     SELECT * FROM unnest($1::text[],$2::text[],$3::date[],$4::text[],$5::text[],$6::text[],$7::text[],$8::text[],$9::text[],$10::numeric[])`,
    [
      journal.map((e) => e.id), journal.map((e) => e.txnId), journal.map((e) => e.date), journal.map((e) => e.reference),
      journal.map((e) => e.description), journal.map((e) => e.category), journal.map((e) => e.party ?? null),
      journal.map((e) => e.gstRate ?? null), journal.map((e) => e.gstTreatment ?? null), journal.map((e) => e.gstAmount?.toFixed(2) ?? null),
    ],
  );
  const lines = journal.flatMap((e) => e.lines.map((l, i) => ({ e, l, no: i + 1 })));
  await c.query(
    `INSERT INTO journal_lines (entry_id,line_no,account_code,debit,credit,party,memo)
     SELECT * FROM unnest($1::text[],$2::int[],$3::text[],$4::numeric[],$5::numeric[],$6::text[],$7::text[])`,
    [
      lines.map((x) => x.e.id), lines.map((x) => x.no), lines.map((x) => x.l.accountCode), lines.map((x) => x.l.debit.toFixed(2)),
      lines.map((x) => x.l.credit.toFixed(2)), lines.map((x) => x.l.party ?? null), lines.map((x) => x.l.memo ?? null),
    ],
  );
}

async function inTransaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ensureSchema();
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(7204002)"); // serialise writers
    const out = await fn(c);
    await c.query("COMMIT"); // deferred balance trigger fires here; failure rolls everything back
    return out;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

export const postgresStore: TransactionStore = {
  mode: "postgres",
  label: "PostgreSQL (DATABASE_URL)",
  async listTransactions() {
    await ensureSchema();
    const r = await getPool().query(`SELECT ${COLS.map(([, db]) => (db === "date" ? `to_char("date",'YYYY-MM-DD') AS date` : db)).join(",")} FROM source_transactions ORDER BY seq`);
    return r.rows.map((row) => Object.fromEntries(COLS.map(([k, db]) => [k, String(row[db] ?? "")])) as unknown as SourceTransaction);
  },
  async listCustomAccounts() {
    await ensureSchema();
    const r = await getPool().query("SELECT * FROM accounts WHERE is_custom ORDER BY code");
    return r.rows.map((a) => ({ code: a.code, name: a.name, type: a.type, normalBalance: a.normal_balance, group: a.grp, isContra: a.is_contra, description: a.description }));
  },
  async appendTransaction(tx, journal) {
    await inTransaction(async (c) => {
      await insertSource(c, tx);
      await writeJournal(c, journal);
    });
  },
  async addAccount(a) {
    await inTransaction(async (c) => {
      await c.query(
        `INSERT INTO accounts (code,name,type,normal_balance,grp,is_contra,description,is_custom) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
        [a.code, a.name, a.type, a.normalBalance, a.group, a.isContra, a.description],
      );
    });
  },
  async resetToDemo(demo, journal) {
    await inTransaction(async (c) => {
      await c.query("DELETE FROM journal_entries");
      await c.query("DELETE FROM source_transactions");
      await c.query("DELETE FROM accounts WHERE is_custom");
      for (const tx of demo) await insertSource(c, tx);
      await writeJournal(c, journal);
    });
  },
};

/** Used by the app layer to detect a brand-new database that still needs the demo data. */
export async function isEmptyDatabase(): Promise<boolean> {
  await ensureSchema();
  const r = await getPool().query("SELECT COUNT(*)::int AS n FROM source_transactions");
  return r.rows[0].n === 0;
}
