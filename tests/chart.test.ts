import { describe, expect, it } from "vitest";
import { chartMap } from "@/lib/accounting/engine";
import { chart } from "./helpers";

describe("chart of accounts", () => {
  const map = chartMap(chart);
  it("has unique codes and valid normal balances", () => {
    expect(map.size).toBe(chart.length);
    for (const a of chart) {
      const expected = a.type === "asset" || a.type === "expense" ? "debit" : "credit";
      expect(a.normalBalance).toBe(a.isContra ? "credit" : expected);
    }
  });
  it("classifies accumulated depreciation as contra-assets", () => {
    for (const c of ["1601", "1611", "1621"]) {
      expect(map.get(c)).toMatchObject({ type: "asset", isContra: true, normalBalance: "credit" });
    }
  });
  it("contains every mandatory account", () => {
    const names = chart.map((a) => a.name.toLowerCase());
    for (const needle of ["cash in hand", "bank account 1", "bank account 2", "accounts receivable", "inventory", "prepaid rent", "input gst",
      "loan given", "furniture", "computer equipment", "delivery vehicle", "accounts payable", "salaries payable", "bank loan", "output gst",
      "owner's capital", "retained earnings", "current-year profit", "sales revenue", "service income", "interest income", "cost of goods sold",
      "salaries expense", "rent expense", "utilities expense", "advertising expense", "depreciation expense", "bank charges", "interest expense", "other operating"]) {
      expect(names.some((n) => n.includes(needle)), needle).toBe(true);
    }
  });
});
