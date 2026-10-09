import type Decimal from "decimal.js";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type NormalBalance = "debit" | "credit";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  group: string;
  isContra: boolean;
  description: string;
}

/** Transaction types the engine knows how to turn into journal entries. */
export const TRANSACTION_TYPES = [
  "CAPITAL", "TRANSFER", "PURCHASE", "SALE", "SERVICE", "COLLECTION", "SUPPLIER_PAYMENT",
  "EXPENSE", "ASSET_PURCHASE", "PREPAYMENT", "PREPAID_RELEASE", "DEPRECIATION",
  "SALARY_ACCRUAL", "SALARY_PAYMENT", "LOAN_RECEIVED", "LOAN_REPAYMENT", "LOAN_GIVEN",
  "LOAN_RECOVERY", "INTEREST_INCOME", "GST_SETTLEMENT", "JOURNAL",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const GST_TREATMENTS = ["TAXABLE", "EXEMPT", "NON_TAXABLE"] as const;
export type GstTreatment = (typeof GST_TREATMENTS)[number];

/** One business event, exactly as it appears in data/sample_transactions.csv. All fields are strings. */
export interface SourceTransaction {
  txnId: string;
  date: string; // YYYY-MM-DD
  type: string;
  description: string;
  party: string;
  reference: string;
  category: string;
  item: string; // inventory item code, or fixed-asset name
  quantity: string;
  unitAmount: string;
  amount: string;
  gstRate: string; // percent, e.g. "18"
  gstTreatment: string;
  account: string; // main account (expense / asset / debit side for JOURNAL)
  settle: string; // cash/bank account code, or CREDIT
  toAccount: string; // destination (TRANSFER) / credit side (JOURNAL)
  interestAmount: string;
  deductionAmount: string;
  usefulLifeYears: string;
  residualValue: string;
}

export interface JournalLine {
  accountCode: string;
  debit: Decimal;
  credit: Decimal;
  party?: string;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  txnId: string;
  date: string;
  reference: string;
  description: string;
  category: string;
  party?: string;
  gstRate?: string;
  gstTreatment?: GstTreatment;
  gstAmount?: Decimal;
  lines: JournalLine[];
}

export interface InventoryMovement {
  txnId: string;
  date: string;
  item: string;
  kind: "PURCHASE" | "SALE";
  quantity: Decimal;
  unitCost: Decimal;
  value: Decimal;
  balanceQty: Decimal;
  balanceValue: Decimal;
}

export interface FixedAsset {
  assetId: string;
  name: string;
  costAccount: string;
  accumulatedAccount: string;
  purchaseDate: string;
  cost: Decimal;
  usefulLifeYears: Decimal;
  residualValue: Decimal;
}

export interface DepreciationRecord {
  assetId: string;
  txnId: string;
  fromDate: string; // exclusive
  toDate: string; // inclusive
  days: number;
  amount: Decimal;
}

export interface EngineConfig {
  allowNegativeInventory: boolean;
  supportedGstRates: number[];
}

export const DEFAULT_CONFIG: EngineConfig = {
  allowNegativeInventory: false,
  supportedGstRates: [0, 5, 12, 18, 28],
};

export type TrackerKey = "loanAvailedPrincipal" | "loanGivenPrincipal" | "prepaidNet" | "gstUtilised";
export interface TrackerEvent { date: string; key: TrackerKey; amount: Decimal }

/** Results of running source transactions through the engine. */
export interface PostedLedger {
  entries: JournalEntry[];
  inventoryMovements: InventoryMovement[];
  assets: FixedAsset[];
  depreciation: DepreciationRecord[];
  /** Independent trackers used by validation checks (principal only, GST credit, prepaid). */
  trackerEvents: TrackerEvent[];
}

export class AccountingError extends Error {
  constructor(message: string, public readonly txnId?: string) {
    super(txnId ? `[${txnId}] ${message}` : message);
    this.name = "AccountingError";
  }
}
