import { fileStore } from "./fileStore";
import { postgresStore } from "./postgresStore";
import { readonlyStore } from "./readonlyStore";
import type { TransactionStore } from "./store";

/** DATABASE_URL -> PostgreSQL; otherwise local JSON file in development; read-only demo on serverless hosts. */
export function getStore(): TransactionStore {
  if (process.env.DATABASE_URL) return postgresStore;
  if (process.env.VERCEL || process.env.NODE_ENV === "production" && process.env.READONLY_DEMO === "true") return readonlyStore;
  return fileStore;
}
