/**
 * judicialCosts.ts — the «التكاليف القضائية» estimate behind CalcCourtFees
 * (the «الحاسبة القانونية» page, /ai/fee-calculator). Pure, no `@/` imports,
 * so judicialCosts.test.ts runs it under `node --test`.
 *
 * THE RULE IS THE OWNER'S, AND ONLY HIS (Q149, answered 2026-10-03):
 *   • a monetary claim costs 5% of the amount claimed;
 *   • an appeal is capped at 10,000 SAR;
 *   • source he gave: Article 16 of the costs regulation (المادة ١٦ من
 *     اللائحة التنفيذية لنظام التكاليف القضائية).
 *
 * Reading of the appeal clause: the same 5%, taken on the amount under
 * appeal, never more than 10,000 SAR — min(5% × amount, 10,000).
 *
 * What the rule does NOT give, so this file does not compute it (a number we
 * made up would be presented as the law):
 *   • any cap on the first-instance 5% — none was stated, so none is applied;
 *   • non-monetary claims, cassation / the Supreme Court, execution, and the
 *     Board of Grievances;
 *   • exemptions. Some claims may be exempt by law; the estimate never
 *     subtracts one.
 *
 * The page labels every figure «تقديرية استرشادية». The version this replaced
 * applied brackets nobody sourced (2.5% / 1% / 0.5% by value band, +50% for an
 * appeal, +25% for cassation, per-court rates and caps); they are gone.
 */

/** 5% of a monetary claim — the owner's rule, Article 16 of the regulation. */
export const MONETARY_CLAIM_RATE = 0.05;

/** The appeal ceiling, in SAR — the owner's rule, Article 16 of the regulation. */
export const APPEAL_COST_CAP_SAR = 10_000;

/** The label every figure this file produces is shown under. */
export const JUDICIAL_COSTS_ESTIMATE_LABEL = "تقديرية استرشادية";

export interface JudicialCostsInput {
  /** The amount claimed (or, for the appeal line, under appeal), in SAR. */
  claimAmountSar: number;
  includeFirstInstance: boolean;
  includeAppeal: boolean;
}

export interface JudicialCostsLine {
  id: "first-instance" | "appeal";
  label: string;
  amountSar: number;
  /** How the figure was reached, in one Arabic line. */
  basis: string;
  /** True when the appeal ceiling, not the 5%, decided the figure. */
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

/**
 * The estimate, or null when there is nothing to estimate (no positive amount,
 * or no stage picked). Never throws.
 */
export function estimateJudicialCosts(input: JudicialCostsInput): JudicialCostsEstimate | null {
  const amount = input.claimAmountSar;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!input.includeFirstInstance && !input.includeAppeal) return null;

  const fivePercent = riyals(amount * MONETARY_CLAIM_RATE);
  const lines: JudicialCostsLine[] = [];

  if (input.includeFirstInstance) {
    lines.push({
      id: "first-instance",
      label: "قيد الدعوى (الدرجة الأولى)",
      amountSar: fivePercent,
      basis: "٥٪ من قيمة المطالبة المالية",
      capped: false,
    });
  }

  if (input.includeAppeal) {
    const capped = fivePercent > APPEAL_COST_CAP_SAR;
    lines.push({
      id: "appeal",
      label: "طلب الاستئناف",
      amountSar: capped ? APPEAL_COST_CAP_SAR : fivePercent,
      basis: capped
        ? "٥٪ من المبلغ محل الاستئناف، بلغت الحد الأعلى (١٠٬٠٠٠ ريال)"
        : "٥٪ من المبلغ محل الاستئناف (الحد الأعلى ١٠٬٠٠٠ ريال)",
      capped,
    });
  }

  return { lines, totalSar: lines.reduce((sum, line) => sum + line.amountSar, 0) };
}
