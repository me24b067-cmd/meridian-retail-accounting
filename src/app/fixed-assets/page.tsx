import { Amt, Badge, PageHeader, Panel } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function FixedAssetsPage({ searchParams }: { searchParams: SearchParams }) {
  const { books, rep, period } = await loadPage(searchParams);
  const fa = rep.fixedAssets;
  const name = new Map(books.posted.assets.map((a) => [a.assetId, a.name]));
  const f3 = rep.checks.find((c) => c.id === "F3");
  return (
    <>
      <PageHeader title="Fixed Assets and Depreciation" subtitle={`Straight-line, daily pro-rata: (cost − residual) ÷ (life × 365) × days · as at ${period.end}`} />
      <Panel title="Asset register">
        <table className="grid">
          <thead><tr><th>Asset</th><th>Account</th><th>Purchased</th><th className="num">Cost</th><th className="num">Residual</th><th className="num">Life (yrs)</th><th className="num">Annual charge</th><th className="num">Accumulated</th><th className="num">Net book value</th></tr></thead>
          <tbody>
            {fa.rows.map((r) => (<tr key={r.assetId}><td>{r.name}</td><td>{r.costAccount}</td><td>{r.purchaseDate}</td><td className="num"><Amt v={r.cost} /></td><td className="num"><Amt v={r.residual} /></td><td className="num">{r.lifeYears.toString()}</td><td className="num"><Amt v={r.annualCharge} /></td><td className="num"><Amt v={r.accumulated} /></td><td className="num"><Amt v={r.netBookValue} /></td></tr>))}
            <tr className="total"><td colSpan={3}>Total</td><td className="num"><Amt v={fa.totalCost} /></td><td colSpan={4}></td><td className="num"><Amt v={fa.totalNetBookValue} /></td></tr>
            <tr className="subtotal"><td colSpan={7}>Balance Sheet: cost − accumulated depreciation vs register NBV {f3 && <Badge ok={f3.passed} yes="RECONCILED" no="MISMATCH" />}</td><td className="num"><Amt v={fa.totalAccumulated} /></td><td className="num">diff <Amt v={f3?.difference} /></td></tr>
          </tbody>
        </table>
      </Panel>
      <Panel title={`Depreciation postings (expense in period: ₹${fa.depreciationInPeriod.toFixed(2)})`} className="mt-4">
        <table className="grid">
          <thead><tr><th>Txn</th><th>Asset</th><th>From (excl.)</th><th>To (incl.)</th><th className="num">Days</th><th className="num">Amount</th></tr></thead>
          <tbody>{fa.schedule.map((d, i) => (<tr key={i}><td>{d.txnId}</td><td>{name.get(d.assetId)}</td><td>{d.fromDate}</td><td>{d.toDate}</td><td className="num">{d.days}</td><td className="num"><Amt v={d.amount} /></td></tr>))}</tbody>
        </table>
      </Panel>
      <p className="mt-3 text-xs text-[color:var(--muted)]">Asset disposal is not implemented (documented limitation). The book method is straight-line; it is not the income-tax WDV method.</p>
    </>
  );
}
