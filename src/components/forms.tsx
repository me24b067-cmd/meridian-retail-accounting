"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Json = Record<string, string>;
async function send(url: string, body: Json) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export function AddAccountForm({ readOnly }: { readOnly: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form className="grid gap-3 p-4 md:grid-cols-5" onSubmit={async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.currentTarget)) as Json;
      try { await send("/api/accounts", f); setMsg({ ok: true, text: `Account ${f.code} added.` }); router.refresh(); } catch (err) { setMsg({ ok: false, text: (err as Error).message }); }
    }}>
      <label className="field">Code (4 digits)<input name="code" className="input" required pattern="\d{4}" /></label>
      <label className="field md:col-span-2">Name<input name="name" className="input" required /></label>
      <label className="field">Type<select name="type" className="input"><option>asset</option><option>liability</option><option>equity</option><option>income</option><option>expense</option></select></label>
      <label className="field">Group<input name="group" className="input" required defaultValue="Other" /></label>
      <div className="md:col-span-5 flex items-center gap-3">
        <button className="btn" disabled={readOnly}>Add account</button>
        {readOnly && <span className="text-sm text-[color:var(--muted)]">Read-only deployment: set DATABASE_URL to enable.</span>}
        {msg && <span className={msg.ok ? "pass text-sm" : "fail text-sm"}>{msg.text}</span>}
      </div>
    </form>
  );
}

const BANKS = [["1001", "Cash in Hand"], ["1002", "Bank Account 1"], ["1003", "Bank Account 2"]];
const PAY = [...BANKS, ["CREDIT", "On credit (receivable / payable)"]];

type FieldKey = "party" | "item" | "quantity" | "unitAmount" | "amount" | "gst" | "settle" | "settleCredit" | "toAccount" | "account" | "interestAmount" | "deductionAmount" | "asset" | "journal";
const FORM: Record<string, { label: string; help: string; fields: FieldKey[] }> = {
  CAPITAL: { label: "Owner capital introduced", help: "Dr cash/bank, Cr Owner's Capital", fields: ["amount", "settle"] },
  TRANSFER: { label: "Transfer between cash/bank accounts", help: "Not income or expense. 'Paid from' → 'To account'", fields: ["amount", "settle", "toAccount"] },
  PURCHASE: { label: "Inventory purchase", help: "Dr Inventory (net) + Input GST, Cr bank/cash or Accounts Payable", fields: ["party", "item", "quantity", "unitAmount", "gst", "settleCredit"] },
  SALE: { label: "Sale of goods", help: "Dr cash/bank or Receivable, Cr Sales + Output GST; COGS from weighted average", fields: ["party", "item", "quantity", "unitAmount", "gst", "settleCredit"] },
  SERVICE: { label: "Service income", help: "Dr cash/bank or Receivable, Cr Service Income + Output GST", fields: ["party", "amount", "gst", "settleCredit"] },
  COLLECTION: { label: "Customer collection", help: "Dr cash/bank, Cr Accounts Receivable (no new revenue)", fields: ["party", "amount", "settle"] },
  SUPPLIER_PAYMENT: { label: "Supplier payment", help: "Dr Accounts Payable, Cr cash/bank (no new expense)", fields: ["party", "amount", "settle"] },
  EXPENSE: { label: "Operating expense", help: "Dr expense (net) + Input GST, Cr cash/bank or Payable", fields: ["party", "account", "amount", "gst", "settleCredit"] },
  ASSET_PURCHASE: { label: "Fixed asset purchase", help: "Capitalised (Dr asset cost + Input GST); depreciation set by life & residual", fields: ["asset", "party", "amount", "gst", "settleCredit"] },
  PREPAYMENT: { label: "Prepaid rent paid in advance", help: "Dr Prepaid Rent (asset) + Input GST", fields: ["party", "amount", "gst", "settleCredit"] },
  PREPAID_RELEASE: { label: "Release prepaid rent to expense", help: "Dr Rent Expense, Cr Prepaid Rent", fields: ["amount"] },
  DEPRECIATION: { label: "Post depreciation to this date", help: "Computed by the engine from the asset register - no amount needed", fields: [] },
  SALARY_ACCRUAL: { label: "Salary accrual", help: "Dr Salaries Expense, Cr Salaries Payable (+ TDS/PF payable)", fields: ["amount", "deductionAmount"] },
  SALARY_PAYMENT: { label: "Salary / statutory deposit payment", help: "Dr liability (2002 or 2300), Cr cash/bank", fields: ["account", "amount", "settle"] },
  LOAN_RECEIVED: { label: "Loan received (availed)", help: "Dr cash/bank, Cr Bank Loan (liability, not income)", fields: ["party", "amount", "settle"] },
  LOAN_REPAYMENT: { label: "Loan repayment", help: "Principal reduces the loan; interest is expensed separately", fields: ["amount", "interestAmount", "settle"] },
  LOAN_GIVEN: { label: "Loan given", help: "Dr Loan Given (asset), Cr cash/bank", fields: ["party", "amount", "settle"] },
  LOAN_RECOVERY: { label: "Loan recovery", help: "Principal reduces Loan Given; interest is Interest Income", fields: ["party", "amount", "interestAmount", "settle"] },
  INTEREST_INCOME: { label: "Interest income received", help: "Dr cash/bank, Cr Interest Income", fields: ["amount", "settle"] },
  GST_SETTLEMENT: { label: "GST settlement", help: "Output GST set off against input credit; any shortfall paid from the account chosen", fields: ["settle"] },
  JOURNAL: { label: "Manual journal (adjustment / correction)", help: "Dr one account, Cr another. Use to reverse or correct a posted entry.", fields: ["journal", "amount"] },
};

const EXPENSES = [["5101", "5101 Salaries"], ["5102", "5102 Rent"], ["5103", "5103 Utilities"], ["5104", "5104 Advertising"], ["5106", "5106 Bank Charges"], ["5108", "5108 Other Operating"]];

export function TransactionForm({ readOnly, accounts, today }: { readOnly: boolean; accounts: { code: string; name: string }[]; today: string }) {
  const router = useRouter();
  const [type, setType] = useState("EXPENSE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ saved: boolean; txnId: string; lines: { accountCode: string; accountName: string; debit: string; credit: string }[] } | null>(null);
  const spec = FORM[type];
  const has = (k: FieldKey) => spec.fields.includes(k);

  async function submit(e: React.FormEvent<HTMLFormElement>, dryRun: boolean) {
    e.preventDefault();
    const form = (e.currentTarget as unknown as HTMLButtonElement).form!;
    if (!form.reportValidity()) return;
    setBusy(true); setError(null); setResult(null);
    const f = Object.fromEntries(new FormData(form)) as Json;
    const body: Json = { ...f, type };
    if (f.debitAccount) body.account = f.debitAccount;
    if (f.creditAccount) body.toAccount = f.creditAccount;
    try {
      const data = await send(`/api/transactions${dryRun ? "?dryRun=1" : ""}`, body);
      setResult(data);
      if (!dryRun) router.refresh();
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const select = (name: string, options: string[][], label: string, def?: string) => (
    <label className="field">{label}<select name={name} className="input" defaultValue={def}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  );
  const input = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">{label}<input name={name} className="input" {...props} /></label>
  );
  const rate = [["0", "0%"], ["5", "5%"], ["12", "12%"], ["18", "18%"], ["28", "28%"]];

  return (
    <form className="p-4" key={type} onSubmit={(e) => e.preventDefault()}>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="field md:col-span-2">Transaction type
          <select className="input" value={type} onChange={(e) => { setType(e.target.value); setResult(null); setError(null); }}>
            {Object.entries(FORM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {input("date", "Date", { type: "date", required: true, defaultValue: today })}
        {input("reference", "Reference (optional)")}
        <p className="md:col-span-4 text-xs text-[color:var(--muted)]">{spec.help}</p>
        <label className="field md:col-span-4">Description<input name="description" className="input" required placeholder="What happened?" /></label>
        {has("party") && input("party", "Customer / supplier / party")}
        {has("item") && select("item", [["CHG", "CHG - USB Fast Charger"], ["BAG", "BAG - Laptop Backpack"], ["LMP", "LED Desk Lamp (LMP)"]], "Inventory item")}
        {has("asset") && input("item", "Asset name", { required: true })}
        {has("asset") && select("account", [["1600", "1600 Furniture and Fixtures"], ["1610", "1610 Computer Equipment"], ["1620", "1620 Delivery Vehicle"]], "Asset class")}
        {has("asset") && input("usefulLifeYears", "Useful life (years)", { type: "number", step: "0.5", min: "0.5", defaultValue: "5", required: true })}
        {has("asset") && input("residualValue", "Residual value (₹)", { type: "number", step: "0.01", min: "0", defaultValue: "0" })}
        {has("quantity") && input("quantity", "Quantity", { type: "number", step: "1", min: "1", required: true })}
        {has("unitAmount") && input("unitAmount", type === "SALE" ? "Selling price per unit (ex-GST ₹)" : "Cost per unit (ex-GST ₹)", { type: "number", step: "0.01", min: "0.01", required: true })}
        {has("amount") && input("amount", type === "LOAN_REPAYMENT" || type === "LOAN_RECOVERY" ? "Principal (₹)" : type === "SALARY_ACCRUAL" ? "Gross salary (₹)" : "Amount (₹, ex-GST)", { type: "number", step: "0.01", min: "0.01", required: true })}
        {has("interestAmount") && input("interestAmount", "Interest (₹)", { type: "number", step: "0.01", min: "0", defaultValue: "0" })}
        {has("deductionAmount") && input("deductionAmount", "TDS/PF withheld (₹)", { type: "number", step: "0.01", min: "0", defaultValue: "0" })}
        {has("gst") && select("gstRate", rate, "GST rate", "18")}
        {has("gst") && select("gstTreatment", [["", "Auto (taxable if rate > 0)"], ["TAXABLE", "Taxable"], ["EXEMPT", "Exempt (0%)"], ["NON_TAXABLE", "Non-taxable (0%)"]], "GST treatment")}
        {has("account") && type === "EXPENSE" && select("account", EXPENSES, "Expense category")}
        {has("account") && type === "SALARY_PAYMENT" && select("account", [["2002", "2002 Salaries Payable"], ["2300", "2300 TDS and PF Payable"]], "Liability being paid")}
        {has("journal") && select("debitAccount", accounts.filter((a) => a.code !== "3003").map((a) => [a.code, `${a.code} ${a.name}`]), "Debit account")}
        {has("journal") && select("creditAccount", accounts.filter((a) => a.code !== "3003").map((a) => [a.code, `${a.code} ${a.name}`]), "Credit account", "1001")}
        {has("settle") && select("settle", BANKS, type === "TRANSFER" ? "Paid from" : type === "CAPITAL" || type === "COLLECTION" || type === "LOAN_RECEIVED" || type === "LOAN_RECOVERY" || type === "INTEREST_INCOME" ? "Received into" : "Paid from", "1002")}
        {has("settleCredit") && select("settle", PAY, "Settlement", "1002")}
        {has("toAccount") && select("toAccount", BANKS, "To account", "1003")}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button className="btn secondary" disabled={busy} onClick={(e) => submit(e as unknown as React.FormEvent<HTMLFormElement>, true)}>Preview journal entry</button>
        <button className="btn" disabled={busy || readOnly} onClick={(e) => submit(e as unknown as React.FormEvent<HTMLFormElement>, false)}>Post transaction</button>
        {readOnly && <span className="text-sm text-[color:var(--muted)]">Read-only deployment: preview works; posting needs DATABASE_URL.</span>}
      </div>
      {error && <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><b>Rejected:</b> {error}</div>}
      {result && (
        <div className="mt-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm">
          <b className="pass">{result.saved ? `Posted ${result.txnId}` : `Preview of ${result.txnId} (not saved)`}</b> - resulting journal entry:
          <table className="grid mt-2"><thead><tr><th>Account</th><th className="num">Debit</th><th className="num">Credit</th></tr></thead>
            <tbody>{result.lines.map((l, i) => <tr key={i}><td>{l.accountCode} {l.accountName}</td><td className="num">{Number(l.debit) ? l.debit : ""}</td><td className="num">{Number(l.credit) ? l.credit : ""}</td></tr>)}</tbody></table>
        </div>
      )}
    </form>
  );
}

export function ResetButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3 p-4">
      <button className="btn secondary" disabled={disabled} onClick={async () => {
        if (!window.confirm("Replace ALL transactions in this app with the demo dataset? Transactions you added will be removed.")) return;
        try { const d = await send("/api/reset", { confirm: "RESET" }); setMsg(`Demo dataset loaded (${d.transactions} transactions).`); router.refresh(); } catch (e) { setMsg((e as Error).message); }
      }}>Reset to demo dataset</button>
      {msg && <span className="text-sm">{msg}</span>}
    </div>
  );
}
