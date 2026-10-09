"use client";
import { useMemo, useRef, useState } from "react";
import { Amt, Badge, Notice, Panel, StatementTable, Stat } from "@/components/ui";
import { CSV_FILES, csvFor, type CsvFile } from "@/lib/exports/csv";
import { formatINR } from "@/lib/accounting/money";
import { MAX_UPLOAD_BYTES, analyzeUpload } from "@/lib/uploadAnalysis";
import type { Account } from "@/types/accounting";

const TABS = ["Balance Sheet", "Profit and Loss", "Trial Balance", "Validation", "Journal entries"] as const;
type Tab = (typeof TABS)[number];

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function UploadTester({ accounts }: { accounts: Account[] }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState<Tab>("Balance Sheet");
  const [dragging, setDragging] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const result = useMemo(() => (text === null ? null : analyzeUpload(text, accounts, { start: from || undefined, end: to || undefined })), [text, accounts, from, to]);

  async function load(file: File | undefined) {
    setReadError(null);
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) { setReadError(`"${file.name}" is larger than ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`); return; }
    if (!/\.(csv|txt)$/i.test(file.name) && file.type && !file.type.includes("text") && !file.type.includes("csv") && !file.type.includes("excel")) {
      setReadError(`"${file.name}" does not look like a CSV file.`); return;
    }
    setFrom(""); setTo("");
    setFileName(file.name);
    setText(await file.text());
  }

  async function loadSample() {
    const res = await fetch("/api/template?kind=sample");
    setFrom(""); setTo(""); setFileName("sample_transactions.csv (built-in demo)");
    setText(await res.text());
  }

  async function downloadExcel() {
    if (!text || result?.kind !== "ok") return;
    setBusy(true);
    try {
      const res = await fetch("/api/analyze/excel", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv: text, from: result.period.start, to: result.period.end }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Excel export failed (${res.status})`);
      download("Uploaded_Accounting_Report.xlsx", await res.blob(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (e) { setReadError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); void load(e.dataTransfer.files[0]); }}
        onClick={() => input.current?.click()}
        role="button" tabIndex={0} aria-label="Drop a CSV file here or click to choose one"
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
        className={`card cursor-pointer border-2 border-dashed p-10 text-center transition ${dragging ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)]" : "border-[#c7d0dd]"}`}
      >
        <div className="text-3xl">⬆</div>
        <div className="mt-2 text-lg font-semibold">Drag &amp; drop your transactions CSV here</div>
        <div className="text-sm text-[color:var(--muted)]">or click to choose a file (max 2 MB, 5,000 rows)</div>
        {fileName && <div className="mt-3 text-sm">Loaded: <b>{fileName}</b></div>}
        <input ref={input} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { void load(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="no-print mt-3 flex flex-wrap gap-2">
        <button className="btn secondary" onClick={() => void loadSample()}>Try with the built-in sample</button>
        <a className="btn secondary" href="/api/template?kind=blank">Download blank template</a>
        <a className="btn secondary" href="/api/template?kind=sample">Download sample CSV</a>
        {text !== null && <button className="btn secondary" onClick={() => { setText(null); setFileName(""); setReadError(null); }}>Clear</button>}
      </div>
      {readError && <div className="mt-4"><Notice tone="bad">{readError}</Notice></div>}

      {result?.kind === "fatal" && <div className="mt-4"><Notice tone="bad"><b>Could not use this file.</b> {result.message}</Notice></div>}

      {result?.kind === "errors" && (
        <div className="mt-4">
          <Notice tone="bad"><b>{result.problems.length} problem(s) found in {result.rows} rows.</b> No statements are produced until every row posts correctly. Row numbers match your spreadsheet (header = row 1). A problem in one row can cause follow-on problems in later rows (for example a payment for a sale that was rejected).</Notice>
          <Panel>
            <table className="grid">
              <thead><tr><th>Row</th><th>Txn ID</th><th>Problem</th></tr></thead>
              <tbody>{result.problems.map((p, i) => <tr key={i}><td>{p.row}</td><td>{p.txnId}</td><td>{p.message.replace(/^\[[^\]]*\]\s*/, "")}</td></tr>)}</tbody>
            </table>
          </Panel>
        </div>
      )}

      {result?.kind === "ok" && (() => {
        const { rep, books, period } = result;
        const f = rep.financials, bs = f.balanceSheet, tb = f.trialBalance;
        const failed = rep.checks.filter((c) => !c.passed);
        return (
          <div className="mt-5">
            <Notice tone={failed.length ? "bad" : "good"}>
              {failed.length
                ? <><Badge ok={false} no="VALIDATION FAILED" /> {failed.map((c) => `${c.id} (diff ${c.difference.toFixed(2)})`).join(", ")}</>
                : <><Badge ok yes="ALL CHECKS PASS" /> {rep.checks.length} integrity checks passed · Balance Sheet difference {formatINR(bs.difference)}</>}
              {" "}· Processed in your browser; the file was not saved.
            </Notice>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Rows → journal entries" value={`${books.sources.length} → ${books.posted.entries.length}`} />
              <Stat label="Total assets" value={formatINR(bs.totalAssets)} />
              <Stat label="Total liabilities" value={formatINR(bs.totalLiabilities)} />
              <Stat label="Total equity" value={formatINR(bs.totalEquity)} />
              <Stat label="Net profit" value={formatINR(f.profitAndLoss.netProfit)} tone={f.profitAndLoss.netProfit.isNegative() ? "bad" : "good"} />
              <Stat label="Balance sheet difference" value={formatINR(bs.difference)} tone={bs.balanced ? "good" : "bad"} hint={bs.balanced ? "PASS" : "FAIL"} />
            </div>

            <div className="no-print mt-4 flex flex-wrap items-end gap-3">
              <label className="field">Period from<input type="date" className="input" value={from || period.start} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="field">To (balance sheet date)<input type="date" className="input" value={to || period.end} onChange={(e) => setTo(e.target.value)} /></label>
              <span className="text-xs text-[color:var(--muted)]">Defaults to the financial year(s) covering your dates.</span>
            </div>

            <div className="no-print mt-4 flex flex-wrap gap-2">
              {TABS.map((t) => <button key={t} className={`btn ${t === tab ? "" : "secondary"}`} onClick={() => setTab(t)}>{t}</button>)}
            </div>

            <div className="mt-3">
              {tab === "Balance Sheet" && <Panel><StatementTable rows={bs.rows} /></Panel>}
              {tab === "Profit and Loss" && <Panel><StatementTable rows={f.profitAndLoss.rows} /></Panel>}
              {tab === "Trial Balance" && (
                <Panel>
                  <table className="grid">
                    <thead><tr><th>Code</th><th>Account</th><th className="num">Debit (₹)</th><th className="num">Credit (₹)</th></tr></thead>
                    <tbody>
                      {tb.rows.map((r) => <tr key={r.code}><td>{r.code}</td><td>{r.name}</td><td className="num">{r.debit.gt(0) && <Amt v={r.debit} />}</td><td className="num">{r.credit.gt(0) && <Amt v={r.credit} />}</td></tr>)}
                      <tr className="total"><td></td><td>Total</td><td className="num"><Amt v={tb.totalDebit} /></td><td className="num"><Amt v={tb.totalCredit} /></td></tr>
                      <tr className="subtotal"><td></td><td>Difference</td><td className="num" colSpan={2}><Amt v={tb.difference} /></td></tr>
                    </tbody>
                  </table>
                </Panel>
              )}
              {tab === "Validation" && (
                <Panel>
                  <table className="grid">
                    <thead><tr><th>ID</th><th>Check</th><th className="num">Expected</th><th className="num">Actual</th><th className="num">Difference</th><th>Result</th></tr></thead>
                    <tbody>{rep.checks.map((c) => <tr key={c.id}><td>{c.id}</td><td>{c.name}<div className="text-xs text-[color:var(--muted)]">{c.detail}</div></td><td className="num"><Amt v={c.expected} /></td><td className="num"><Amt v={c.actual} /></td><td className="num"><Amt v={c.difference} /></td><td><Badge ok={c.passed} /></td></tr>)}</tbody>
                  </table>
                </Panel>
              )}
              {tab === "Journal entries" && (
                <Panel title={`Journal entries (${books.posted.entries.length}) - first 200 shown; download the CSV for all`}>
                  <table className="grid">
                    <thead><tr><th>Date</th><th>Txn</th><th>Description</th><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
                    <tbody>
                      {books.posted.entries.slice(0, 200).flatMap((e) => e.lines.map((l, i) => (
                        <tr key={`${e.id}-${i}`}><td>{i === 0 ? e.date : ""}</td><td>{i === 0 ? e.txnId : ""}</td><td>{i === 0 ? e.description : ""}</td>
                          <td>{l.accountCode} {books.accounts.find((a) => a.code === l.accountCode)?.name}</td>
                          <td className="num">{l.debit.gt(0) && <Amt v={l.debit} />}</td><td className="num">{l.credit.gt(0) && <Amt v={l.credit} />}</td></tr>
                      )))}
                    </tbody>
                  </table>
                </Panel>
              )}
            </div>

            <div className="no-print mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Download:</span>
              <button className="btn" disabled={busy} onClick={() => void downloadExcel()}>{busy ? "Building…" : "Excel workbook"}</button>
              {CSV_FILES.filter((c) => c !== "source_transactions").map((c) => (
                <button key={c} className="btn secondary" onClick={() => download(`${c}.csv`, csvFor(c as CsvFile, books, rep), "text/csv")}>{c.replace(/_/g, " ")}.csv</button>
              ))}
              <span className="w-full text-xs text-[color:var(--muted)]">The Excel button sends your CSV to this server only to build the file; it is not stored.</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
