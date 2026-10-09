import { PrintButton } from "@/components/PrintButton";
import { DownloadLinks, Notice, PageHeader, Panel, StatementTable } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function PnlPage({ searchParams }: { searchParams: SearchParams }) {
  const { rep, period } = await loadPage(searchParams);
  const pl = rep.financials.profitAndLoss;
  return (
    <>
      <PageHeader title="Profit and Loss Statement" subtitle={`Meridian Retail Traders · for the period ${period.start} to ${period.end} · INR (₹)`}>
        <DownloadLinks files={[{ file: "profit_and_loss", label: "CSV" }, { file: "xlsx", label: "Excel" }]} from={period.start} to={period.end} /><PrintButton />
      </PageHeader>
      <Notice>Built from income and expense ledger accounts only. Capital, loan principal, GST collected/paid and transfers never appear here. Net profit = Total Income − Total Expenses = <b>₹{pl.netProfit.toFixed(2)}</b>.</Notice>
      <Panel><StatementTable rows={pl.rows} /></Panel>
    </>
  );
}
