/**
 * OPTIONAL external reference data: INR exchange rates from the Frankfurter API (European Central Bank reference rates).
 * It is shown on the dashboard as clearly labelled market information. It is NEVER used in any journal entry or statement,
 * and the accounting engine never imports this module. Failure (offline, timeout, bad response) returns { available: false }.
 */
export interface FxResult {
  available: boolean;
  source: string;
  asOf?: string;
  base: string;
  rates: Record<string, number>; // INR per 1 unit of base-currency (e.g. INR per USD)
  message?: string;
}

const CURRENCIES = ["USD", "EUR", "GBP"];
const TIMEOUT_MS = 6000;
let cache: { at: number; value: FxResult } | undefined;
const TTL_MS = 60 * 60 * 1000;

export async function fetchInrRates(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<FxResult> {
  const base = (process.env.FX_API_BASE_URL || "https://api.frankfurter.dev/v1").replace(/\/$/, "");
  if (cache && now - cache.at < TTL_MS && fetchImpl === fetch) return cache.value;
  const unavailable = (message: string): FxResult => ({ available: false, source: "Frankfurter (ECB reference rates)", base: "INR", rates: {}, message });
  try {
    // One request per currency, in parallel, each with its own timeout.
    const results = await Promise.all(CURRENCIES.map(async (cur) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetchImpl(`${base}/latest?base=${cur}&symbols=INR`, { signal: ctrl.signal, headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { date?: string; rates?: { INR?: number } };
        const inr = body.rates?.INR;
        if (typeof inr !== "number" || !Number.isFinite(inr) || inr <= 0) throw new Error("Unexpected response shape");
        return { cur, inr, date: body.date };
      } finally {
        clearTimeout(timer);
      }
    }));
    const rates = Object.fromEntries(results.map((r) => [r.cur, r.inr]));
    const asOf = results.find((r) => r.date)?.date;
    const value: FxResult = { available: true, source: "Frankfurter (ECB reference rates)", asOf, base: "INR", rates };
    if (fetchImpl === fetch) cache = { at: now, value };
    return value;
  } catch (e) {
    return unavailable(`Reference rates unavailable (${(e as Error).message}). The accounting features are unaffected.`);
  }
}
