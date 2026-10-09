import { NextResponse } from "next/server";
import { resetDemo } from "@/lib/books";
import { ReadOnlyError } from "@/lib/database/store";

export const dynamic = "force-dynamic";

/**
 * Demo-only reset: replaces this app's own transactions with the bundled demo dataset.
 * Requires the body {"confirm":"RESET"}; on a deployed (production) instance it is disabled unless DEMO_RESET_ENABLED=true.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.DEMO_RESET_ENABLED !== "true") {
    return NextResponse.json({ error: "Demo reset is disabled on this deployment (set DEMO_RESET_ENABLED=true to allow it)." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "RESET") return NextResponse.json({ error: 'Send {"confirm":"RESET"} to confirm.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, transactions: await resetDemo() });
  } catch (e) {
    if (e instanceof ReadOnlyError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("reset failed", e);
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
