"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

const NAV = [
  ["/", "Dashboard"], ["/accounts", "Chart of Accounts"], ["/record", "Record Transaction"], ["/transactions", "Transaction Register"],
  ["/ledger", "General Ledger"], ["/trial-balance", "Trial Balance"], ["/profit-and-loss", "Profit and Loss"], ["/balance-sheet", "Balance Sheet"],
  ["/inventory", "Inventory"], ["/fixed-assets", "Fixed Assets & Depreciation"], ["/gst", "GST Summary"], ["/validation", "Accounting Validation"],
  ["/export", "Export & Submission Files"],
] as const;

function Nav() {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["from", "to"]) if (sp.get(k)) keep.set(k, sp.get(k)!);
  const qs = keep.toString() ? `?${keep}` : "";
  return (
    <nav className="mt-4 flex flex-col gap-0.5">
      {NAV.map(([href, label]) => (
        <Link key={href} href={`${href}${qs}`} className={`rounded-md px-3 py-1.5 text-sm ${path === href ? "bg-white/20 font-semibold" : "text-white/80 hover:bg-white/10"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function PeriodPicker() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [from, setFrom] = useState(sp.get("from") ?? "2025-04-01");
  const [to, setTo] = useState(sp.get("to") ?? "2026-03-31");
  return (
    <form
      className="mt-6 space-y-2 text-xs text-white/80"
      onSubmit={(e) => { e.preventDefault(); router.push(`${path}?from=${from}&to=${to}`); }}
    >
      <div className="font-semibold uppercase tracking-wide">Reporting period</div>
      <label className="block">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input mt-0.5 text-black" /></label>
      <label className="block">To (balance sheet date)<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input mt-0.5 text-black" /></label>
      <button className="btn secondary w-full" type="submit">Apply period</button>
    </form>
  );
}

export function Shell({ children, mode }: { children: React.ReactNode; mode: string }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="w-full shrink-0 bg-[color:var(--brand)] p-4 text-white md:w-64">
        <div className="text-lg font-bold leading-tight">Meridian Retail Traders</div>
        <div className="text-xs text-white/70">Double-entry accounting · INR (₹) · FY 2025-26</div>
        <Suspense fallback={null}><Nav /><PeriodPicker /></Suspense>
        <div className="mt-6 rounded-md bg-white/10 p-2 text-[11px] leading-snug text-white/80">
          Storage: {mode}<br />Fictional educational data. GST rates are illustrative, not tax advice.
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
