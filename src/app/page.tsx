import { CompositionChart, FxPanel, MonthlyChart } from "@/components/DashboardCharts";
import { Amt, Badge, Notice, PageHeader, Panel, Stat } from "@/components/ui";
import { ZERO, formatINR, type Dec } from "@/lib/accounting/money";
import { monthlySeries } from "@/lib/accounting/subreports";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const { books, period, rep } = await loadPage(searchParams);
  const bs = rep.financials.balanceSheet, pl = rep.financials.profitAndLoss;
  const row = (code: string) => bs.rows.find((r) => r.code === code)?.amount;
  const amountOf = (code: string) => row(code) ?? ZERO;
  const bankTotal = amountOf("1002").plus(amountOf("1003"));
  const failed = rep.checks.filter((c) => !c.passed);
  const netFixed = bs.rows.find((r) => r.label === "Net Fixed Assets")?.amount ?? ZERO;
  const composition = [
    ["Cash + Bank", amountOf("1001").plus(bankTotal)], ["Inventory", amountOf("1200")], ["Receivables", amountOf("1100")],
    ["Net fixed assets", netFixed], ["Prepaid + GST credit", amountOf("1300").plus(amountOf("1400"))],
  ].map(([name, v]) => ({ name: name as string, value: (v as Dec).toNumber() }));

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Meridian Retail Traders · ${period.start} to ${period.end} · ${books.sources.length} source transactions · ${books.posted.entries.length} journal entries`} />
      {failed.length === 0
        ? <Notice tone="good"><Badge ok yes="BALANCE SHEET BALANCES" /> · Assets {formatINR(bs.totalAssets)} = Liabilities {formatINR(bs.totalLiabilities)} + Equity {formatINR(bs.totalEquity)} · difference {formatINR(bs.difference)} · all {rep.checks.length} integrity checks pass</Notice>
        : <Notice tone="bad"><Badge ok={false} no="VALIDATION FAILED" /> · {failed.map((c) => `${c.id} (diff ${c.difference.toFixed(2)})`).join(", ")} - see Accounting Validation</Notice>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Total assets" value={formatINR(bs.totalAssets)} />
        <Stat label="Total liabilities" value={formatINR(bs.totalLiabilities)} />
        <Stat label="Net profit (period)" value={formatINR(pl.netProfit)} tone={pl.netProfit.isNegative() ? "bad" : "good"} hint="Income − expenses" />
        <Stat label="Cash in hand" value={formatINR(amountOf("1001"))} />
        <Stat label="Bank balances (2 accounts)" value={formatINR(bankTotal)} hint={`A/c 1 ${formatINR(amountOf("1002"))} · A/c 2 ${formatINR(amountOf("1003"))}`} />
        <Stat label="Inventory" value={formatINR(amountOf("1200"))} />
        <Stat label="Accounts receivable" value={formatINR(amountOf("1100"))} />
        <Stat label="Accounts payable" value={formatINR(amountOf("2001"))} />
        <Stat label="Balance sheet difference" value={formatINR(bs.difference)} tone={bs.balanced ? "good" : "bad"} hint={bs.balanced ? "PASS" : "FAIL"} />
        <Stat label="Trial balance difference" value={formatINR(rep.financials.trialBalance.difference)} tone={rep.financials.trialBalance.difference.isZero() ? "good" : "bad"} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title="Monthly income, expenses and net profit (₹)"><MonthlyChart data={monthlySeries(books.posted.entries, books.accounts, period)} /></Panel>
        <Panel title="What the business owns (₹)"><CompositionChart data={composition} /></Panel>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Profit & loss summary">
          <table className="grid"><tbody>
            {[["Sales revenue", pl.salesRevenue], ["Service income", pl.serviceIncome], ["Interest income", pl.interestIncome], ["Cost of goods sold", pl.cogs.negated()], ["Operating expenses", pl.operatingExpenses.negated()],
              ["Depreciation", pl.depreciation.negated()], ["Interest expense", pl.interestExpense.negated()], ["Net profit", pl.netProfit]].map(([l, v]) => (
              <tr key={l as string}><td>{l as string}</td><td className="num"><Amt v={v as typeof pl.netProfit} /></td></tr>))}
          </tbody></table>
        </Panel>
        <Panel title="External reference data (optional · not part of the ledger)"><FxPanel /></Panel>
      </div>
    </>
  );
}
