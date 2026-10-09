import { Amt, PageHeader, Panel } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function LedgerPage({ searchParams }: { searchParams: SearchParams }) {
  const { rep, period, get } = await loadPage(searchParams);
  const active = rep.ledger.filter((l) => l.rows.length || !l.opening.isZero());
  const code = get("account") ?? active[0]?.account.code;
  const la = rep.ledger.find((l) => l.account.code === code) ?? active[0];
  return (
    <>
      <PageHeader title="General Ledger" subtitle={`Account-wise postings derived from journal entries · ${period.start} to ${period.end}`} />
      <form className="card no-print mb-4 flex items-end gap-3 p-4" method="get">
        <input type="hidden" name="from" value={period.start} /><input type="hidden" name="to" value={period.end} />
        <label className="field flex-1">Account
          <select name="account" defaultValue={la?.account.code} className="input">{active.map((l) => <option key={l.account.code} value={l.account.code}>{l.account.code} {l.account.name} ({l.rows.length})</option>)}</select>
        </label>
        <button className="btn">Show ledger</button>
      </form>
      {la && (
        <Panel title={`${la.account.code} ${la.account.name} · normal balance: ${la.account.normalBalance}`}>
          <table className="grid">
            <thead><tr><th>Date</th><th>Journal</th><th>Description</th><th>Party</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr></thead>
            <tbody>
              <tr className="subtotal"><td colSpan={6}>Opening balance</td><td className="num"><Amt v={la.opening} /></td></tr>
              {la.rows.map((r, i) => (
                <tr key={i}><td className="whitespace-nowrap">{r.date}</td><td>{r.entryId}</td><td>{r.description}</td><td>{r.party}</td>
                  <td className="num">{r.debit.gt(0) && <Amt v={r.debit} />}</td><td className="num">{r.credit.gt(0) && <Amt v={r.credit} />}</td><td className="num"><Amt v={r.balance} /></td></tr>
              ))}
              <tr className="total"><td colSpan={4}>Closing balance</td><td className="num"><Amt v={la.totalDebit} /></td><td className="num"><Amt v={la.totalCredit} /></td><td className="num"><Amt v={la.closing} /></td></tr>
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
