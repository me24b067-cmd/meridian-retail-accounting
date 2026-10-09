"use client";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card max-w-2xl p-6">
      <h1 className="mb-2 text-xl font-bold fail">Could not build the books</h1>
      <p className="mb-4 text-sm">{error.message}</p>
      <p className="mb-4 text-xs text-[color:var(--muted)]">The accounting engine refuses to produce statements from data it cannot post correctly. Fix the transaction named above, or reset to the demo data.</p>
      <button className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
