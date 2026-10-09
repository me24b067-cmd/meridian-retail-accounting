#!/usr/bin/env bash
# Smoke test a running instance: ./scripts/smoke.sh http://localhost:3000
# Fails (exit 1) if a page is not 200, the books do not balance, or any integrity check fails.
set -u
URL="${1:?usage: smoke.sh <base-url>}"
fail=0
for p in / /accounts /record /upload /transactions /ledger /trial-balance /profit-and-loss /balance-sheet /inventory /fixed-assets /gst /validation /export; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL$p"); echo "$code $p"; [ "$code" = 200 ] || fail=1
done
summary=$(curl -s "$URL/api/summary"); echo "$summary"
echo "$summary" | grep -q '"balanced":true' || fail=1
echo "$summary" | grep -q '"checks":{"passed":27,"total":27,"failed":\[\]}' || fail=1
echo "$summary" | grep -q '"trialBalance":{[^}]*"difference":"0.00"' || fail=1
for f in xlsx trial_balance profit_and_loss balance_sheet validation_results journal_entries source_transactions chart_of_accounts statements; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/api/export/$f"); echo "$code export/$f"; [ "$code" = 200 ] || fail=1
done
fx=$(curl -s -m 10 "$URL/api/fx" | head -c 120); echo "fx: $fx"   # unavailable is acceptable
[ $fail = 0 ] && echo "SMOKE OK" || { echo "SMOKE FAILED"; exit 1; }
