import type { Account, JournalEntry, PostedLedger } from "@/types/accounting";
import { accumulatedDepreciation } from "./depreciation";
import { InventoryLedger } from "./inventory";
import { ZERO, sum, type Dec } from "./money";
import type { Period } from "./reports";

export interface InventoryItemRow { item: string; quantity: Dec; value: Dec; averageCost: Dec }
export function inventoryReport(posted: PostedLedger, period: Period) {
  const balances = InventoryLedger.balances(posted.inventoryMovements, period.end);
  const items: InventoryItemRow[] = [...balances.entries()].map(([item, p]) => ({
    item, quantity: p.qty, value: p.value, averageCost: p.qty.isZero() ? ZERO : p.value.div(p.qty).toDecimalPlaces(4),
  }));
  const movements = posted.inventoryMovements.filter((m) => m.date <= period.end);
  const soldCost = sum(movements.filter((m) => m.kind === "SALE" && m.date >= period.start).map((m) => m.value));
  return { items, movements, totalValue: sum(items.map((i) => i.value)), cogsInPeriod: soldCost };
}

export interface FixedAssetRow {
  assetId: string; name: string; costAccount: string; purchaseDate: string; cost: Dec; residual: Dec;
  lifeYears: Dec; accumulated: Dec; netBookValue: Dec; annualCharge: Dec;
}
export function fixedAssetReport(posted: PostedLedger, period: Period) {
  const rows: FixedAssetRow[] = posted.assets.filter((a) => a.purchaseDate <= period.end).map((a) => {
    const accumulated = accumulatedDepreciation(posted.depreciation, a.assetId, period.end);
    return {
      assetId: a.assetId, name: a.name, costAccount: a.costAccount, purchaseDate: a.purchaseDate, cost: a.cost, residual: a.residualValue,
      lifeYears: a.usefulLifeYears, accumulated, netBookValue: a.cost.minus(accumulated),
      annualCharge: a.cost.minus(a.residualValue).div(a.usefulLifeYears).toDecimalPlaces(2),
    };
  });
  const schedule = posted.depreciation.filter((d) => d.toDate <= period.end);
  return {
    rows, schedule, totalCost: sum(rows.map((r) => r.cost)), totalAccumulated: sum(rows.map((r) => r.accumulated)),
    totalNetBookValue: sum(rows.map((r) => r.netBookValue)),
    depreciationInPeriod: sum(schedule.filter((d) => d.toDate >= period.start).map((d) => d.amount)),
  };
}

export interface GstRow { date: string; txnId: string; description: string; rate: string; treatment: string; taxableValue: Dec; inputGst: Dec; outputGst: Dec; settled: Dec }
export function gstReport(entries: JournalEntry[], period: Period) {
  const rows: GstRow[] = [];
  let inputOpening = ZERO, outputOpening = ZERO;
  for (const e of entries) {
    if (e.date > period.end) continue;
    const inLines = e.lines.filter((l) => l.accountCode === "1400");
    const outLines = e.lines.filter((l) => l.accountCode === "2200");
    if (!inLines.length && !outLines.length) continue;
    const inputNet = sum(inLines.map((l) => l.debit.minus(l.credit)));
    const outputNet = sum(outLines.map((l) => l.credit.minus(l.debit)));
    if (e.date < period.start) { inputOpening = inputOpening.plus(inputNet); outputOpening = outputOpening.plus(outputNet); continue; }
    const settlement = e.lines.some((l) => l.accountCode === "2200" && l.debit.gt(0));
    const gross = sum(e.lines.filter((l) => l.accountCode !== "1400" && l.accountCode !== "2200" && l.debit.gt(0) && !["1001", "1002", "1003", "1100"].includes(l.accountCode)).map((l) => l.debit));
    rows.push({
      date: e.date, txnId: e.txnId, description: e.description, rate: e.gstRate ?? "", treatment: e.gstTreatment ?? (settlement ? "SETTLEMENT" : ""),
      taxableValue: settlement ? ZERO : gross,
      inputGst: settlement ? ZERO : inputNet, outputGst: settlement ? ZERO : outputNet,
      settled: settlement ? sum(e.lines.filter((l) => l.accountCode === "2200").map((l) => l.debit)) : ZERO,
    });
  }
  const inputClosing = inputOpening.plus(sum(entries.filter((e) => e.date >= period.start && e.date <= period.end).map((e) =>
    sum(e.lines.filter((l) => l.accountCode === "1400").map((l) => l.debit.minus(l.credit))))));
  const outputClosing = outputOpening.plus(sum(entries.filter((e) => e.date >= period.start && e.date <= period.end).map((e) =>
    sum(e.lines.filter((l) => l.accountCode === "2200").map((l) => l.credit.minus(l.debit))))));
  return {
    rows, inputOpening, outputOpening, inputClosing, outputClosing,
    inputRecorded: sum(rows.map((r) => r.inputGst)).plus(0), outputCollected: sum(rows.map((r) => r.outputGst)),
    netPosition: outputClosing.minus(inputClosing),
  };
}

export function accountName(accounts: Account[], code: string): string {
  return accounts.find((a) => a.code === code)?.name ?? code;
}

/** Income, expense and net profit per calendar month inside the period (for the dashboard chart). */
export function monthlySeries(entries: JournalEntry[], accounts: Account[], period: Period) {
  const type = new Map(accounts.map((a) => [a.code, a.type]));
  const months = new Map<string, { month: string; income: number; expenses: number; profit: number }>();
  for (const e of entries) {
    if (e.date < period.start || e.date > period.end) continue;
    const key = e.date.slice(0, 7);
    const m = months.get(key) ?? { month: key, income: 0, expenses: 0, profit: 0 };
    for (const l of e.lines) {
      const t = type.get(l.accountCode);
      if (t === "income") m.income += l.credit.minus(l.debit).toNumber();
      if (t === "expense") m.expenses += l.debit.minus(l.credit).toNumber();
    }
    m.profit = m.income - m.expenses;
    months.set(key, m);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}
