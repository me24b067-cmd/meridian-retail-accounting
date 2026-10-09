import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { SOURCE_FIELDS } from "@/lib/csvParse";

export const dynamic = "force-dynamic";

const BLANK = [
  "T001,2025-04-01,CAPITAL,Owner introduces capital into Bank Account 1,,,,,,,500000,,,,1002,,,,,",
  "T002,2025-04-05,PURCHASE,Buy 100 widgets on credit,Acme Supplies,,,WID,100,50,,18,,,CREDIT,,,,,",
  "T003,2025-04-10,SALE,Sell 40 widgets for cash to a customer,Walk-in,,,WID,40,90,,18,,,1002,,,,,",
  "T004,2025-04-15,SUPPLIER_PAYMENT,Pay Acme Supplies part of the invoice,Acme Supplies,,,,,,3000,,,,1002,,,,,",
  "T005,2025-04-30,EXPENSE,Shop rent for April,Landlord,,,,,,10000,18,,5102,1002,,,,,",
].join("\n");

/** GET /api/template?kind=blank|sample - a correctly formatted starting file for the upload tester. */
export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  const body = kind === "sample"
    ? fs.readFileSync(path.join(process.cwd(), "data", "sample_transactions.csv"), "utf8")
    : `${Object.keys(SOURCE_FIELDS).join(",")}\n${BLANK}\n`;
  return new NextResponse(body, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind === "sample" ? "sample_transactions.csv" : "transactions_template.csv"}"` },
  });
}
