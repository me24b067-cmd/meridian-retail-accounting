import { TransactionForm } from "@/components/forms";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { loadPage, type SearchParams } from "@/lib/page";

export const dynamic = "force-dynamic";

export default async function RecordPage({ searchParams }: { searchParams: SearchParams }) {
  const { books, period } = await loadPage(searchParams);
  return (
    <>
      <PageHeader title="Record Transaction" subtitle="Choose what happened - the engine creates the balanced journal entry. Preview first, then post." />
      <Notice>
        Posted transactions are never edited in place. To correct a mistake, post a reversing <b>Manual journal</b> and then the correct transaction, so the audit trail stays intact.
        Every posting is rejected unless debits equal credits <i>and</i> all {`integrity checks`} still pass.
      </Notice>
      <Panel><TransactionForm readOnly={books.storeMode === "readonly"} accounts={books.accounts.map((a) => ({ code: a.code, name: a.name }))} today={period.end} /></Panel>
    </>
  );
}
