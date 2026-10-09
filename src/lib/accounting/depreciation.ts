import type { DepreciationRecord, FixedAsset } from "@/types/accounting";
import { D, ZERO, money, type Dec } from "./money";
import { daysBetween } from "./journal";

/** Cost-account -> accumulated-depreciation-account mapping for the three fixed-asset classes. */
export const ACCUMULATED_ACCOUNT: Record<string, string> = { "1600": "1601", "1610": "1611", "1620": "1621" };
export const DAYS_IN_YEAR = 365;

/**
 * Straight-line, daily pro-rata:
 *   depreciation = (cost - residual) / (useful life * 365) * days in the slice
 * The first slice starts on the purchase date (that day counts); later slices start the day after the previous
 * depreciation date. Total depreciation is capped so the net book value never drops below the residual value.
 */
export function depreciationForSlice(asset: FixedAsset, alreadyDepreciated: Dec, throughDate: string | null, toDate: string): { days: number; amount: Dec; fromDate: string } {
  const from = throughDate ?? previousDay(asset.purchaseDate);
  const days = daysBetween(from, toDate);
  if (days <= 0) return { days: 0, amount: ZERO, fromDate: from };
  const depreciable = asset.cost.minus(asset.residualValue);
  const raw = money(depreciable.times(days).div(asset.usefulLifeYears.times(DAYS_IN_YEAR)));
  const remaining = depreciable.minus(alreadyDepreciated);
  return { days, amount: D.max(ZERO, D.min(raw, remaining)), fromDate: from };
}

function previousDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export function accumulatedDepreciation(records: DepreciationRecord[], assetId: string, asOf?: string): Dec {
  return records
    .filter((r) => r.assetId === assetId && (!asOf || r.toDate <= asOf))
    .reduce((acc, r) => acc.plus(r.amount), ZERO);
}
