/**
 * legalDeadlinePresets.ts — the «المواعيد القانونية» tab of the legal
 * calculator (/ai/fee-calculator), on the ONE deadline engine.
 *
 * LIVE-F33 (owner live test 2026-10-30, CALC05): an appeal of 30 days from
 * 29 October gave 28 November here, while the deadline radar had given
 * 29 November, with nothing explaining why. The tab had its own date maths —
 * `new Date("2026-10-29")` (UTC midnight) + 30 days, no المادة (٢٢) roll past
 * a weekend or holiday, hard-coded periods. 28 November 2026 is a Saturday;
 * the engine (and so the radar) rolls it to Sunday the 29th.
 *
 * Now every preset goes through `computeDueDate` with the court holidays,
 * and where the platform has a rule for it (appeal_general, cassation) the
 * rule's own period, flags, source and verification status are used and
 * shown. Presets with no platform rule say so («قاعدة استرشادية»). Nothing
 * here is legal approval — the screen says which rule and whether the owner
 * has reviewed it.
 *
 * Pure — `node --test` loads it.
 */

import { addDays, isoDate, parseIsoDate } from "./deadlineEngine.ts";

export interface LegalDeadlinePreset {
  id: string;
  label: string;
  /** The platform deadline_rules.code this preset follows, when one exists. */
  ruleCode?: string;
  /** Fallback period in days (used when no rule is found). */
  days?: number;
  /** A prescription period in calendar years (same day N years later). */
  years?: number;
  note: string;
}

export const LEGAL_DEADLINE_PRESETS: readonly LegalDeadlinePreset[] = [
  { id: "appeal",      label: "استئناف الحكم",            ruleCode: "appeal_general", days: 30, note: "من اليوم التالي لتسلّم صورة الحكم أو التبليغ به" },
  { id: "cassation",   label: "الطعن بالنقض",             ruleCode: "cassation",      days: 30, note: "من اليوم التالي لتسلّم صورة حكم الاستئناف" },
  { id: "objection",   label: "الاعتراض على أمر الأداء",  days: 10,  note: "من تاريخ إعلان الأمر" },
  { id: "execution",   label: "الاعتراض على التنفيذ",     days: 7,   note: "من تاريخ المباشرة بالتنفيذ" },
  { id: "correction",  label: "تصحيح الحكم",              days: 30,  note: "من تاريخ صدور الحكم" },
  { id: "labor_claim", label: "رفع دعوى عمالية",          years: 1,  note: "من تاريخ انتهاء العلاقة العمالية" },
  { id: "commercial",  label: "التقادم التجاري",          years: 5,  note: "من نشوء الحق" },
  { id: "civil",       label: "التقادم المدني",           years: 10, note: "من نشوء الحق" },
];

/** The subset of a deadline_rules row this tab reads. */
export interface PresetRule {
  code: string;
  ownerUserId: string | null;
  active: boolean;
  titleAr: string;
  periodDays: number;
  countFromNextDay: boolean;
  rollForwardIfHoliday: boolean;
  sourceAr: string;
  verifiedByOwner: boolean;
}

export interface PresetComputationInputs {
  periodDays: number;
  countFromNextDay: boolean;
  rollForwardIfHoliday: boolean;
  /** Where the period came from. */
  basis: "platform_rule" | "guide";
  ruleTitleAr: string | null;
  sourceAr: string | null;
  /** true only for a platform rule the owner verified. */
  verified: boolean;
}

/** Calendar days from `triggerDate` to the same day `years` later. */
export function yearsAsDays(triggerDate: string, years: number): number | null {
  const t = parseIsoDate(triggerDate);
  if (!t) return null;
  const target = new Date(t.getFullYear() + years, t.getMonth(), 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(t.getDate(), lastDay));
  return Math.round((target.getTime() - t.getTime()) / 86_400_000);
}

/**
 * The engine inputs for a preset: the active platform rule when one exists
 * (the radar uses the same row), else the preset's guide period with the
 * المادة (٢٢) defaults — counted from the next day, rolled past weekends
 * and holidays — the same defaults the gov calculator uses for a free entry.
 */
export function presetInputs(
  preset: LegalDeadlinePreset,
  triggerDate: string,
  rules: readonly PresetRule[],
): PresetComputationInputs | null {
  const rule = preset.ruleCode
    ? rules.find((r) => r.code === preset.ruleCode && r.ownerUserId === null && r.active) ?? null
    : null;
  if (rule) {
    return {
      periodDays: rule.periodDays,
      countFromNextDay: rule.countFromNextDay,
      rollForwardIfHoliday: rule.rollForwardIfHoliday,
      basis: "platform_rule",
      ruleTitleAr: rule.titleAr,
      sourceAr: rule.sourceAr || null,
      verified: rule.verifiedByOwner,
    };
  }
  const periodDays = preset.years ? yearsAsDays(triggerDate, preset.years) : preset.days ?? null;
  if (!periodDays || periodDays <= 0) return null;
  return {
    // A year count is "the same day N years later" (leap years included), not N×365.
    periodDays,
    countFromNextDay: true,
    rollForwardIfHoliday: true,
    basis: "guide",
    ruleTitleAr: null,
    sourceAr: null,
    verified: false,
  };
}

/** For tests and the copy line: the unrolled last day of a period. */
export function rawLastDay(triggerDate: string, inputs: PresetComputationInputs): string | null {
  const t = parseIsoDate(triggerDate);
  if (!t) return null;
  return isoDate(addDays(t, inputs.countFromNextDay ? inputs.periodDays : inputs.periodDays - 1));
}
