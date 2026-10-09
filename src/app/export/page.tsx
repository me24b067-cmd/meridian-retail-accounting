import { ResetButton } from "@/components/forms";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { CSV_FILES } from "@/lib/exports/csv";
import { WORKBOOK_NAME } from "@/lib/exports/excel";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function ExportPage({ searchParams }: { searchParams: SearchParams }) {
  const { books, period } = await loadPage(searchParams);
  const q = `?from=${period.start}&to=${period.end}`;
  return (
    <>
      <PageHeader title="Export and Submission Files" subtitle={`Generated live from the same ledger · ${period.start} to ${period.end}`} />
      <Panel title="Excel workbook (12 worksheets)">
        <div className="p-4"><a className="btn" href={`/api/export/xlsx${q}`}>Download {WORKBOOK_NAME}</a></div>
      </Panel>
      <Panel title="CSV files" className="mt-4">
        <ul className="grid gap-2 p-4 md:grid-cols-2">
          {CSV_FILES.map((f) => (<li key={f}><a className="text-blue-800 underline" href={`/api/export/${f}${q}`}>{f}.csv</a></li>))}
          <li><a className="text-blue-800 underline" href={`/api/export/statements${q}`}>Financial_Statements.md (TB, P&L, Balance Sheet, validation)</a></li>
        </ul>
      </Panel>
      <Notice>
        The final verified submission package (workbook, CSVs, statements, docs) is the <code>submission/</code> folder in the repository, regenerated with <code>npm run generate:submission</code>.
        PDF: use the <b>Print / Save as PDF</b> button on the Trial Balance, Profit and Loss and Balance Sheet pages.
      </Notice>
      <Panel title="Demo data" className="mt-4">
        <p className="px-4 pt-3 text-sm">Storage: <b>{books.storeLabel}</b>. {books.sources.length} source transactions loaded. Resetting replaces this app&apos;s own transactions and added accounts with the demo dataset (confirmation required).</p>
        <ResetButton disabled={books.storeMode === "readonly"} />
      </Panel>
    </>
  );
}
