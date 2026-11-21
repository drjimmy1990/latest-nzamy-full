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
 *
 * l12 Q130a (owner answers of 20 Nov): the three rates are now an admin
 * setting — platform_settings.marketplace_commission_pct (20261202_70), read
 * by src/lib/marketplace/marketSettingsServer.ts and edited on
 * /dashboard/admin/marketplace/orders. COMMISSION_PCT stays the default and
 * the fallback; every function takes an optional `rates` so a page that has
 * read the setting shows it. Each rate is held to the Terms' «٥٪–١٥٪» range
 * (parseCommissionRates). Nothing collects a commission today: payment
 * through the platform is OFF.
 */

export const COMMISSION_PCT = Object.freeze({
  /** «باقة المحامي المؤسس» or firm-enterprise (R4). */
  founderOrEnterprise: 5,
  /** Any other paid plan. */
  subscriber: 7,
  /** No paid plan. */
  free: 15,
});

/** The three rates, in the shape of COMMISSION_PCT. */
export interface CommissionRates {
  founderOrEnterprise: number;
  subscriber: number;
  free: number;
}

/** The Terms' range («تتراوح بين ٥٪ و١٥٪»): a setting outside it is refused. */
export const COMMISSION_MIN_PCT = 5;
export const COMMISSION_MAX_PCT = 15;

/** One rate if it is a whole number inside the Terms' range, else null. */
export function validCommissionPct(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= COMMISSION_MIN_PCT && n <= COMMISSION_MAX_PCT ? n : null;
}

/**
 * platform_settings.marketplace_commission_pct → the three rates. A missing
 * row, a malformed value or a rate outside 5–15 falls back to COMMISSION_PCT
 * for that rate (never a made-up number).
 */
export function parseCommissionRates(value: unknown): CommissionRates {
  const v = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    founderOrEnterprise: validCommissionPct(v.founderOrEnterprise) ?? COMMISSION_PCT.founderOrEnterprise,
    subscriber: validCommissionPct(v.subscriber) ?? COMMISSION_PCT.subscriber,
    free: validCommissionPct(v.free) ?? COMMISSION_PCT.free,
  };
}

/** The plans whose holders pay the lowest rate (R4). */
const LOWEST_RATE_PLANS: ReadonlySet<string> = new Set(["firm-enterprise", "lawyer-founder-2026"]);

export interface CommissionInput {
  /** The holder's active plan id (price-book id), or null / "" / "free" for none. */
  plan: string | null | undefined;
  /** True while the account holds the lawyer founder membership. */
  founder?: boolean;
}

/** The commission percentage for an account (owner ٤٢١). */
export function commissionPctFor({ plan, founder = false }: CommissionInput, rates: CommissionRates = COMMISSION_PCT): number {
  const id = typeof plan === "string" ? plan.trim().toLowerCase() : "";
  if (founder || LOWEST_RATE_PLANS.has(id)) return rates.founderOrEnterprise;
  if (id === "" || id === "free" || id.endsWith("-free")) return rates.free;
  return rates.subscriber;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** 7 → «٧٪» (ar) / "7%" (en). */
export function commissionPctText(pct: number, lang: "ar" | "en"): string {
  if (lang === "en") return `${pct}%`;
  return `${String(pct).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)])}٪`;
}

/** The one-line rate table, e.g. «٥٪ للمؤسسين وشركات المحاماة المتكاملة · ٧٪ للمشتركين · ١٥٪ للحسابات المجانية». */
export function commissionRatesLine(lang: "ar" | "en", rates: CommissionRates = COMMISSION_PCT): string {
  const t = (n: number) => commissionPctText(n, lang);
  return lang === "ar"
    ? `${t(rates.founderOrEnterprise)} للمؤسسين وشركات المحاماة المتكاملة · ${t(rates.subscriber)} للمشتركين · ${t(rates.free)} للحسابات المجانية`
    : `${t(rates.founderOrEnterprise)} founders and full-service law firms · ${t(rates.subscriber)} subscribers · ${t(rates.free)} free accounts`;
}
