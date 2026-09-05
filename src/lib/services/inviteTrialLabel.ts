import { countPhraseAr } from "./arabicCount.ts";

/**
 * inviteTrialLabel.ts — the /invite/[code] landing page's trial-length
 * phrase. Pure: no I/O, so it is unit-tested without a database.
 *
 * `public.invitations.trial_days` (20260706_content_and_ops.sql) defaults to
 * 14 and carries no CHECK constraint — any positive integer is a legitimate
 * value, not only the 30/60/90 the old localStorage mock ever produced (it
 * hardcoded `trialDays: 30` for every code). The three named cases below are
 * kept because they read better than a bare day count ("شهر كامل" instead of
 * "٣٠ يوماً"); every other value — including the schema default, 14, and a
 * short promo like 1/2/7 days — falls through to `countPhraseAr` (this
 * platform's one counted-noun rule, src/lib/services/arabicCount.ts), so a
 * 14-day invite is never promised as three months AND a 7-day invite gets
 * the grammatically correct «٧ أيام» rather than the 11-and-up tamyiz form
 * «٧ يوماً» a naive digit+noun concatenation would have produced.
 */
export function trialLengthLabel(days: number, ar: boolean): string {
  if (!Number.isFinite(days) || days <= 0) {
    return ar ? "فترة تجريبية" : "a trial period";
  }
  const n = Math.floor(days);
  if (n === 30) return ar ? "شهر كامل" : "1 full month";
  if (n === 60) return ar ? "شهرين كاملين" : "2 full months";
  if (n === 90) return ar ? "3 أشهر كاملة" : "3 full months";
  if (!ar) return `${n} day${n === 1 ? "" : "s"}`;
  // n is always >= 1 here (the guard above returns early for n <= 0), so
  // countPhraseAr's `zero` branch is unreachable — the fallback below only
  // satisfies the type (string | null), never actually fires.
  return (
    countPhraseAr(n, {
      zero: null,
      one: "يوم واحد",
      two: "يومان",
      few: "أيام",
      many: "يوماً",
    }) ?? "فترة تجريبية"
  );
}
