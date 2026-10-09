import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { postNewTransaction } from "@/lib/books";
import { ReadOnlyError } from "@/lib/database/store";
import { AccountingError } from "@/types/accounting";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";
  try {
    const body = await req.json();
    return NextResponse.json(await postNewTransaction(body, { dryRun }));
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
    if (e instanceof AccountingError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof ReadOnlyError) return NextResponse.json({ error: e.message }, { status: 503 });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
    console.error("POST /api/transactions failed", e);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
