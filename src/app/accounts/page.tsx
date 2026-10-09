import { AddAccountForm } from "@/components/forms";
import { PageHeader, Panel } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";
import { loadBaseChart } from "@/lib/database/csv";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const { books } = await loadPage(searchParams);
  const base = new Set(loadBaseChart().map((a) => a.code));
  return (
    <>
      <PageHeader title="Chart of Accounts" subtitle="Codes, types and normal balances. The base chart lives in data/chart_of_accounts.csv; you can add accounts below." />
      <Panel>
        <table className="grid">
          <thead><tr><th>Code</th><th>Account</th><th>Type</th><th>Normal balance</th><th>Group</th><th>Notes</th></tr></thead>
          <tbody>
            {books.accounts.map((a) => (
              <tr key={a.code}><td>{a.code}</td><td>{a.name}{a.isContra && <span className="ml-2 text-xs text-[color:var(--muted)]">(contra-asset)</span>}{!base.has(a.code) && <span className="ml-2 text-xs text-blue-700">(added)</span>}</td>
                <td className="capitalize">{a.type}</td><td className="capitalize">{a.normalBalance}</td><td>{a.group}</td><td className="text-[color:var(--muted)]">{a.description}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Add an account" className="mt-4"><AddAccountForm readOnly={books.storeMode === "readonly"} /></Panel>
    </>
  );
}
