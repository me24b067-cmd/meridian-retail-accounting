import { NextResponse } from "next/server";
import { fetchInrRates } from "@/lib/fx";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(await fetchInrRates());
}
