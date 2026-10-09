import { buildReports, loadBooks, resolvePeriod } from "@/lib/books";

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Loads the books and builds every report for the period in the URL (?from=&to=). All pages go through this. */
export async function loadPage(searchParams: SearchParams) {
  const raw = await searchParams;
  const get = (k: string) => (typeof raw[k] === "string" ? (raw[k] as string) : undefined);
  const books = await loadBooks();
  const period = resolvePeriod({ from: get("from"), to: get("to") });
  return { books, period, rep: buildReports(books, period), get };
}
