import { Amt, Badge, DownloadLinks, PageHeader, Panel } from "@/components/ui";
import { PrintButton } from "@/components/PrintButton";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function TrialBalancePage({ searchParams }: { searchParams: SearchParams }) {
  const { rep, period } = await loadPage(searchParams);
  const tb = rep.financials.trialBalance;
  return (
    <>
      <PageHeader title="Trial Balance" subtitle={`As at ${period.end} · income and expenses for ${period.start} to ${period.end}`}>
        <DownloadLinks files={[{ file: "trial_balance", label: "CSV" }]} from={period.start} to={period.end} /><PrintButton />
      </PageHeader>
      <Panel>
        <table className="grid">
          <thead><tr><th>Code</th><th>Account</th><th className="num">Debit (₹)</th><th className="num">Credit (₹)</th></tr></thead>
          <tbody>
            {tb.rows.map((r) => (<tr key={r.code}><td>{r.code}</td><td>{r.name}</td><td className="num">{r.debit.gt(0) && <Amt v={r.debit} />}</td><td className="num">{r.credit.gt(0) && <Amt v={r.credit} />}</td></tr>))}
            <tr className="total"><td></td><td>Total</td><td className="num"><Amt v={tb.totalDebit} /></td><td className="num"><Amt v={tb.totalCredit} /></td></tr>
            <tr className="subtotal"><td></td><td>Difference (debits − credits) <Badge ok={tb.difference.isZero()} yes="BALANCED" no="NOT BALANCED" /></td><td className="num" colSpan={2}><Amt v={tb.difference} /></td></tr>
          </tbody>
        </table>
      </Panel>
    </>
  );
}
