import { NextResponse } from "next/server";
import { buildReports, loadBooks, resolvePeriod } from "@/lib/books";

export const dynamic = "force-dynamic";

/** Machine-readable headline figures + validation (used for smoke tests). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const books = await loadBooks();
  const rep = buildReports(books, resolvePeriod({ from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined }));
  const f = rep.financials, bs = f.balanceSheet, tb = f.trialBalance;
  return NextResponse.json({
    period: rep.period, sourceTransactions: books.sources.length, journalEntries: books.posted.entries.length, storage: books.storeMode,
    trialBalance: { debit: tb.totalDebit.toFixed(2), credit: tb.totalCredit.toFixed(2), difference: tb.difference.toFixed(2) },
    balanceSheet: { totalAssets: bs.totalAssets.toFixed(2), totalLiabilities: bs.totalLiabilities.toFixed(2), totalEquity: bs.totalEquity.toFixed(2), difference: bs.difference.toFixed(2), balanced: bs.balanced },
    netProfit: f.profitAndLoss.netProfit.toFixed(2),
    checks: { passed: rep.checks.filter((c) => c.passed).length, total: rep.checks.length, failed: rep.checks.filter((c) => !c.passed).map((c) => c.id) },
  });
}
