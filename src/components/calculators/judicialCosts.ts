/**
 * judicialCosts.ts — the «التكاليف القضائية» estimate behind CalcCourtFees
 * (the «الحاسبة القانونية» page, /ai/fee-calculator). Pure, no `@/` imports,
 * so judicialCosts.test.ts runs it under `node --test`.
 *
 * STATUTORY RULES & OWNER DECISION #167 (2026-10-06):
 *   • a monetary claim costs 5% of the amount claimed, capped at 1,000,000 SAR
 *     (Article 3 of the Judicial Costs Law);
 *   • the requests in Article 7 of the law are capped per request:
 *       – an appeal at 10,000 SAR,
 *       – cassation (النقض) at 7,000 SAR,
 *       – reconsideration (التماس إعادة النظر) at 10,000 SAR.
 *   Owner Decision #167 confirms all four caps.
 *
 * Reading of the request caps (the owner's rule): the same 5%, taken on the
 * amount under challenge, never more than the request's cap —
 * min(5% × amount, cap).
 *
 * NOTE for a legal check (not applied here): Article 6 of the costs
 * regulation, as carried in the library, states FLAT amounts for these
 * requests (reconsideration 10,000, cassation 7,000, appeal 5,000), and its
 * Article 2 sets a sliding first-instance rate (5% / 4% / 3% / 2% by claim
 * band). The calculator follows the owner's decision until he says otherwise.
 *
 * What the rule does NOT give, so this file does not compute it:
 *   • non-monetary claims, execution, and the Board of Grievances;
 *   • exemptions. Some claims may be exempt by law; the estimate never
 *     subtracts one.
 *
 * The page labels every figure «تقديرية استرشادية».
 */

/** 5% of a monetary claim — Article 3 of the law. */
export const MONETARY_CLAIM_RATE = 0.05;

/** The first-instance ceiling, in SAR — Article 3 of the Judicial Costs Law & Owner Decision #167. */
export const FIRST_INSTANCE_COST_CAP_SAR = 1_000_000;

/** The appeal ceiling, in SAR — Article 7 of the law & Owner Decision #167. */
export const APPEAL_COST_CAP_SAR = 10_000;

/** The cassation (النقض) ceiling, in SAR — Article 7 of the law & Owner Decision #167. */
export const CASSATION_COST_CAP_SAR = 7_000;

/** The reconsideration (التماس إعادة النظر) ceiling, in SAR — Article 7 of the law & Owner Decision #167. */
export const RECONSIDERATION_COST_CAP_SAR = 10_000;

/** The label every figure this file produces is shown under. */
export const JUDICIAL_COSTS_ESTIMATE_LABEL = "تقديرية استرشادية";

export interface JudicialCostsInput {
  /** The amount claimed (or, for a request line, under challenge), in SAR. */
  claimAmountSar: number;
  includeFirstInstance: boolean;
  includeAppeal: boolean;
  includeCassation?: boolean;
  includeReconsideration?: boolean;
}

export type JudicialCostsLineId = "first-instance" | "appeal" | "cassation" | "reconsideration";

export interface JudicialCostsLine {
  id: JudicialCostsLineId;
  label: string;
  amountSar: number;
  /** How the figure was reached, in one Arabic line. */
  basis: string;
  /** True when the line's ceiling, not the 5%, decided the figure. */
  capped: boolean;
}

export interface JudicialCostsEstimate {
  lines: JudicialCostsLine[];
  totalSar: number;
}

/** "250,000" / "٢٥٠٬٠٠٠" / " 250000 " → 250000; anything else → null. */
export function parseClaimAmount(raw: string): number | null {
  const western = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[,٬\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(western)) return null;
  const value = Number(western);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Whole riyals, half up — what a fee line is quoted in. */
function riyals(value: number): number {
  return Math.round(value);
}

/** One 5%-with-a-ceiling request line (appeal, cassation, reconsideration). */
function requestLine(
  id: Exclude<JudicialCostsLineId, "first-instance">,
  label: string,
  fivePercent: number,
  cap: number,
  capLabel: string,
  subject: string,
): JudicialCostsLine {
  const capped = fivePercent > cap;
  return {
    id,
    label,
    amountSar: capped ? cap : fivePercent,
    basis: capped
      ? `٥٪ من المبلغ محل ${subject}، بلغت الحد الأعلى (${capLabel} ريال)`
      : `٥٪ من المبلغ محل ${subject} (الحد الأعلى ${capLabel} ريال)`,
    capped,
  };
}

/**
 * The estimate, or null when there is nothing to estimate (no positive amount,
 * or no stage picked). Never throws. Lines come in court order: first
 * instance, appeal, cassation, reconsideration.
 */
export function estimateJudicialCosts(input: JudicialCostsInput): JudicialCostsEstimate | null {
  const amount = input.claimAmountSar;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const includeCassation = input.includeCassation === true;
  const includeReconsideration = input.includeReconsideration === true;
  if (!input.includeFirstInstance && !input.includeAppeal && !includeCassation && !includeReconsideration) return null;

  const fivePercent = riyals(amount * MONETARY_CLAIM_RATE);
  const lines: JudicialCostsLine[] = [];

  if (input.includeFirstInstance) {
    const capped = fivePercent > FIRST_INSTANCE_COST_CAP_SAR;
    lines.push({
      id: "first-instance",
      label: "قيد الدعوى (الدرجة الأولى)",
      amountSar: capped ? FIRST_INSTANCE_COST_CAP_SAR : fivePercent,
      basis: capped
        ? "٥٪ من قيمة المطالبة المالية، بلغت الحد الأعلى (١٬٠٠٠٬٠٠٠ ريال)"
        : "٥٪ من قيمة المطالبة المالية (الحد الأعلى ١٬٠٠٠٬٠٠٠ ريال)",
      capped,
    });
  }

  if (input.includeAppeal) {
    lines.push(requestLine("appeal", "طلب الاستئناف", fivePercent, APPEAL_COST_CAP_SAR, "١٠٬٠٠٠", "الاستئناف"));
  }

  if (includeCassation) {
    lines.push(requestLine("cassation", "طلب النقض", fivePercent, CASSATION_COST_CAP_SAR, "٧٬٠٠٠", "النقض"));
  }

  if (includeReconsideration) {
    lines.push(requestLine("reconsideration", "طلب التماس إعادة النظر", fivePercent, RECONSIDERATION_COST_CAP_SAR, "١٠٬٠٠٠", "الالتماس"));
  }

  return { lines, totalSar: lines.reduce((sum, line) => sum + line.amountSar, 0) };
}
