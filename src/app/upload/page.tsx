import { UploadTester } from "@/components/UploadTester";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { SOURCE_FIELDS } from "@/lib/csvParse";
import { loadBaseChart } from "@/lib/database/csv";
import { TRANSACTION_TYPES } from "@/types/accounting";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  const accounts = loadBaseChart();
  return (
    <>
      <PageHeader title="Upload & Test Your CSV" subtitle="Drop in your own transactions and get the same journal, trial balance, P&L, Balance Sheet and validation - without touching the saved data." />
      <Notice>
        Your file is analysed <b>in your browser</b> and is <b>not saved</b>; the app&apos;s own ledger is not changed. Use the account codes from the Chart of Accounts
        (e.g. 1002 = Bank Account 1) and dates as <code>YYYY-MM-DD</code>. If any row breaks an accounting rule you get the full list of problems instead of statements.
      </Notice>
      <UploadTester accounts={accounts} />
      <Panel title="CSV format guide" className="mt-6">
        <div className="space-y-3 p-4 text-sm">
          <p>Header row (column order does not matter; only the first four are required, the rest can be left out or blank):</p>
          <p><code className="break-all">{Object.keys(SOURCE_FIELDS).join(",")}</code></p>
          <p><b>type</b> must be one of: <code>{TRANSACTION_TYPES.join(", ")}</code>.</p>
          <ul className="list-disc pl-5">
            <li><b>settle</b>: <code>1001</code> cash, <code>1002</code> Bank 1, <code>1003</code> Bank 2, or <code>CREDIT</code> (needs <b>party</b>). For TRANSFER it is the account paid <i>from</i>; <b>to_account</b> is paid <i>to</i>.</li>
            <li><b>SALE / PURCHASE</b>: <code>item</code>, <code>quantity</code>, <code>unit_amount</code> (price before GST), <code>gst_rate</code> (0, 5, 12, 18 or 28). Sales need stock bought earlier (by date).</li>
            <li><b>SERVICE, EXPENSE, ASSET_PURCHASE, PREPAYMENT, CAPITAL, loans…</b>: <code>amount</code> before GST. EXPENSE needs <code>account</code> (e.g. 5102 rent); ASSET_PURCHASE needs <code>account</code> 1600/1610/1620, <code>useful_life_years</code> and <code>residual_value</code>.</li>
            <li><b>LOAN_REPAYMENT / LOAN_RECOVERY</b>: <code>amount</code> is principal; <code>interest_amount</code> is the interest.</li>
            <li><b>COLLECTION / SUPPLIER_PAYMENT</b>: <code>party</code> must match the customer/supplier name used on the credit sale/purchase.</li>
            <li><b>DEPRECIATION and GST_SETTLEMENT</b> need no amount - the engine calculates it. <b>JOURNAL</b>: <code>account</code> = debit, <code>to_account</code> = credit.</li>
            <li>Amounts may contain commas; negative amounts are not allowed.</li>
          </ul>
          <p>Download the blank template or the sample above for working examples.</p>
        </div>
      </Panel>
    </>
  );
}
