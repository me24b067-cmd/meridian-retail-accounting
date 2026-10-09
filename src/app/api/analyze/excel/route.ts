import { NextResponse } from "next/server";
import { loadBaseChart } from "@/lib/database/csv";
import { WORKBOOK_NAME, buildWorkbook } from "@/lib/exports/excel";
import { MAX_UPLOAD_BYTES, analyzeUpload } from "@/lib/uploadAnalysis";

export const dynamic = "force-dynamic";

/** POST {csv, from?, to?} -> Excel workbook for an uploaded CSV. Stateless: nothing is stored. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_UPLOAD_BYTES * 1.5) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: { csv?: unknown; from?: unknown; to?: unknown };
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  if (typeof body.csv !== "string" || !body.csv.trim()) return NextResponse.json({ error: "Field 'csv' (the file text) is required." }, { status: 400 });
  const result = analyzeUpload(body.csv, loadBaseChart(), {
    start: typeof body.from === "string" ? body.from : undefined, end: typeof body.to === "string" ? body.to : undefined,
  });
  if (result.kind === "fatal") return NextResponse.json({ error: result.message }, { status: 422 });
  if (result.kind === "errors") return NextResponse.json({ error: `${result.problems.length} problem(s) in the file; first: ${result.problems[0].message}` }, { status: 422 });
  const buf = await buildWorkbook(result.books, result.rep);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${WORKBOOK_NAME}"` },
  });
}
