import { NextResponse } from "next/server";
import { buildReports, loadBooks, resolvePeriod } from "@/lib/books";
import { CSV_FILES, csvFor, type CsvFile } from "@/lib/exports/csv";
import { WORKBOOK_NAME, buildWorkbook } from "@/lib/exports/excel";
import { statementsMarkdown } from "@/lib/exports/markdown";

export const dynamic = "force-dynamic";

/** GET /api/export/xlsx | statements | <csv name>?from=&to= - always built from the same engine output as the screens. */
export async function GET(req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const u = new URL(req.url);
  const books = await loadBooks();
  const rep = buildReports(books, resolvePeriod({ from: u.searchParams.get("from") ?? undefined, to: u.searchParams.get("to") ?? undefined }));
  if (file === "xlsx") {
    const buf = await buildWorkbook(books, rep);
    return new NextResponse(new Uint8Array(buf), {
      headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${WORKBOOK_NAME}"` },
    });
  }
  if (file === "statements") {
    return new NextResponse(statementsMarkdown(books, rep), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": 'attachment; filename="Financial_Statements.md"' } });
  }
  if ((CSV_FILES as readonly string[]).includes(file)) {
    return new NextResponse(csvFor(file as CsvFile, books, rep), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${file}.csv"` } });
  }
  return NextResponse.json({ error: `Unknown export "${file}"` }, { status: 404 });
}
