/**
 * judicialCosts.ts — the «التكاليف القضائية» estimate behind CalcCourtFees
 * (the «الحاسبة القانونية» page, /ai/fee-calculator). Pure, no `@/` imports,
 * so judicialCosts.test.ts runs it under `node --test`.
 *
 * STATUTORY RULES — owner answer ١٨٢ (2026-10-16), replacing decision #167:
 * «اعتماد شرائح وقيم اللائحة التنفيذية لنظام التكاليف القضائية بنسبة ١٠٠٪»
 * (قرار مجلس الوزراء رقم ١٠٠ وتاريخ ١٦/٢/١٤٤٤هـ), read in the owner's library
 * export of 2026-10-03 (نظام التكاليف القضائية-ولائحته-مدمج.md):
 *
 *   • A monetary first-instance claim — Article 2 of the regulation: «تُقدّر
 *     التكاليف القضائية للدعوى المحددة القيمة؛ على أساس نسبة من قيمة المطالبة»,
 *     5% if the claim is under 100,000 SAR, 4% from 100,000 to under 500,000,
 *     3% from 500,000 to under 1,000,000, 2% from 1,000,000 up. Each band is
 *     a condition on the WHOLE claim («إذا كانت قيمة المطالبة …»), so one rate
 *     applies to the whole amount — not 5% of the first 100,000 and 4% of the
 *     rest. (A consequence of the text: 100,000 costs 4,000 while 99,999
 *     costs 5,000.) Capped at 1,000,000 SAR — Article 3 of the law.
 *   • Requests — Article 6 of the regulation, flat amounts whatever the claim:
 *     an appeal 5,000 SAR, cassation (النقض) 7,000, reconsideration (التماس
 *     إعادة النظر) 10,000 (inside Article 7 of the law's 10,000 ceiling).
 *
 * What the rule does NOT give here, so this file does not compute it:
 *   • claims with no stated value (Article 3 of the regulation), execution,
 *     and the Board of Grievances;
 *   • exemptions. Some claims may be exempt by law; the estimate never
 *     subtracts one.
 *
 * The page labels every figure «تقديرية استرشادية».
 */

/** Article 2 of the regulation: the rate for a claim below `below` SAR (first match wins). */
export const FIRST_INSTANCE_BANDS: readonly { below: number; rate: number; percentAr: string; bandAr: string }[] = [
  { below: 100_000, rate: 0.05, percentAr: "٥٪", bandAr: "أقل من ١٠٠ ألف ريال" },
  { below: 500_000, rate: 0.04, percentAr: "٤٪", bandAr: "من ١٠٠ ألف إلى أقل من ٥٠٠ ألف ريال" },
  { below: 1_000_000, rate: 0.03, percentAr: "٣٪", bandAr: "من ٥٠٠ ألف إلى أقل من مليون ريال" },
  { below: Number.POSITIVE_INFINITY, rate: 0.02, percentAr: "٢٪", bandAr: "مليون ريال فأكثر" },
];

/** The first-instance ceiling, in SAR — Article 3 of the Judicial Costs Law. */
export const FIRST_INSTANCE_COST_CAP_SAR = 1_000_000;

/** Flat request amounts, in SAR — Article 6 of the regulation. */
export const APPEAL_COST_SAR = 5_000;
export const CASSATION_COST_SAR = 7_000;
export const RECONSIDERATION_COST_SAR = 10_000;

/** The label every figure this file produces is shown under. */
export const JUDICIAL_COSTS_ESTIMATE_LABEL = "تقديرية استرشادية";

export interface JudicialCostsInput {
  /** The amount claimed, in SAR. */
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
  /** True when the 1,000,000 SAR ceiling, not the band rate, decided the figure. */
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

/** The Article 2 band a claim falls in. */
export function firstInstanceBand(amount: number): (typeof FIRST_INSTANCE_BANDS)[number] {
  return FIRST_INSTANCE_BANDS.find((band) => amount < band.below) ?? FIRST_INSTANCE_BANDS[FIRST_INSTANCE_BANDS.length - 1];
}

/** One flat Article 6 request line. */
function requestLine(id: Exclude<JudicialCostsLineId, "first-instance">, label: string, amountSar: number, amountAr: string): JudicialCostsLine {
  return {
    id,
    label,
    amountSar,
    basis: `مبلغ مقطوع ${amountAr} ريال لا يتغيّر بقيمة المطالبة (المادة السادسة من اللائحة التنفيذية)`,
    capped: false,
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

  const lines: JudicialCostsLine[] = [];

  if (input.includeFirstInstance) {
    const band = firstInstanceBand(amount);
    const byRate = riyals(amount * band.rate);
    const capped = byRate > FIRST_INSTANCE_COST_CAP_SAR;
    lines.push({
      id: "first-instance",
      label: "قيد الدعوى (الدرجة الأولى)",
      amountSar: capped ? FIRST_INSTANCE_COST_CAP_SAR : byRate,
      basis: capped
        ? `${band.percentAr} من قيمة المطالبة (${band.bandAr})، بلغت الحد الأعلى ١٬٠٠٠٬٠٠٠ ريال (المادة الثالثة من النظام)`
        : `${band.percentAr} من كامل قيمة المطالبة لأنها ${band.bandAr} (المادة الثانية من اللائحة التنفيذية)`,
      capped,
    });
  }

  if (input.includeAppeal) {
    lines.push(requestLine("appeal", "طلب الاستئناف", APPEAL_COST_SAR, "٥٬٠٠٠"));
  }

  if (includeCassation) {
    lines.push(requestLine("cassation", "طلب النقض", CASSATION_COST_SAR, "٧٬٠٠٠"));
  }

  if (includeReconsideration) {
    lines.push(requestLine("reconsideration", "طلب التماس إعادة النظر", RECONSIDERATION_COST_SAR, "١٠٬٠٠٠"));
  }

  return { lines, totalSar: lines.reduce((sum, line) => sum + line.amountSar, 0) };
}
