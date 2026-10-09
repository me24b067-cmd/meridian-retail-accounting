# API Research

**Bottom line:** the accounting engine uses reproducible fictional business data and needs **no external API**. One optional, clearly separated integration is included: INR reference exchange rates from Frankfurter, shown on the Dashboard. It is not used in any journal entry, ledger balance or statement, and its failure cannot affect accounting.

Research date: 9 Oct 2026. "Verified" means I made the request myself during this work. "Reported" means taken from a search-result summary (secondary source) and not confirmed. "Not checked" means it reflects my general background knowledge and I did **not** look it up in this session - confirm before relying on it.

## 1. APIs considered

| Candidate | Category | Official docs | Free tier / auth | Relevant to this assignment? | Decision |
|---|---|---|---|---|---|
| **Frankfurter** (ECB reference rates) | Foreign exchange | https://frankfurter.dev (docs also at https://frankfurter.app/docs) | Free, **no API key**, no signup. Verified: a live request to `https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,EUR` returned HTTP 200 with JSON on 9 Oct 2026 (`{"amount":1.0,"base":"USD","date":"2026-10-08","rates":{"EUR":0.89397,"INR":96.78}}`). | Only marginally: the demo business transacts in INR only. Useful as an *optional* reference panel and as the natural starting point if foreign-currency transactions were added later. | **Selected** (optional, display-only) |
| yfinance (Yahoo Finance scraper) | Market prices | https://github.com/ranaroussi/yfinance | No key, but it is an *unofficial* scraper of Yahoo endpoints and can break or be rate-limited without notice (not checked; confirm in the project's README for its personal/educational-use disclaimer). | **No.** The business is a retailer with no securities. Stock prices are not income/expense of Meridian; showing them would only invite confusion with the ledger. | Not used |
| Alpha Vantage / Twelve Data / Finnhub | Market data | Provider sites | Free tiers exist but require an **API key** and have low rate limits (not checked). | No - same reason as yfinance, and keys would break the "no accounts / no keys" requirement. | Not used |
| ExchangeRate-API / Open Exchange Rates | Foreign exchange | Provider sites | Free tiers require a key and/or are rate-limited (not checked). | Same function as Frankfurter, but needs credentials. | Not used (Frankfurter needs none) |
| Public-holiday APIs (e.g. Nager.Date) | Dates | https://date.nager.at | Free, no key (not checked). | No. Reporting periods here are fixed financial-year dates; holidays do not affect any posting rule. | Not used |
| GST rate / tax lookup APIs | Tax | - | I did not find, and did not exhaustively search for, an official free public GST-rate API suitable for an offline educational ledger; commercial GST-suvidha-provider APIs need registration and credentials (not checked in detail). | Would add paid/credentialed dependencies and imply legal accuracy this project does not claim. | Not used; GST rates are an explicit configurable list (`supportedGstRates` in `src/types/accounting.ts`) and are labelled illustrative |

### Facts vs. assumptions
- **Verified:** Frankfurter responds without a key from `api.frankfurter.dev/v1` and returns the JSON shape the code expects (see request above).
- **Reported (not verified):** the exact rate limits and update time of Frankfurter (the data come from the European Central Bank and are published once per working day, around 16:00 CET). Search results disagree on how many currencies are covered and on whether there are formal request caps; the app therefore caches for an hour and makes only 3 requests per refresh.
- **Not claimed:** Frankfurter rates are reference rates, not tradable quotes. The app says so on screen.

## 2. Selected API and why

Frankfurter was chosen because it is the only candidate that is (a) free, (b) keyless, (c) accessible without an account, (d) an official-data-derived source (ECB), and (e) simple (one GET). It adds no secret to manage and nothing to the deployed environment.

## 3. Integration points

| Where | What |
|---|---|
| `src/lib/fx.ts` | `fetchInrRates()` - calls `GET {FX_API_BASE_URL}/latest?base={USD|EUR|GBP}&symbols=INR`. |
| `src/app/api/fx/route.ts` | Thin server route exposing the result to the browser (so the browser never calls a third party directly). |
| `src/components/DashboardCharts.tsx` → `FxPanel` | Dashboard card titled *"External reference data (optional · not part of the ledger)"*. |

The accounting engine (`src/lib/accounting/*`), the exports and the validation checks **do not import** `fx.ts`.

## 4. Error handling, timeouts, caching, fallback

- **Timeout:** 6 seconds per request (`AbortController`); the three currency requests run in parallel.
- **Failures** (network error, non-2xx status, malformed JSON, missing/zero/non-finite `INR` rate) never throw: the function returns `{available:false, message:"Reference rates unavailable (...). The accounting features are unaffected."}` and the panel shows that message. Nothing is invented or estimated.
- **Caching:** successful results are cached in server memory for 1 hour (also limits calls to the free service).
- **Tested** (`tests/integration.test.ts`, "optional FX API never breaks the app"): offline failure, HTTP 503, malformed body, and a successful parse using a *mocked* response. The test does not claim a live fetch.

## 5. Configuration

| Variable | Required | Meaning |
|---|---|---|
| `FX_API_BASE_URL` | No | Defaults to `https://api.frankfurter.dev/v1`. Override only to point at a self-hosted Frankfurter instance. |

No API keys are needed anywhere in this project. See `.env.example`.

## 6. Usage terms
Frankfurter describes itself as a free, open-source API over ECB data; I did not find a stated usage cap on its site, though third-party reviews mention abuse-prevention limits. Check https://frankfurter.dev before any heavy or commercial use.

## 7. Why no yfinance?
The assignment text allows yfinance "only if there is a genuine and clearly explained use case". There is none here: Meridian is a fictional retail trader without investments, so market prices have no accounting meaning. Including them would break the rule that external data must not substitute for ledger transactions. (Also, yfinance is a Python library; this project's deployed stack is TypeScript.)

## 8. Other services researched for deployment (not data APIs)
- **Neon (PostgreSQL):** free plan with no credit card; vendor pages and reviews disagree on storage (0.5 GB vs. 1 GB) and list ~100 compute-hours/month; scale-to-zero after 5 minutes idle. Details to confirm at https://neon.com/pricing. Integrates with Vercel via the Marketplace (https://vercel.com/marketplace/neon), which injects `DATABASE_URL`.
- **Vercel Hobby:** non-commercial/personal use only (https://vercel.com/docs/plans/hobby). Function-duration documentation is inconsistent across pages (10 s default vs. 300 s with Fluid Compute); this app's requests are short, so neither limit matters in practice.
