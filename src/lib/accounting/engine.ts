import {
  AccountingError, DEFAULT_CONFIG, TRANSACTION_TYPES,
  type Account, type DepreciationRecord, type EngineConfig, type FixedAsset, type JournalEntry,
  type JournalLine, type PostedLedger, type SourceTransaction, type TrackerEvent, type TrackerKey,
} from "@/types/accounting";
import { ACCUMULATED_ACCOUNT, depreciationForSlice } from "./depreciation";
import { computeGst, computeGstSettlement } from "./gst";
import { InventoryLedger } from "./inventory";
import { credit, debit, isValidDate, validateJournalEntry } from "./journal";
import { D, ZERO, money, sum, toDecimal, type Dec } from "./money";

/** Well-known account codes used by the posting rules. */
export const ACC = {
  cash: "1001", bank1: "1002", bank2: "1003", receivable: "1100", interestReceivable: "1150",
  inventory: "1200", prepaidRent: "1300", inputGst: "1400", loanGiven: "1500",
  payable: "2001", salariesPayable: "2002", bankLoan: "2100", outputGst: "2200", tdsPayable: "2300",
  accruedExpenses: "2400", capital: "3001", sales: "4001", service: "4002", interestIncome: "4003",
  cogs: "5001", salaries: "5101", rent: "5102", depreciation: "5105", interestExpense: "5107",
} as const;

export const CASH_BANK_ACCOUNTS: string[] = [ACC.cash, ACC.bank1, ACC.bank2];
export const CREDIT = "CREDIT";

export function chartMap(accounts: Account[]): Map<string, Account> {
  const map = new Map<string, Account>();
  for (const a of accounts) {
    if (map.has(a.code)) throw new AccountingError(`Duplicate account code ${a.code} in chart of accounts`);
    map.set(a.code, a);
  }
  return map;
}

/**
 * Pipeline step 1-2: Source transactions -> journal entries.
 * Transactions are processed in (date, id) order. State needed by later transactions (inventory cost, fixed-asset
 * register, GST balances, party balances) is tracked here. Any rule violation throws an AccountingError naming the
 * offending transaction, and nothing is returned - a bad batch is never partially posted.
 */
export function postTransactions(sources: SourceTransaction[], accounts: Account[], config: EngineConfig = DEFAULT_CONFIG): PostedLedger {
  const { ledger, errors } = postTransactionsLenient(sources, accounts, config);
  if (errors.length) throw new AccountingError(errors[0].message, errors[0].txnId);
  return ledger;
}

export interface PostingProblem { txnId: string; row: number; message: string }

/**
 * Same rules as postTransactions, but keeps going after a bad transaction and returns EVERY problem found (used by the
 * CSV upload tester). A transaction that fails is skipped, so later problems that merely follow from it (e.g. a collection
 * for a skipped sale) may also be listed. Only trust the ledger when `errors` is empty.
 */
export function postTransactionsLenient(sources: SourceTransaction[], accounts: Account[], config: EngineConfig = DEFAULT_CONFIG): { ledger: PostedLedger; errors: PostingProblem[] } {
  const chart = chartMap(accounts);
  const poster = new Poster(chart, config);
  const errors: PostingProblem[] = [];
  const seen = new Set<string>();
  const usable: { tx: SourceTransaction; row: number }[] = [];
  sources.forEach((tx, i) => {
    const id = tx.txnId.trim();
    const row = i + 2; // spreadsheet row number (header is row 1)
    if (!id) { errors.push({ txnId: "", row, message: "Every transaction needs a unique transaction ID" }); return; }
    if (seen.has(id)) { errors.push({ txnId: id, row, message: `[${id}] Duplicate transaction ID "${id}"` }); return; }
    seen.add(id);
    usable.push({ tx, row });
  });
  usable.sort((a, b) => (a.tx.date === b.tx.date ? a.tx.txnId.localeCompare(b.tx.txnId) : a.tx.date < b.tx.date ? -1 : 1));
  for (const { tx, row } of usable) {
    try { poster.post(tx); } catch (e) {
      errors.push({ txnId: tx.txnId.trim(), row, message: e instanceof AccountingError ? e.message : `[${tx.txnId}] ${(e as Error).message}` });
    }
  }
  return { ledger: poster.result(), errors };
}

class Poster {
  private entries: JournalEntry[] = [];
  private inventory: InventoryLedger;
  private assets: FixedAsset[] = [];
  private depreciation: DepreciationRecord[] = [];
  private balances = new Map<string, Dec>(); // debit-minus-credit per account
  private partyBalances = new Map<string, Dec>(); // `${account}|${party}` -> debit-minus-credit
  private trackerEvents: TrackerEvent[] = [];
  private track(key: TrackerKey, date: string, amount: Dec) { this.trackerEvents.push({ key, date, amount }); }

  constructor(private chart: Map<string, Account>, private config: EngineConfig) {
    this.inventory = new InventoryLedger(config.allowNegativeInventory);
  }

  result(): PostedLedger {
    return {
      entries: this.entries, inventoryMovements: this.inventory.movements, assets: this.assets,
      depreciation: this.depreciation, trackerEvents: this.trackerEvents,
    };
  }

  post(tx: SourceTransaction): void {
    const id = tx.txnId.trim();
    if (!isValidDate(tx.date)) throw new AccountingError(`Invalid date "${tx.date}" (expected YYYY-MM-DD)`, id);
    if (!tx.description.trim()) throw new AccountingError("Description is required", id);
    const type = tx.type.trim().toUpperCase();
    if (!(TRANSACTION_TYPES as readonly string[]).includes(type)) throw new AccountingError(`Unknown transaction type "${tx.type}"`, id);
    const entry = this.build(type, tx);
    validateJournalEntry(entry, this.chart);
    for (const l of entry.lines) {
      this.balances.set(l.accountCode, (this.balances.get(l.accountCode) ?? ZERO).plus(l.debit).minus(l.credit));
      if (l.party) {
        const key = `${l.accountCode}|${l.party}`;
        this.partyBalances.set(key, (this.partyBalances.get(key) ?? ZERO).plus(l.debit).minus(l.credit));
      }
    }
    this.entries.push(entry);
  }

  // ---------- helpers ----------
  private amount(tx: SourceTransaction, field: "amount" | "interestAmount" | "deductionAmount" = "amount", required = true): Dec {
    const raw = tx[field];
    let v: Dec;
    try { v = money(toDecimal(raw, field)); } catch (e) { throw new AccountingError((e as Error).message, tx.txnId); }
    if (required && v.lte(0)) throw new AccountingError(`${field} must be greater than zero`, tx.txnId);
    if (v.isNegative()) throw new AccountingError(`${field} cannot be negative`, tx.txnId);
    return v;
  }

  private account(tx: SourceTransaction, code: string, what: string, expectedType?: string): Account {
    const a = this.chart.get(code.trim());
    if (!a) throw new AccountingError(`${what}: unknown account code "${code}"`, tx.txnId);
    if (expectedType && a.type !== expectedType) throw new AccountingError(`${what}: account ${code} (${a.name}) must be a ${expectedType} account`, tx.txnId);
    return a;
  }

  private cashAccount(tx: SourceTransaction, code: string, what = "Payment account"): string {
    if (!CASH_BANK_ACCOUNTS.includes(code.trim())) {
      throw new AccountingError(`${what} must be a cash or bank account (${CASH_BANK_ACCOUNTS.join(", ")}), got "${code}"`, tx.txnId);
    }
    return code.trim();
  }

  /** Resolves "how was it paid": a cash/bank code, or CREDIT (-> receivable/payable and a named party). */
  private settlement(tx: SourceTransaction, creditAccount: string): { code: string; party?: string; onCredit: boolean } {
    const s = tx.settle.trim().toUpperCase();
    if (s === CREDIT) {
      if (!tx.party.trim()) throw new AccountingError("A credit transaction needs a customer/supplier name in 'party'", tx.txnId);
      return { code: creditAccount, party: tx.party.trim(), onCredit: true };
    }
    return { code: this.cashAccount(tx, s), party: tx.party.trim() || undefined, onCredit: false };
  }

  private partyBalance(account: string, party: string): Dec {
    return this.partyBalances.get(`${account}|${party}`) ?? ZERO;
  }

  private bal(code: string): Dec {
    return this.balances.get(code) ?? ZERO;
  }

  private entry(tx: SourceTransaction, lines: JournalLine[], extra: Partial<JournalEntry> = {}): JournalEntry {
    return {
      id: `JE-${tx.txnId.trim()}`, txnId: tx.txnId.trim(), date: tx.date, reference: tx.reference.trim() || tx.txnId.trim(),
      description: tx.description.trim(), category: tx.category.trim() || tx.type.trim().toUpperCase(),
      party: tx.party.trim() || undefined, lines, ...extra,
    };
  }

  // ---------- posting rules ----------
  private build(type: string, tx: SourceTransaction): JournalEntry {
    switch (type) {
      case "CAPITAL": {
        const amt = this.amount(tx);
        return this.entry(tx, [debit(this.cashAccount(tx, tx.settle, "Deposit account"), amt), credit(ACC.capital, amt)]);
      }
      case "TRANSFER": {
        const amt = this.amount(tx);
        const from = this.cashAccount(tx, tx.settle, "'settle' (from account)");
        const to = this.cashAccount(tx, tx.toAccount, "'to_account'");
        if (from === to) throw new AccountingError("Cannot transfer between the same account", tx.txnId);
        // Pure movement between asset accounts: never income or expense.
        return this.entry(tx, [debit(to, amt), credit(from, amt)]);
      }
      case "PURCHASE": return this.purchase(tx);
      case "SALE": return this.sale(tx);
      case "SERVICE": {
        const net = this.amount(tx);
        const gst = computeGst(net, tx.gstRate, tx.gstTreatment, this.config, tx.txnId);
        const s = this.settlement(tx, ACC.receivable);
        const lines = [debit(s.code, net.plus(gst.gst), s.party), credit(ACC.service, net)];
        if (gst.gst.gt(0)) lines.push(credit(ACC.outputGst, gst.gst));
        return this.entry(tx, lines, { gstRate: gst.rate.toString(), gstTreatment: gst.treatment, gstAmount: gst.gst });
      }
      case "COLLECTION": {
        const amt = this.amount(tx);
        const party = this.requireParty(tx);
        const outstanding = this.partyBalance(ACC.receivable, party);
        if (amt.gt(outstanding)) throw new AccountingError(`Collection ${amt.toFixed(2)} exceeds ${party}'s outstanding receivable ${outstanding.toFixed(2)}`, tx.txnId);
        // Settling an existing receivable: no revenue is recognised again.
        return this.entry(tx, [debit(this.cashAccount(tx, tx.settle, "Receipt account"), amt, party), credit(ACC.receivable, amt, party)]);
      }
      case "SUPPLIER_PAYMENT": {
        const amt = this.amount(tx);
        const party = this.requireParty(tx);
        const outstanding = this.partyBalance(ACC.payable, party).negated();
        if (amt.gt(outstanding)) throw new AccountingError(`Payment ${amt.toFixed(2)} exceeds amount owed to ${party} (${outstanding.toFixed(2)})`, tx.txnId);
        return this.entry(tx, [debit(ACC.payable, amt, party), credit(this.cashAccount(tx, tx.settle), amt, party)]);
      }
      case "EXPENSE": {
        const net = this.amount(tx);
        const exp = this.account(tx, tx.account, "Expense account", "expense");
        if (exp.code === ACC.cogs || exp.code === ACC.depreciation) {
          throw new AccountingError(`${exp.name} is posted automatically (by sales / depreciation) and cannot be used for a manual expense`, tx.txnId);
        }
        const gst = computeGst(net, tx.gstRate, tx.gstTreatment, this.config, tx.txnId);
        const s = this.settlement(tx, ACC.payable);
        const lines = [debit(exp.code, net)];
        if (gst.gst.gt(0)) lines.push(debit(ACC.inputGst, gst.gst));
        lines.push(credit(s.code, net.plus(gst.gst), s.party));
        return this.entry(tx, lines, { gstRate: gst.rate.toString(), gstTreatment: gst.treatment, gstAmount: gst.gst });
      }
      case "ASSET_PURCHASE": return this.assetPurchase(tx);
      case "PREPAYMENT": {
        const net = this.amount(tx);
        const gst = computeGst(net, tx.gstRate, tx.gstTreatment, this.config, tx.txnId);
        const s = this.settlement(tx, ACC.payable);
        const lines = [debit(ACC.prepaidRent, net)];
        if (gst.gst.gt(0)) lines.push(debit(ACC.inputGst, gst.gst));
        lines.push(credit(s.code, net.plus(gst.gst), s.party));
        this.track("prepaidNet", tx.date, net);
        return this.entry(tx, lines, { gstRate: gst.rate.toString(), gstTreatment: gst.treatment, gstAmount: gst.gst });
      }
      case "PREPAID_RELEASE": {
        const amt = this.amount(tx);
        if (amt.gt(this.bal(ACC.prepaidRent))) throw new AccountingError(`Release ${amt.toFixed(2)} exceeds prepaid rent balance ${this.bal(ACC.prepaidRent).toFixed(2)}`, tx.txnId);
        this.track("prepaidNet", tx.date, amt.negated());
        return this.entry(tx, [debit(ACC.rent, amt), credit(ACC.prepaidRent, amt)]);
      }
      case "DEPRECIATION": return this.depreciate(tx);
      case "SALARY_ACCRUAL": {
        const gross = this.amount(tx);
        const ded = this.amount(tx, "deductionAmount", false);
        if (ded.gt(gross)) throw new AccountingError("Deductions cannot exceed gross salary", tx.txnId);
        const lines = [debit(ACC.salaries, gross), credit(ACC.salariesPayable, gross.minus(ded))];
        if (ded.gt(0)) lines.push(credit(ACC.tdsPayable, ded));
        return this.entry(tx, lines);
      }
      case "SALARY_PAYMENT": {
        const amt = this.amount(tx);
        const liab = (tx.account.trim() || ACC.salariesPayable);
        if (liab !== ACC.salariesPayable && liab !== ACC.tdsPayable) throw new AccountingError("Salary payments settle 2002 Salaries Payable or 2300 TDS and PF Payable", tx.txnId);
        const owed = this.bal(liab).negated();
        if (amt.gt(owed)) throw new AccountingError(`Payment ${amt.toFixed(2)} exceeds the liability outstanding in ${liab} (${owed.toFixed(2)})`, tx.txnId);
        // Paying an accrued salary reduces the liability; the expense was already recognised on accrual.
        return this.entry(tx, [debit(liab, amt), credit(this.cashAccount(tx, tx.settle), amt)]);
      }
      case "LOAN_RECEIVED": {
        const amt = this.amount(tx);
        this.track("loanAvailedPrincipal", tx.date, amt);
        // A loan received is a liability, not income.
        return this.entry(tx, [debit(this.cashAccount(tx, tx.settle, "Deposit account"), amt), credit(ACC.bankLoan, amt)]);
      }
      case "LOAN_REPAYMENT": {
        const principal = this.amount(tx);
        const interest = this.amount(tx, "interestAmount", false);
        if (principal.gt(this.bal(ACC.bankLoan).negated())) throw new AccountingError("Principal repayment exceeds the loan outstanding", tx.txnId);
        this.track("loanAvailedPrincipal", tx.date, principal.negated());
        const lines = [debit(ACC.bankLoan, principal)];
        if (interest.gt(0)) lines.push(debit(ACC.interestExpense, interest));
        lines.push(credit(this.cashAccount(tx, tx.settle), principal.plus(interest)));
        return this.entry(tx, lines);
      }
      case "LOAN_GIVEN": {
        const amt = this.amount(tx);
        const party = this.requireParty(tx);
        this.track("loanGivenPrincipal", tx.date, amt);
        return this.entry(tx, [debit(ACC.loanGiven, amt, party), credit(this.cashAccount(tx, tx.settle), amt)]);
      }
      case "LOAN_RECOVERY": {
        const principal = this.amount(tx);
        const interest = this.amount(tx, "interestAmount", false);
        const party = this.requireParty(tx);
        if (principal.gt(this.partyBalance(ACC.loanGiven, party))) throw new AccountingError(`Recovery exceeds the loan outstanding from ${party}`, tx.txnId);
        this.track("loanGivenPrincipal", tx.date, principal.negated());
        const lines = [debit(this.cashAccount(tx, tx.settle, "Receipt account"), principal.plus(interest)), credit(ACC.loanGiven, principal, party)];
        if (interest.gt(0)) {
          // Interest already accrued (account 1150) is cleared first; the remainder is income received in cash.
          const accrued = D.max(ZERO, this.bal(ACC.interestReceivable));
          const fromAccrual = D.min(accrued, interest);
          if (fromAccrual.gt(0)) lines.push(credit(ACC.interestReceivable, fromAccrual));
          if (interest.minus(fromAccrual).gt(0)) lines.push(credit(ACC.interestIncome, interest.minus(fromAccrual)));
        }
        return this.entry(tx, lines);
      }
      case "INTEREST_INCOME": {
        const amt = this.amount(tx);
        return this.entry(tx, [debit(this.cashAccount(tx, tx.settle, "Receipt account"), amt), credit(ACC.interestIncome, amt)]);
      }
      case "GST_SETTLEMENT": {
        const out = this.bal(ACC.outputGst).negated();
        const inp = this.bal(ACC.inputGst);
        if (out.lte(0)) throw new AccountingError("No output GST payable to settle on this date", tx.txnId);
        const { utilised, cashPayable } = computeGstSettlement(out, inp);
        const lines = [debit(ACC.outputGst, out)];
        if (utilised.gt(0)) lines.push(credit(ACC.inputGst, utilised));
        if (cashPayable.gt(0)) lines.push(credit(this.cashAccount(tx, tx.settle, "GST payment account"), cashPayable));
        this.track("gstUtilised", tx.date, utilised);
        return this.entry(tx, lines, { gstAmount: out });
      }
      case "JOURNAL": {
        const amt = this.amount(tx);
        const dr = this.account(tx, tx.account, "Debit account");
        const cr = this.account(tx, tx.toAccount, "Credit account");
        if (dr.code === cr.code) throw new AccountingError("Debit and credit accounts must differ", tx.txnId);
        if (dr.code === "3003" || cr.code === "3003") throw new AccountingError("3003 Current-Year Profit or Loss is computed, not posted to", tx.txnId);
        return this.entry(tx, [debit(dr.code, amt), credit(cr.code, amt)]);
      }
      default:
        throw new AccountingError(`Unhandled transaction type ${type}`, tx.txnId);
    }
  }

  private requireParty(tx: SourceTransaction): string {
    const p = tx.party.trim();
    if (!p) throw new AccountingError("This transaction needs a party (customer / supplier / borrower)", tx.txnId);
    return p;
  }

  private purchase(tx: SourceTransaction): JournalEntry {
    const item = tx.item.trim();
    if (!item) throw new AccountingError("Purchase needs an inventory item code", tx.txnId);
    const qty = toDecimal(tx.quantity, "quantity");
    const unit = toDecimal(tx.unitAmount, "unit_amount");
    if (qty.lte(0) || unit.lte(0)) throw new AccountingError("Quantity and unit cost must be above zero", tx.txnId);
    const net = money(qty.times(unit));
    const gst = computeGst(net, tx.gstRate, tx.gstTreatment, this.config, tx.txnId);
    const s = this.settlement(tx, ACC.payable);
    // Recoverable GST is NOT part of inventory cost.
    this.inventory.purchase(tx.txnId, tx.date, item, qty, net);
    const lines = [debit(ACC.inventory, net)];
    if (gst.gst.gt(0)) lines.push(debit(ACC.inputGst, gst.gst));
    lines.push(credit(s.code, net.plus(gst.gst), s.party));
    return this.entry(tx, lines, { gstRate: gst.rate.toString(), gstTreatment: gst.treatment, gstAmount: gst.gst });
  }

  private sale(tx: SourceTransaction): JournalEntry {
    const item = tx.item.trim();
    if (!item) throw new AccountingError("Sale needs an inventory item code", tx.txnId);
    const qty = toDecimal(tx.quantity, "quantity");
    const unit = toDecimal(tx.unitAmount, "unit_amount");
    if (qty.lte(0) || unit.lte(0)) throw new AccountingError("Quantity and selling price must be above zero", tx.txnId);
    const net = money(qty.times(unit));
    const gst = computeGst(net, tx.gstRate, tx.gstTreatment, this.config, tx.txnId);
    const s = this.settlement(tx, ACC.receivable);
    const cost = this.inventory.sale(tx.txnId, tx.date, item, qty);
    const lines = [debit(s.code, net.plus(gst.gst), s.party), credit(ACC.sales, net)];
    if (gst.gst.gt(0)) lines.push(credit(ACC.outputGst, gst.gst));
    // Revenue is recognised at the time of sale (even on credit); the matching cost leaves inventory.
    lines.push(debit(ACC.cogs, cost), credit(ACC.inventory, cost));
    return this.entry(tx, lines, { gstRate: gst.rate.toString(), gstTreatment: gst.treatment, gstAmount: gst.gst });
  }

  private assetPurchase(tx: SourceTransaction): JournalEntry {
    const cost = this.amount(tx);
    const acct = tx.account.trim();
    const accum = ACCUMULATED_ACCOUNT[acct];
    if (!accum) throw new AccountingError(`Account ${acct} is not a fixed-asset cost account (use ${Object.keys(ACCUMULATED_ACCOUNT).join(", ")})`, tx.txnId);
    const life = toDecimal(tx.usefulLifeYears, "useful_life_years");
    const residual = money(toDecimal(tx.residualValue, "residual_value"));
    if (life.lte(0)) throw new AccountingError("Useful life must be above zero", tx.txnId);
    if (residual.isNegative() || residual.gte(cost)) throw new AccountingError("Residual value must be at least 0 and less than cost", tx.txnId);
    const gst = computeGst(cost, tx.gstRate, tx.gstTreatment, this.config, tx.txnId);
    const s = this.settlement(tx, ACC.payable);
    this.assets.push({
      assetId: tx.txnId.trim(), name: tx.item.trim() || this.chart.get(acct)!.name, costAccount: acct, accumulatedAccount: accum,
      purchaseDate: tx.date, cost, usefulLifeYears: life, residualValue: residual,
    });
    // Capitalised as an asset (never an operating expense); recoverable GST is a separate asset.
    const lines = [debit(acct, cost)];
    if (gst.gst.gt(0)) lines.push(debit(ACC.inputGst, gst.gst));
    lines.push(credit(s.code, cost.plus(gst.gst), s.party));
    return this.entry(tx, lines, { gstRate: gst.rate.toString(), gstTreatment: gst.treatment, gstAmount: gst.gst });
  }

  private depreciate(tx: SourceTransaction): JournalEntry {
    const lines: JournalLine[] = [];
    let total = ZERO;
    const slices: DepreciationRecord[] = [];
    for (const asset of this.assets) {
      if (asset.purchaseDate > tx.date) continue;
      const mine = this.depreciation.filter((r) => r.assetId === asset.assetId);
      const done = sum(mine.map((r) => r.amount));
      const through = mine.length ? mine[mine.length - 1].toDate : null;
      const slice = depreciationForSlice(asset, done, through, tx.date);
      if (slice.amount.lte(0)) continue;
      slices.push({ assetId: asset.assetId, txnId: tx.txnId.trim(), fromDate: slice.fromDate, toDate: tx.date, days: slice.days, amount: slice.amount });
      lines.push(credit(asset.accumulatedAccount, slice.amount, undefined, `${asset.name}: ${slice.days} days`));
      total = total.plus(slice.amount);
    }
    if (total.lte(0)) throw new AccountingError("No depreciation to post on this date", tx.txnId);
    this.depreciation.push(...slices);
    return this.entry(tx, [debit(ACC.depreciation, total), ...lines]);
  }
}
