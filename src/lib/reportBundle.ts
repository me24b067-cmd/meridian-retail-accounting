import { buildLedger } from "@/lib/accounting/ledger";
import { buildFinancials, type Period } from "@/lib/accounting/reports";
import { fixedAssetReport, gstReport, inventoryReport } from "@/lib/accounting/subreports";
import { runChecks } from "@/lib/validation/checks";
import type { Account, PostedLedger, SourceTransaction } from "@/types/accounting";

/** Browser-safe (no database / filesystem imports): the books for one dataset. */
export interface Books {
  accounts: Account[];
  sources: SourceTransaction[];
  posted: PostedLedger;
  storeMode: string;
  storeLabel: string;
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

