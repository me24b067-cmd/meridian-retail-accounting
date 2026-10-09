import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { addCustomAccount } from "@/lib/books";
import { ReadOnlyError } from "@/lib/database/store";
import { AccountingError } from "@/types/accounting";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    return NextResponse.json(await addCustomAccount(await req.json()));
  } catch (e) {
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => i.message).join("; ") }, { status: 400 });
    if (e instanceof AccountingError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof ReadOnlyError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("POST /api/accounts failed", e);
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
