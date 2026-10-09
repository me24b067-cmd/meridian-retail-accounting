import { AccountingError, type InventoryMovement } from "@/types/accounting";
import { D, ZERO, money, type Dec } from "./money";

interface Position {
  qty: Dec;
  value: Dec;
}

/**
 * Perpetual weighted-average cost.
 * Purchase: quantity and cost are added; average cost = value / quantity.
 * Sale: cost of goods sold = value * qty sold / qty on hand (the whole remaining value when everything is sold,
 * so no rounding residue is left behind).
 */
export class InventoryLedger {
  private positions = new Map<string, Position>();
  readonly movements: InventoryMovement[] = [];

  constructor(private readonly allowNegative = false) {}

  position(item: string): Position {
    return this.positions.get(item) ?? { qty: ZERO, value: ZERO };
  }

  purchase(txnId: string, date: string, item: string, quantity: Dec, cost: Dec): void {
    if (quantity.lte(0)) throw new AccountingError("Purchase quantity must be above zero", txnId);
    const p = this.position(item);
    const next = { qty: p.qty.plus(quantity), value: p.value.plus(money(cost)) };
    this.positions.set(item, next);
    this.movements.push({
      txnId, date, item, kind: "PURCHASE", quantity, unitCost: money(cost).div(quantity).toDecimalPlaces(4),
      value: money(cost), balanceQty: next.qty, balanceValue: next.value,
    });
  }

  /** Returns the cost of goods sold for this sale. */
  sale(txnId: string, date: string, item: string, quantity: Dec): Dec {
    if (quantity.lte(0)) throw new AccountingError("Sale quantity must be above zero", txnId);
    const p = this.position(item);
    if (quantity.gt(p.qty) && !this.allowNegative) {
      throw new AccountingError(
        `Insufficient stock for ${item}: trying to sell ${quantity.toString()} but only ${p.qty.toString()} on hand`, txnId,
      );
    }
    if (p.qty.lte(0)) throw new AccountingError(`No stock on hand for ${item}; cannot value the cost of goods sold`, txnId);
    const cogs = quantity.gte(p.qty) ? p.value : money(p.value.times(quantity).div(p.qty));
    const next = { qty: p.qty.minus(quantity), value: p.value.minus(cogs) };
    this.positions.set(item, next);
    this.movements.push({
      txnId, date, item, kind: "SALE", quantity, unitCost: cogs.div(quantity).toDecimalPlaces(4),
      value: cogs, balanceQty: next.qty, balanceValue: next.value,
    });
    return cogs;
  }

  /** Quantity and value per item after all movements dated on or before `asOf` (all movements if omitted). */
  static balances(movements: InventoryMovement[], asOf?: string): Map<string, Position> {
    const out = new Map<string, Position>();
    for (const m of movements) {
      if (asOf && m.date > asOf) continue;
      out.set(m.item, { qty: m.balanceQty, value: m.balanceValue });
    }
    return out;
  }
}

export { D };
