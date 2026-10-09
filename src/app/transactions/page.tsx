import { PageHeader, Panel } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const { books, period, get } = await loadPage(searchParams);
  const q = (get("q") ?? "").toLowerCase(), account = get("account") ?? "", category = get("category") ?? "", type = get("type") ?? "";
  const entryByTxn = new Map(books.posted.entries.map((e) => [e.txnId, e]));
  const names = new Map(books.accounts.map((a) => [a.code, a.name]));
  const rows = books.sources
    .filter((t) => t.date >= period.start && t.date <= period.end)
    .filter((t) => !q || `${t.description} ${t.party} ${t.txnId} ${t.reference}`.toLowerCase().includes(q))
    .filter((t) => !category || t.category === category)
    .filter((t) => !type || t.type === type)
    .filter((t) => !account || entryByTxn.get(t.txnId)?.lines.some((l) => l.accountCode === account))
    .sort((a, b) => (a.date === b.date ? a.txnId.localeCompare(b.txnId) : a.date < b.date ? -1 : 1));
  const categories = [...new Set(books.sources.map((t) => t.category))].sort();
  const types = [...new Set(books.sources.map((t) => t.type))].sort();
  return (
    <>
      <PageHeader title="Transaction Register" subtitle={`${rows.length} of ${books.sources.length} source transactions · ${period.start} to ${period.end}`}>
        <a className="btn secondary" href="/api/export/source_transactions">Source CSV</a>
        <a className="btn secondary" href="/api/export/journal_entries">Journal CSV</a>
      </PageHeader>
      <form className="card no-print mb-4 grid gap-3 p-4 md:grid-cols-5" method="get">
        <input type="hidden" name="from" value={period.start} /><input type="hidden" name="to" value={period.end} />
        <label className="field">Search<input name="q" defaultValue={get("q") ?? ""} className="input" placeholder="description, party, ID" /></label>
        <label className="field">Account<select name="account" defaultValue={account} className="input"><option value="">All accounts</option>{books.accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}</select></label>
        <label className="field">Category<select name="category" defaultValue={category} className="input"><option value="">All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label className="field">Type<select name="type" defaultValue={type} className="input"><option value="">All</option>{types.map((c) => <option key={c}>{c}</option>)}</select></label>
        <div className="flex items-end gap-2"><button className="btn">Filter</button><a className="btn secondary" href={`/transactions?from=${period.start}&to=${period.end}`}>Clear</a></div>
      </form>
      <Panel>
        <table className="grid">
          <thead><tr><th>ID</th><th>Date</th><th>Type</th><th>Description</th><th>Party</th><th>Category</th><th>Journal entry (click to inspect)</th></tr></thead>
          <tbody>
            {rows.map((t) => {
              const e = entryByTxn.get(t.txnId);
              return (
                <tr key={t.txnId}>
                  <td className="whitespace-nowrap font-medium">{t.txnId}</td><td className="whitespace-nowrap">{t.date}</td><td className="text-xs">{t.type}</td>
                  <td>{t.description}</td><td>{t.party}</td><td className="text-xs">{t.category}</td>
                  <td>
                    {e && (
                      <details>
                        <summary className="cursor-pointer text-xs text-blue-800">{e.id} · {e.lines.length} lines{e.gstAmount && e.gstAmount.gt(0) ? ` · GST ${e.gstAmount.toFixed(2)}` : ""}</summary>
                        <table className="grid mt-1"><tbody>
                          {e.lines.map((l, i) => (
                            <tr key={i}><td className="text-xs">{l.accountCode} {names.get(l.accountCode)}</td><td className="num text-xs">{l.debit.gt(0) ? `Dr ${l.debit.toFixed(2)}` : ""}</td><td className="num text-xs">{l.credit.gt(0) ? `Cr ${l.credit.toFixed(2)}` : ""}</td></tr>
                          ))}
                        </tbody></table>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
