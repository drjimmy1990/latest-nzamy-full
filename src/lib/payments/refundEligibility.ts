/**
 * refundEligibility.ts — the refund verdict for one platform order (batch l7,
 * decision 10; owner 18 Nov 2026, /founder-terms item ٧; 07 ب-4).
 *
 *   - founder membership (kind 'membership'): eligible only within
 *     WITHDRAWAL_DAYS (14) of paid_at AND with no AI use since paid_at — the
 *     drafter, the pro tools, the library assistant and points. Browsing the
 *     library is never read, so it never blocks. ENFORCED: the refund route
 *     refuses an ineligible founder refund unless the admin types a reason
 *     (MIN_OVERRIDE_REASON_CHARS), and that override is audited before any
 *     money moves (refundCore.ts).
 *   - library / plan: the same rule (07 ب-4 unifies them with the founder's
 *     "no AI used" rule, an owner question still open) — shown, NOT enforced.
 *   - top-up: the published 25-Oct rule (/refund-policy: 14 days, at most
 *     5 % of the points used) on the order's own lot — shown, NOT enforced.
 *
 * The window: eligible while now − paid_at ≤ 14 × 24 h (day 14 to the second
 * is still inside; one second later is not).
 *
 * Fail closed: when any evidence read failed (`evidence.readFailed`) the
 * verdict is «تعذّر التحقق», never «مؤهل»; an enforced order then needs the
 * override like an ineligible one.
 *
 * Pure: relative imports only, so `node --test` loads it.
 */
import { WITHDRAWAL_DAYS, WITHDRAWAL_MAX_POINTS_USED_PCT } from "./refundPolicy.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
export const REFUND_WINDOW_MS = WITHDRAWAL_DAYS * DAY_MS;
export const MIN_OVERRIDE_REASON_CHARS = 10;
export const MAX_OVERRIDE_REASON_CHARS = 500;

export interface RefundEvidence {
  /** Founder credits of THIS order's seat spent and not restored (membership_credit_uses, restored_at null), by kind. */
  creditsUsed: Record<string, number>;
  /** The buyer's AI runs since paid_at that did not fail (succeeded / review / running). */
  aiRuns: Array<{ tool: string; created_at: string }>;
  /** Points debited since paid_at, net of the refunds of failed runs (points_ledger usage − usage_refund). */
  pointsDebited: number;
  /** Points of this order's own lot(s): credited, and spent. */
  orderLotTotal: number;
  orderLotUsed: number;
  /** A read errored: the verdict cannot be «مؤهل». */
  readFailed: boolean;
}

export const NO_EVIDENCE: RefundEvidence = Object.freeze({ creditsUsed: {}, aiRuns: [], pointsDebited: 0, orderLotTotal: 0, orderLotUsed: 0, readFailed: false }) as RefundEvidence;

export type RefundRule = "no_ai_use" | "points_5pct";
export type RefundVerdictState = "eligible" | "ineligible" | "unverified";
export interface RefundVerdict {
  state: RefundVerdictState;
  /** True only for a founder membership: the route refuses without an admin reason. */
  enforced: boolean;
  rule: RefundRule;
  /** «مؤهل للاسترداد» / «غير مؤهل للاسترداد» / «تعذّر التحقق من الأهلية». */
  label: string;
  /** Why it is not eligible (empty when eligible). */
  reasons: string[];
  /** The evidence lines the admin reads before the button. */
  lines: string[];
  daysSincePayment: number;
  windowEndsAt: string;
}

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);
const CREDIT_KIND_AR: Record<string, string> = {
  drafting_work: "أعمال الصائغ",
  independent_output: "مخرج أدوات المحترفين",
  library_question: "أسئلة مساعد المكتبة",
};

export function ruleFor(kind: string): RefundRule {
  return kind === "topup" ? "points_5pct" : "no_ai_use";
}

const dateAr = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t)
    ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(t))
    : "—";
};

/** The verdict, or null when the order has no valid paid_at (the caller refuses it anyway). */
export function refundEligibility(order: { kind: string; paid_at: string | null }, now: Date, evidence: RefundEvidence): RefundVerdict | null {
  const paidAt = order.paid_at ? Date.parse(order.paid_at) : NaN;
  if (!Number.isFinite(paidAt)) return null;
  const elapsed = now.getTime() - paidAt;
  const inWindow = elapsed <= REFUND_WINDOW_MS;
  const daysSincePayment = Math.max(0, Math.floor(elapsed / DAY_MS));
  const windowEndsAt = new Date(paidAt + REFUND_WINDOW_MS).toISOString();
  const rule = ruleFor(order.kind);
  const enforced = order.kind === "membership";
  const reasons: string[] = [];
  const lines: string[] = [];

  lines.push(`مضى على الدفع ${ar(daysSincePayment)} يوماً، ونافذة الاسترداد ${ar(WITHDRAWAL_DAYS)} يوماً تنتهي في ${dateAr(windowEndsAt)}.`);
  if (!inWindow) reasons.push(`انقضت نافذة الـ${ar(WITHDRAWAL_DAYS)} يوماً من تاريخ الدفع.`);

  if (rule === "no_ai_use") {
    const credits = Object.entries(evidence.creditsUsed).filter(([, n]) => n > 0);
    lines.push(credits.length
      ? `أرصدة المؤسس المستخدمة: ${credits.map(([k, n]) => `${CREDIT_KIND_AR[k] ?? k} ${ar(n)}`).join("، ")}.`
      : "لم يُستخدم شيء من أرصدة المؤسس لهذه العملية.");
    const byTool = new Map<string, number>();
    for (const r of evidence.aiRuns) byTool.set(r.tool, (byTool.get(r.tool) ?? 0) + 1);
    lines.push(evidence.aiRuns.length
      ? `تشغيلات الذكاء الاصطناعي منذ الدفع: ${ar(evidence.aiRuns.length)} (${[...byTool].map(([t, n]) => `${t} × ${ar(n)}`).join("، ")})، أولها في ${dateAr(evidence.aiRuns.map((r) => r.created_at).sort()[0])}.`
      : "لا تشغيلات للذكاء الاصطناعي منذ الدفع.");
    lines.push(evidence.pointsDebited > 0 ? `نقاط خُصمت منذ الدفع: ${ar(evidence.pointsDebited)}.` : "لم تُخصم نقاط منذ الدفع.");
    lines.push("تصفح المكتبة القانونية لا يُحتسب ولا يمنع الاسترداد.");
    if (credits.length || evidence.aiRuns.length || evidence.pointsDebited > 0) reasons.push("استُخدمت ميزة ذكاء اصطناعي منذ الدفع.");
  } else {
    const pct = evidence.orderLotTotal ? (evidence.orderLotUsed * 100) / evidence.orderLotTotal : 0;
    lines.push(`نقاط هذه العملية: استُخدم ${ar(evidence.orderLotUsed)} من ${ar(evidence.orderLotTotal)} (${ar(Math.round(pct * 10) / 10)}٪)، والحد ${ar(WITHDRAWAL_MAX_POINTS_USED_PCT)}٪.`);
    if (pct > WITHDRAWAL_MAX_POINTS_USED_PCT) reasons.push(`استُخدم أكثر من ${ar(WITHDRAWAL_MAX_POINTS_USED_PCT)}٪ من نقاط العملية.`);
  }
  if (evidence.readFailed) {
    lines.push("تعذّرت قراءة بعض سجلات الاستخدام؛ لا يمكن تأكيد الأهلية.");
  }

  const state: RefundVerdictState = reasons.length ? "ineligible" : evidence.readFailed ? "unverified" : "eligible";
  const label = state === "eligible" ? "مؤهل للاسترداد" : state === "ineligible" ? "غير مؤهل للاسترداد" : "تعذّر التحقق من الأهلية";
  if (!enforced && state !== "eligible") lines.push("الحكم إرشادي لهذا النوع من العمليات ولا يمنع الاسترداد.");
  return { state, enforced, rule, label, reasons, lines, daysSincePayment, windowEndsAt };
}

/** The override reason, trimmed and checked; null when it is too short or missing. */
export function cleanOverrideReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (text.length < MIN_OVERRIDE_REASON_CHARS) return null;
  return text.slice(0, MAX_OVERRIDE_REASON_CHARS);
}

/** True when the refund must not go ahead without an admin reason. */
export function needsOverride(verdict: RefundVerdict): boolean {
  return verdict.enforced && verdict.state !== "eligible";
}

export const OVERRIDE_REQUIRED_AR = `هذه العملية غير مؤهلة للاسترداد وفق شروط باقة المؤسس (أو تعذّر التحقق من أهليتها). للمتابعة اكتب سبب الاستثناء (${ar(MIN_OVERRIDE_REASON_CHARS)} أحرف على الأقل)؛ يُسجَّل في سجل التدقيق.`;
