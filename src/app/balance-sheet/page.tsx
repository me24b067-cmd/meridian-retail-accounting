import { PrintButton } from "@/components/PrintButton";
import { Amt, Badge, DownloadLinks, PageHeader, Panel, StatementTable } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPage({ searchParams }: { searchParams: SearchParams }) {
  const { rep, period } = await loadPage(searchParams);
  const bs = rep.financials.balanceSheet;
  return (
    <>
      <PageHeader title="Balance Sheet" subtitle={`Meridian Retail Traders · as at ${period.end} · INR (₹)`}>
        <DownloadLinks files={[{ file: "balance_sheet", label: "CSV" }, { file: "xlsx", label: "Excel" }]} from={period.start} to={period.end} /><PrintButton />
      </PageHeader>
      <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${bs.balanced ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
        <Badge ok={bs.balanced} yes="BALANCED" no="NOT BALANCED" /> · Difference = Total Assets − Total Liabilities − Total Equity = <b><Amt v={bs.totalAssets} symbol /> − <Amt v={bs.totalLiabilities} symbol /> − <Amt v={bs.totalEquity} symbol /> = <Amt v={bs.difference} symbol /></b>
      </div>
      <Panel><StatementTable rows={bs.rows} /></Panel>
    </>
  );
}
