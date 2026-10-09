import { describe, expect, it } from "vitest";
import { chartMap } from "@/lib/accounting/engine";
import { credit, debit, validateJournalEntry } from "@/lib/accounting/journal";
import { formatINR, money, toDecimal } from "@/lib/accounting/money";
import type { JournalEntry } from "@/types/accounting";
import { chart } from "./helpers";

const map = chartMap(chart);
const entry = (lines: JournalEntry["lines"], over: Partial<JournalEntry> = {}): JournalEntry => ({
  id: "JE-1", txnId: "T1", date: "2025-04-01", reference: "R", description: "d", category: "c", lines, ...over,
});

describe("journal entry validation", () => {
  it("accepts a balanced entry", () => {
    expect(() => validateJournalEntry(entry([debit("1001", 100), credit("3001", 100)]), map)).not.toThrow();
  });
  it("rejects an unbalanced entry with a clear message", () => {
    expect(() => validateJournalEntry(entry([debit("1001", 100), credit("3001", 99.99)]), map)).toThrow(/Unbalanced entry.*difference 0\.01/);
  });
  it("rejects an invalid account code", () => {
    expect(() => validateJournalEntry(entry([debit("9999", 10), credit("3001", 10)]), map)).toThrow(/Unknown account code "9999"/);
  });
  it("rejects a line with both debit and credit or neither", () => {
    const both = { accountCode: "1001", debit: money(5), credit: money(5) };
    expect(() => validateJournalEntry(entry([both, credit("3001", 0.01)]), map)).toThrow(/exactly one/);
  });
  it("rejects fewer than two lines, bad dates, and blank descriptions", () => {
    expect(() => validateJournalEntry(entry([debit("1001", 1)]), map)).toThrow(/at least two/);
    expect(() => validateJournalEntry(entry([debit("1001", 1), credit("3001", 1)], { date: "2025-02-30" }), map)).toThrow(/Invalid date/);
    expect(() => validateJournalEntry(entry([debit("1001", 1), credit("3001", 1)], { description: " " }), map)).toThrow(/Description/);
  });
  it("supports multi-line entries (compound journal)", () => {
    expect(() => validateJournalEntry(entry([debit("1002", 118), credit("4001", 100), credit("2200", 18)]), map)).not.toThrow();
  });
});

describe("decimal money", () => {
  it("avoids floating-point drift", () => {
    expect(toDecimal("0.1").plus(toDecimal("0.2")).toString()).toBe("0.3");
  });
  it("rounds half-up to 2 places", () => {
    expect(money("1.005").toString()).toBe("1.01");
    expect(money("2.344").toString()).toBe("2.34");
  });
  it("formats rupees with Indian grouping and brackets for negatives", () => {
    expect(formatINR("1234567.5")).toBe("₹12,34,567.50");
    expect(formatINR("-500")).toBe("(₹500.00)");
  });
  it("rejects non-numeric input", () => {
    expect(() => toDecimal("abc", "amount")).toThrow(/Invalid number for amount/);
  });
});
