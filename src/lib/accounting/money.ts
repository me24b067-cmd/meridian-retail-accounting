import Decimal from "decimal.js";

/** Decimal with fixed settings: exact arithmetic, half-up rounding at 2 places. */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;

export const ZERO = new D(0);

export function toDecimal(value: string | number | Dec, field = "amount"): Dec {
  const text = typeof value === "string" ? value.trim().replace(/,/g, "") : value;
  if (text === "" || text === undefined || text === null) return ZERO;
  try {
    const d = new D(text);
    if (!d.isFinite()) throw new Error("not finite");
    return d;
  } catch {
    throw new Error(`Invalid number for ${field}: "${String(value)}"`);
  }
}

/** Round to paise (2 decimal places), half-up. */
export function money(value: Dec | string | number): Dec {
  return new D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: Dec[]): Dec {
  return values.reduce((a, b) => a.plus(b), ZERO);
}

/** "1,23,456.78" - Indian digit grouping, always 2 decimals, negatives in parentheses. */
export function formatINR(value: Dec | string | number, opts: { symbol?: boolean; parens?: boolean } = {}): string {
  const { symbol = true, parens = true } = opts;
  const d = money(value);
  const fixed = d.abs().toFixed(2);
  const [intPart, frac] = fixed.split(".");
  let grouped: string;
  if (intPart.length <= 3) grouped = intPart;
  else grouped = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + intPart.slice(-3);
  const body = `${symbol ? "₹" : ""}${grouped}.${frac}`;
  if (d.isNegative() && !d.isZero()) return parens ? `(${body})` : `-${body}`;
  return body;
}
