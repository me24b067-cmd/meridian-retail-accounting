import { Amt, Badge, DownloadLinks, Notice, PageHeader, Panel } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function ValidationPage({ searchParams }: { searchParams: SearchParams }) {
  const { rep, period } = await loadPage(searchParams);
  const failed = rep.checks.filter((c) => !c.passed);
  return (
    <>
      <PageHeader title="Accounting Validation" subtitle={`Integrity checks with numeric differences · ${period.start} to ${period.end}`}>
        <DownloadLinks files={[{ file: "validation_results", label: "CSV" }]} from={period.start} to={period.end} />
      </PageHeader>
      <Notice tone={failed.length ? "bad" : "good"}>
        {failed.length ? <><Badge ok={false} no="FAILED" /> {failed.length} of {rep.checks.length} checks failed.</> : <><Badge ok /> All {rep.checks.length} checks passed. Every difference below is computed from the ledger - nothing is hard-coded.</>}
      </Notice>
      <Panel>
        <table className="grid">
          <thead><tr><th>ID</th><th>Check</th><th className="num">Expected (₹)</th><th className="num">Actual (₹)</th><th className="num">Difference (₹)</th><th>Result</th><th>Detail</th></tr></thead>
          <tbody>
            {rep.checks.map((c) => (
              <tr key={c.id}><td>{c.id}</td><td>{c.name}</td><td className="num"><Amt v={c.expected} /></td><td className="num"><Amt v={c.actual} /></td><td className="num"><Amt v={c.difference} /></td><td><Badge ok={c.passed} /></td><td className="text-xs text-[color:var(--muted)]">{c.detail}</td></tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
