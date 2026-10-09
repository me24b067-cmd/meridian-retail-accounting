import { AccountingError, GST_TREATMENTS, type EngineConfig, type GstTreatment } from "@/types/accounting";
import { D, ZERO, money, toDecimal, type Dec } from "./money";

export interface GstResult {
  treatment: GstTreatment;
  rate: Dec;
  gst: Dec;
}

/**
 * Simplified educational GST: a single combined rate (no CGST/SGST/IGST split).
 * TAXABLE needs a rate > 0; EXEMPT and NON_TAXABLE must have rate 0 and produce no tax.
 * If treatment is blank it is inferred (rate > 0 => TAXABLE, otherwise NON_TAXABLE).
 */
export function computeGst(netAmount: Dec, rateText: string, treatmentText: string, config: EngineConfig, txnId?: string): GstResult {
  const rate = toDecimal(rateText, "GST rate");
  if (!config.supportedGstRates.some((r) => rate.eq(r))) {
    throw new AccountingError(`Unsupported GST rate ${rate.toString()}% (supported: ${config.supportedGstRates.join(", ")})`, txnId);
  }
  let treatment = (treatmentText || "").trim().toUpperCase() as GstTreatment | "";
  if (!treatment) treatment = rate.gt(0) ? "TAXABLE" : "NON_TAXABLE";
  if (!GST_TREATMENTS.includes(treatment)) throw new AccountingError(`Unknown GST treatment "${treatmentText}"`, txnId);
  if (treatment === "TAXABLE" && rate.lte(0)) throw new AccountingError("A TAXABLE transaction needs a GST rate above 0", txnId);
  if (treatment !== "TAXABLE" && rate.gt(0)) throw new AccountingError(`${treatment} transactions must have a 0% GST rate`, txnId);
  const gst = treatment === "TAXABLE" ? money(netAmount.times(rate).div(100)) : ZERO;
  return { treatment, rate, gst };
}

/**
 * GST settlement: output GST payable is first set off against input credit; any shortfall is paid in cash/bank;
 * any excess input credit stays on the Balance Sheet as a carried-forward asset.
 */
export function computeGstSettlement(outputPayable: Dec, inputCredit: Dec) {
  const out = new D(outputPayable);
  const inp = new D(inputCredit);
  const utilised = D.min(out, inp.isNegative() ? ZERO : inp);
  return { utilised, cashPayable: out.minus(utilised) };
}
