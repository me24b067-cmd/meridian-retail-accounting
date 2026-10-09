import { Amt, Notice, PageHeader, Panel, Stat } from "@/components/ui";
import { formatINR } from "@/lib/accounting/money";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function GstPage({ searchParams }: { searchParams: SearchParams }) {
  const { rep, period } = await loadPage(searchParams);
  const g = rep.gst;
  return (
    <>
      <PageHeader title="GST Summary" subtitle={`Simplified educational GST (one combined rate) · ${period.start} to ${period.end}`} />
      <Notice>Illustrative rates and treatments only - not tax advice. Real GST has CGST/SGST/IGST, place-of-supply, blocked credits, return matching and time limits, none of which are modelled.</Notice>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Input GST recorded" value={formatINR(g.inputRecorded)} /><Stat label="Output GST collected" value={formatINR(g.outputCollected)} />
        <Stat label="Closing input credit (asset)" value={formatINR(g.inputClosing)} /><Stat label="Closing output payable (liability)" value={formatINR(g.outputClosing)} />
      </div>
      <Panel>
        <table className="grid">
          <thead><tr><th>Date</th><th>Txn</th><th>Description</th><th>Rate</th><th>Treatment</th><th className="num">Input GST</th><th className="num">Output GST</th><th className="num">Set off / settled</th></tr></thead>
          <tbody>
            {g.rows.map((r) => (<tr key={r.txnId}><td className="whitespace-nowrap">{r.date}</td><td>{r.txnId}</td><td>{r.description}</td><td>{r.rate && `${r.rate}%`}</td><td className="text-xs">{r.treatment}</td>
              <td className="num">{r.inputGst.gt(0) && <Amt v={r.inputGst} />}</td><td className="num">{r.outputGst.gt(0) && <Amt v={r.outputGst} />}</td><td className="num">{r.settled.gt(0) && <Amt v={r.settled} />}</td></tr>))}
            <tr className="total"><td colSpan={5}>Totals</td><td className="num"><Amt v={g.inputRecorded} /></td><td className="num"><Amt v={g.outputCollected} /></td><td></td></tr>
          </tbody>
        </table>
      </Panel>
    </>
  );
}
