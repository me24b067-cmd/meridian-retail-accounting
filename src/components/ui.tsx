import type { ReactNode } from "react";
import { formatINR, type Dec } from "@/lib/accounting/money";
import type { StatementRow } from "@/lib/accounting/reports";

export function Amt({ v, symbol = false }: { v?: Dec | null; symbol?: boolean }) {
  if (v === undefined || v === null) return null;
  return <span className={v.isNegative() && !v.isZero() ? "neg" : ""}>{formatINR(v, { symbol })}</span>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-[color:var(--muted)]">{subtitle}</p>}
      </div>
      <div className="no-print flex gap-2">{children}</div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "good" | "bad" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
      <div className={`mt-1 text-xl font-bold num ${tone === "good" ? "pass" : tone === "bad" ? "fail" : ""}`} style={{ textAlign: "left" }}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-[color:var(--muted)]">{hint}</div>}
    </div>
  );
}

export function Badge({ ok, yes = "PASS", no = "FAIL" }: { ok: boolean; yes?: string; no?: string }) {
  return <span className={ok ? "pass" : "fail"}>{ok ? `✓ ${yes}` : `✗ ${no}`}</span>;
}

export function StatementTable({ rows }: { rows: StatementRow[] }) {
  return (
    <table className="grid">
      <thead><tr><th style={{ width: 80 }}>Code</th><th>Particulars</th><th className="num">Amount (₹)</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.kind === "line" || r.kind === "memo" ? "" : r.kind}>
            <td className="text-[color:var(--muted)]">{r.code}</td>
            <td style={{ paddingLeft: r.kind === "line" ? "1.5rem" : undefined }}>{r.label}</td>
            <td className="num"><Amt v={r.amount} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card overflow-x-auto ${className}`}>
      {title && <h2 className="border-b border-[color:var(--line)] px-4 py-3 text-sm font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "bad" | "good"; children: ReactNode }) {
  const c = tone === "bad" ? "border-red-300 bg-red-50 text-red-900" : tone === "good" ? "border-green-300 bg-green-50 text-green-900" : "border-blue-200 bg-blue-50 text-blue-900";
  return <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function DownloadLinks({ files, from, to }: { files: { file: string; label: string }[]; from: string; to: string }) {
  return (
    <>
      {files.map((f) => (
        <a key={f.file} className="btn secondary" href={`/api/export/${f.file}?from=${from}&to=${to}`}>{f.label}</a>
      ))}
    </>
  );
}
