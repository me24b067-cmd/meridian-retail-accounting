import { describe, expect, it } from "vitest";
import { depreciationForSlice } from "@/lib/accounting/depreciation";
import { computeGst, computeGstSettlement } from "@/lib/accounting/gst";
import { InventoryLedger } from "@/lib/accounting/inventory";
import { D } from "@/lib/accounting/money";
import { DEFAULT_CONFIG, type FixedAsset } from "@/types/accounting";

const d = (x: number | string) => new D(x);

describe("inventory (perpetual weighted average)", () => {
  it("averages cost across purchases at different prices", () => {
    const inv = new InventoryLedger();
    inv.purchase("a", "2025-04-01", "X", d(100), d(10000)); // 100/unit
    inv.purchase("b", "2025-05-01", "X", d(100), d(12000)); // 120/unit -> avg 110
    expect(inv.sale("c", "2025-06-01", "X", d(50)).toNumber()).toBe(5500);
    expect(inv.position("X").qty.toNumber()).toBe(150);
    expect(inv.position("X").value.toNumber()).toBe(16500);
  });
  it("sells the last units at exactly the remaining value (no rounding residue)", () => {
    const inv = new InventoryLedger();
    inv.purchase("a", "2025-04-01", "X", d(3), d(100));
    inv.sale("b", "2025-04-02", "X", d(1));
    inv.sale("c", "2025-04-03", "X", d(1));
    inv.sale("d", "2025-04-04", "X", d(1));
    expect(inv.position("X").value.toNumber()).toBe(0);
  });
  it("prevents negative stock unless the override is configured", () => {
    const inv = new InventoryLedger();
    inv.purchase("a", "2025-04-01", "X", d(5), d(500));
    expect(() => inv.sale("b", "2025-04-02", "X", d(6))).toThrow(/Insufficient stock/);
    const lax = new InventoryLedger(true);
    lax.purchase("a", "2025-04-01", "X", d(5), d(500));
    expect(lax.sale("b", "2025-04-02", "X", d(6)).toNumber()).toBe(500);
  });
  it("selling an item with no stock at all is still refused (no cost basis)", () => {
    expect(() => new InventoryLedger(true).sale("a", "2025-04-02", "Y", d(1))).toThrow(/No stock/);
  });
});

describe("straight-line depreciation", () => {
  const asset: FixedAsset = { assetId: "A", name: "Van", costAccount: "1620", accumulatedAccount: "1621", purchaseDate: "2025-04-06", cost: d(730000), usefulLifeYears: d(2), residualValue: d(0) };
  it("pro-rates by days from the purchase date (inclusive) to the period end", () => {
    const s = depreciationForSlice(asset, d(0), null, "2025-06-30"); // 6 Apr..30 Jun = 86 days
    expect(s.days).toBe(86);
    expect(s.amount.toNumber()).toBe(86000); // 730000 / (2*365) = 1000 per day
  });
  it("continues from the previous depreciation date", () => {
    const s = depreciationForSlice(asset, d(86000), "2025-06-30", "2025-09-30");
    expect(s.days).toBe(92);
    expect(s.amount.toNumber()).toBe(92000);
  });
  it("never depreciates below the residual value", () => {
    const capped = { ...asset, residualValue: d(729000) };
    expect(depreciationForSlice(capped, d(500), "2025-06-30", "2030-01-01").amount.toNumber()).toBe(500);
  });
  it("is zero before purchase", () => {
    expect(depreciationForSlice(asset, d(0), null, "2025-04-01").amount.toNumber()).toBe(0);
  });
});

describe("GST calculation", () => {
  it("computes tax on the net value, rounded to paise", () => {
    expect(computeGst(d("333.33"), "18", "", DEFAULT_CONFIG).gst.toString()).toBe("60");
    expect(computeGst(d("100.10"), "5", "TAXABLE", DEFAULT_CONFIG).gst.toString()).toBe("5.01");
  });
  it("infers NON_TAXABLE for a 0% blank treatment", () => {
    expect(computeGst(d(100), "0", "", DEFAULT_CONFIG).treatment).toBe("NON_TAXABLE");
  });
  it("rejects a rate on an exempt supply and unknown treatments", () => {
    expect(() => computeGst(d(100), "18", "EXEMPT", DEFAULT_CONFIG)).toThrow(/0% GST/);
    expect(() => computeGst(d(100), "18", "MAYBE", DEFAULT_CONFIG)).toThrow(/Unknown GST treatment/);
  });
  it("settles output against input and reports cash payable", () => {
    expect(computeGstSettlement(d(500), d(200))).toMatchObject({ utilised: d(200), cashPayable: d(300) });
    expect(computeGstSettlement(d(100), d(400))).toMatchObject({ utilised: d(100), cashPayable: d(0) });
  });
});
