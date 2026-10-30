/**
 * calcInputs.ts — the input bounds of «الحاسبة القانونية» (/ai/fee-calculator),
 * checked BEFORE anything is calculated (owner finding LIVE-F30).
 *
 * The owner's live test typed −5 hours and got negative fees, and typed a
 * service of −5 years and got 0 instead of a refusal. Every field was read with
 * `parseFloat(x) || 0`, which turns a minus sign into a negative amount, an
 * empty or unreadable field into a silent zero, and "5abc" into 5. Here a field
 * is either a number inside its logical bounds or a clear Arabic refusal —
 * never a substituted value. These are sanity bounds on the INPUT; they say
 * nothing about the legal correctness of the formulas.
 *
 * Arabic-Indic digits and thousands separators are accepted (a Saudi keyboard
 * types them); a sign, an exponent or any letter is not.
 */

export interface NumberRule {
  /** The field's name as the error sentence uses it, e.g. «عدد الساعات». */
  label: string;
  min: number;
  max: number;
  /** Whole numbers only (years, months, days). */
  integer?: boolean;
  /** Whether `min` itself is allowed; false means strictly greater than `min`. */
  minInclusive?: boolean;
}

export type Parsed = { ok: true; value: number } | { ok: false; error: string };

function arDigits(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

function arNumber(n: number): string {
  return arDigits(n.toLocaleString("en-US").replace(/,/g, "٬"));
}

/** "١٢٬٥٠٠" / "12,500.5" → "12500.5"; anything else is returned as-is to fail the shape test. */
function normalise(raw: string): string {
  return raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[,٬\s]/g, "");
}

/** A required number inside `rule`'s bounds, or the Arabic reason it is refused. */
export function parseBounded(raw: string | null | undefined, rule: NumberRule): Parsed {
  const text = (raw ?? "").trim();
  if (!text) return { ok: false, error: `أدخل ${rule.label}.` };
  const western = normalise(text);
  if (/^[-−–]/.test(western)) {
    return { ok: false, error: `${rule.label} لا يكون سالباً.` };
  }
  if (!/^\d+(\.\d+)?$/.test(western)) {
    return { ok: false, error: `${rule.label}: اكتب رقماً فقط، دون رموز أو حروف.` };
  }
  const value = Number(western);
  if (!Number.isFinite(value)) return { ok: false, error: `${rule.label}: الرقم غير صالح.` };
  if (rule.integer && !Number.isInteger(value)) {
    return { ok: false, error: `${rule.label} يكون عدداً صحيحاً دون كسور.` };
  }
  const inclusive = rule.minInclusive ?? true;
  if (value > rule.max || (inclusive ? value < rule.min : value <= rule.min)) {
    const low = inclusive ? `من ${arNumber(rule.min)}` : `أكبر من ${arNumber(rule.min)}`;
    return { ok: false, error: `${rule.label} يجب أن يكون ${low} إلى ${arNumber(rule.max)}.` };
  }
  return { ok: true, value };
}

/** Like parseBounded, but an empty field is 0 (an optional allowance). */
export function parseOptional(raw: string | null | undefined, rule: NumberRule): Parsed {
  return (raw ?? "").trim() === "" ? { ok: true, value: 0 } : parseBounded(raw, rule);
}

// ─── أتعاب المحامي ────────────────────────────────────────────────────────────

export const HOURS_RULE: NumberRule = { label: "عدد الساعات", min: 0, max: 10_000, minInclusive: false };
export const CASE_VALUE_RULE: NumberRule = { label: "قيمة النزاع", min: 0, max: 100_000_000_000, minInclusive: false };

/**
 * null when the lawyer-fee inputs may be calculated; otherwise the refusal.
 * Choosing «بالساعة» or «نسبة من القضية» and leaving its field empty used to
 * fall back silently to the fixed-fee formula — that is refused too.
 */
export function lawyerFeeInputError(inputs: { feeModel: string; estimatedHours: string; caseValue: string }): string | null {
  if (inputs.feeModel === "hourly") {
    const h = parseBounded(inputs.estimatedHours, HOURS_RULE);
    return h.ok ? null : h.error;
  }
  if (inputs.feeModel === "contingency") {
    const v = parseBounded(inputs.caseValue, CASE_VALUE_RULE);
    return v.ok ? null : v.error;
  }
  return null;
}

// ─── مستحقات العمل ───────────────────────────────────────────────────────────

export const SALARY_RULE: NumberRule = { label: "الراتب الأساسي", min: 0, max: 10_000_000, minInclusive: false };
export const ALLOWANCE_RULE = (label: string): NumberRule => ({ label, min: 0, max: 10_000_000 });
export const YEARS_RULE: NumberRule = { label: "سنوات الخدمة", min: 0, max: 60, integer: true };
export const MONTHS_RULE: NumberRule = { label: "شهور الخدمة", min: 0, max: 11, integer: true };
export const LEAVE_DAYS_RULE: NumberRule = { label: "أيام الإجازة غير المستخدمة", min: 0, max: 365 };
export const NOTICE_MONTHS_RULE: NumberRule = { label: "أشهر الإشعار المُعطاة", min: 0, max: 24 };

export interface LaborNumbers {
  baseSalary: number;
  housing: number;
  other: number;
  years: number;
  months: number;
  leaveDays: number;
  noticeMonths: number;
}

/**
 * The labour-rights inputs as numbers, or the first refusal. A service of
 * zero years and zero months is refused: there is no service to compute on,
 * and showing «0 ر.س» would read as an answer.
 */
export function parseLaborInputs(inp: {
  salary: string;
  housingAllowance: string;
  otherAllowances: string;
  yearsOfService: string;
  monthsOfService: string;
  hasUnusedLeave: boolean;
  unusedLeaveDays: string;
  hasNoticePeriod: boolean;
  noticePeriodMonths: string;
}): { ok: true; value: LaborNumbers } | { ok: false; error: string } {
  const salary = parseBounded(inp.salary, SALARY_RULE);
  if (!salary.ok) return salary;
  const housing = parseOptional(inp.housingAllowance, ALLOWANCE_RULE("بدل السكن"));
  if (!housing.ok) return housing;
  const other = parseOptional(inp.otherAllowances, ALLOWANCE_RULE("البدلات الأخرى"));
  if (!other.ok) return other;
  const years = parseOptional(inp.yearsOfService, YEARS_RULE);
  if (!years.ok) return years;
  const months = parseOptional(inp.monthsOfService, MONTHS_RULE);
  if (!months.ok) return months;
  if (years.value === 0 && months.value === 0) {
    return { ok: false, error: "أدخل مدة خدمة أكبر من صفر (سنوات أو شهور)." };
  }
  let leaveDays = 0;
  if (inp.hasUnusedLeave) {
    const l = parseBounded(inp.unusedLeaveDays, LEAVE_DAYS_RULE);
    if (!l.ok) return l;
    leaveDays = l.value;
  }
  let noticeMonths = 0;
  if (inp.hasNoticePeriod) {
    const n = parseBounded(inp.noticePeriodMonths, NOTICE_MONTHS_RULE);
    if (!n.ok) return n;
    noticeMonths = n.value;
  }
  return {
    ok: true,
    value: {
      baseSalary: salary.value,
      housing: housing.value,
      other: other.value,
      years: years.value,
      months: months.value,
      leaveDays,
      noticeMonths,
    },
  };
}
