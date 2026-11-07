/**
 * commission.ts — the platform's marketplace commission, one source of truth
 * (owner ٤٢١, 3 Nov 2026).
 *
 *   5 %  holders of «باقة المحامي المؤسس» (lawyer-founder-2026) and of
 *        «شركات المحاماة المتكاملة» = firm-enterprise (ruling R4);
 *   7 %  every other paying subscriber;
 *   15 % a free account.
 *
 * The marketplace itself is parked (src/lib/betaConfig.ts BETA_MONOPOLY_MODE):
 * nothing charges a commission today. These rates are what the /pricing
 * providers tab and the parked marketplace pages DISPLAY, so they all say the
 * same thing. The Terms keep their «٥٪–١٥٪» range, which these rates sit in.
 *
 * Pure: no imports, so `node --test` loads it (commission.test.ts). The two
 * plan ids are written out here; commission.test.ts holds them to the price
 * book (founderPlan.ts FOUNDER_PLAN_ID, PRICE_BOOK["firm-enterprise"]).
 */

export const COMMISSION_PCT = Object.freeze({
  /** «باقة المحامي المؤسس» or firm-enterprise (R4). */
  founderOrEnterprise: 5,
  /** Any other paid plan. */
  subscriber: 7,
  /** No paid plan. */
  free: 15,
});

/** The plans whose holders pay the lowest rate (R4). */
const LOWEST_RATE_PLANS: ReadonlySet<string> = new Set(["firm-enterprise", "lawyer-founder-2026"]);

export interface CommissionInput {
  /** The holder's active plan id (price-book id), or null / "" / "free" for none. */
  plan: string | null | undefined;
  /** True while the account holds the lawyer founder membership. */
  founder?: boolean;
}

/** The commission percentage for an account (owner ٤٢١). */
export function commissionPctFor({ plan, founder = false }: CommissionInput): number {
  const id = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  if (founder || LOWEST_RATE_PLANS.has(id)) return COMMISSION_PCT.founderOrEnterprise;
  if (id === "" || id === "free" || id.endsWith("-free")) return COMMISSION_PCT.free;
  return COMMISSION_PCT.subscriber;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** 7 → «٧٪» (ar) / "7%" (en). */
export function commissionPctText(pct: number, lang: "ar" | "en"): string {
  if (lang === "en") return `${pct}%`;
  return `${String(pct).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)])}٪`;
}

/** The one-line rate table, e.g. «٥٪ للمؤسسين وشركات المحاماة المتكاملة · ٧٪ للمشتركين · ١٥٪ للحسابات المجانية». */
export function commissionRatesLine(lang: "ar" | "en"): string {
  const t = (n: number) => commissionPctText(n, lang);
  return lang === "ar"
    ? `${t(COMMISSION_PCT.founderOrEnterprise)} للمؤسسين وشركات المحاماة المتكاملة · ${t(COMMISSION_PCT.subscriber)} للمشتركين · ${t(COMMISSION_PCT.free)} للحسابات المجانية`
    : `${t(COMMISSION_PCT.founderOrEnterprise)} founders and full-service law firms · ${t(COMMISSION_PCT.subscriber)} subscribers · ${t(COMMISSION_PCT.free)} free accounts`;
}
