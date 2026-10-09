/* Applies migrations/001_init.sql to DATABASE_URL, seeds the chart of accounts, and loads the demo dataset if the database is empty. */
import { isEmptyDatabase } from "../src/lib/database/postgresStore";
import { resetDemo } from "../src/lib/books";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Example: DATABASE_URL=postgresql://user:pass@host/db npm run db:migrate");
    process.exit(1);
  }
  const empty = await isEmptyDatabase(); // runs the migration as a side effect
  console.log("Schema is up to date.");
  if (empty) console.log(`Empty database - loaded demo dataset (${await resetDemo()} transactions).`);
  else console.log("Database already contains transactions - demo data NOT loaded (use the Reset button/API to replace).");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
