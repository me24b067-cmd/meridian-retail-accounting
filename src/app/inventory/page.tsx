import { Amt, Badge, PageHeader, Panel } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function InventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const { rep, period } = await loadPage(searchParams);
  const inv = rep.inventory;
  const gl = rep.financials.balanceSheet.rows.find((r) => r.code === "1200")?.amount;
  const diff = gl ? gl.minus(inv.totalValue) : inv.totalValue.negated();
  return (
    <>
      <PageHeader title="Inventory" subtitle={`Perpetual weighted-average cost · as at ${period.end}`} />
      <Panel title="Closing stock by item">
        <table className="grid">
          <thead><tr><th>Item</th><th className="num">Quantity</th><th className="num">Average cost (₹)</th><th className="num">Value (₹)</th></tr></thead>
          <tbody>
            {inv.items.map((i) => (<tr key={i.item}><td>{i.item}</td><td className="num">{i.quantity.toString()}</td><td className="num"><Amt v={i.averageCost} /></td><td className="num"><Amt v={i.value} /></td></tr>))}
            <tr className="total"><td>Subledger total</td><td></td><td></td><td className="num"><Amt v={inv.totalValue} /></td></tr>
            <tr className="subtotal"><td colSpan={3}>Inventory account 1200 on the Balance Sheet · difference <Badge ok={diff.isZero()} yes="RECONCILED" no="MISMATCH" /></td><td className="num"><Amt v={gl} /> <span className="text-xs">(diff <Amt v={diff} />)</span></td></tr>
            <tr><td colSpan={3}>Cost of goods sold recognised in the period</td><td className="num"><Amt v={inv.cogsInPeriod} /></td></tr>
          </tbody>
        </table>
      </Panel>
      <Panel title="Stock movements" className="mt-4">
        <table className="grid">
          <thead><tr><th>Txn</th><th>Date</th><th>Item</th><th>Movement</th><th className="num">Qty</th><th className="num">Unit cost</th><th className="num">Value</th><th className="num">Balance qty</th><th className="num">Balance value</th></tr></thead>
          <tbody>
            {inv.movements.map((m, i) => (
              <tr key={i}><td>{m.txnId}</td><td className="whitespace-nowrap">{m.date}</td><td>{m.item}</td><td>{m.kind === "PURCHASE" ? "Purchase (in)" : "Sale (out)"}</td>
                <td className="num">{m.quantity.toString()}</td><td className="num"><Amt v={m.unitCost} /></td><td className="num"><Amt v={m.value} /></td><td className="num">{m.balanceQty.toString()}</td><td className="num"><Amt v={m.balanceValue} /></td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
