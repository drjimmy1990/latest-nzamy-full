/**
 * officePlan.ts — owner decision س٢١٢ (25 Nov 2026): «إدارة المكتب» is paid.
 *
 *   FREE  : the profile, market intake (claiming a client's request), the
 *           per-point tools, 1 GB of stored files.
 *   PAID  : team & seats, cases & clients, shared documents, tasks / hearings,
 *           invoices & reports — «إدارة المكتب» (lawyer-pro, lawyer-bundle),
 *           the firm plans, or a founder seat (the founder's ERP year).
 *
 * The rule lives in the database: public.office_features_locked(uid)
 * (20261206_70) — a lawyer or firm account, or an active firm member, with no
 * paid plan of his own, no founder seat and no paid firm. A session asks only
 * about itself through public.my_office_features_locked(); the server gate is
 * ./assertOfficePlan.ts. Cases and clients are also held by the database
 * triggers (solo_lawyer_limits() is the free allowance, 0 / 0 by default —
 * the owner has not said whether anything stays free).
 *
 * Pure, no imports: `node --test` loads it, and client screens may import it.
 */

export const OFFICE_PLAN_REQUIRED_CODE = "office_plan_required" as const;

/** The lawyer's plan, as the price book names it (lawyer-pro / lawyer-bundle). */
export const OFFICE_PLAN_NAME_AR = "إدارة المكتب";
/** A firm's plans (firm-basic «مكتب المحاماة» / firm-enterprise «شركة المحاماة»). */
export const FIRM_PLANS_AR = "باقة المكتب («مكتب المحاماة» أو «شركة المحاماة»)";

/**
 * Where the plans are sold. Plain /pricing: a signed-in account lands on its
 * own family there (audienceForUserType — a lawyer on the lawyers' plans, a
 * firm on the firms'), so neither is sent to a plan it cannot buy.
 */
export const OFFICE_PLAN_PRICING_HREF = "/pricing";
export const OFFICE_PLAN_LINK_AR = "اطّلع على الباقات";

/**
 * Who the sentence speaks to: a lawyer (his «إدارة المكتب»), a firm or a
 * firm's member (the firm plans), or unknown (a database refusal that carries
 * only a token — both are named).
 */
export type OfficeAudience = "lawyer" | "firm" | "any";

/** user_type → audience: a lawyer buys «إدارة المكتب»; a firm (and its members) a firm plan. */
export function officeAudienceFor(userType: string | null | undefined): OfficeAudience {
  if (userType === "lawyer") return "lawyer";
  if (typeof userType === "string" && userType !== "") return "firm";
  return "any";
}

const PLAN_PHRASE: Readonly<Record<OfficeAudience, string>> = Object.freeze({
  lawyer: `باقة «${OFFICE_PLAN_NAME_AR}»`,
  firm: FIRM_PLANS_AR,
  any: `باقة «${OFFICE_PLAN_NAME_AR}» للمحامي أو ${FIRM_PLANS_AR}`,
});

export type OfficeFeature =
  | "team"
  | "cases"
  | "clients"
  | "documents"
  | "tasks"
  | "hearings"
  | "deadlines"
  | "invoices"
  | "reports";

const FEATURE_AR: Readonly<Record<OfficeFeature, string>> = Object.freeze({
  team: "إدارة الفريق والمقاعد",
  cases: "إضافة القضايا وإدارتها",
  clients: "إضافة الموكلين وإدارتهم",
  documents: "مشاركة المستندات",
  tasks: "المهام",
  hearings: "الجلسات",
  deadlines: "المواعيد النظامية",
  invoices: "الفواتير",
  reports: "التقارير وكشوف الأتعاب",
});

/** The plan phrase for an audience: «باقة «إدارة المكتب»» / the firm plans / both. */
export function officePlanPhraseAr(audience: OfficeAudience = "any"): string {
  return PLAN_PHRASE[audience] ?? PLAN_PHRASE.any;
}

/** «<feature> متاحة في <plan>.» — what a refused write says. */
export function officePlanMessageAr(feature?: OfficeFeature | null, audience: OfficeAudience = "any"): string {
  const name = feature ? FEATURE_AR[feature] : "هذه الميزة";
  return `${name} متاحة في ${PLAN_PHRASE[audience] ?? PLAN_PHRASE.any}.`;
}

/** The general sentence, used where no feature is named. */
export const OFFICE_PLAN_REQUIRED_AR = officePlanMessageAr(null, "any");

/** True when `message` is one of the sentences of this module (a screen that kept only the text). */
export function isOfficePlanMessage(message: string | null | undefined): boolean {
  if (typeof message !== "string" || message === "") return false;
  return (
    message.includes(`متاحة في باقة «${OFFICE_PLAN_NAME_AR}»`) ||
    message.includes(`متاحة في ${FIRM_PLANS_AR}`) ||
    message.includes(STORAGE_UPGRADE_AR)
  );
}

/** The JSON body of a refusal: the sentence, the code and the real link. */
export function officePlanRefusalBody(feature?: OfficeFeature | null, audience: OfficeAudience = "any"): {
  error: string;
  code: typeof OFFICE_PLAN_REQUIRED_CODE;
  linkHref: string;
  linkLabel: string;
} {
  return {
    error: officePlanMessageAr(feature, audience),
    code: OFFICE_PLAN_REQUIRED_CODE,
    linkHref: OFFICE_PLAN_PRICING_HREF,
    linkLabel: OFFICE_PLAN_LINK_AR,
  };
}

/** A failed check that is not a refusal: the account was not read. */
export const OFFICE_PLAN_UNAVAILABLE_AR = "تعذّر التحقق من باقتك الآن، حاول مرة أخرى بعد قليل.";

// The function does not exist yet (the code was deployed before 20261206_70):
// the write goes through, as it did before the gate.
const MISSING_FUNCTION = new Set(["42883", "PGRST202"]);

export type OfficeGateDecision = "allow" | "locked" | "unavailable" | "not_installed";

/**
 * The answer of `rpc("my_office_features_locked")` → what the route does.
 *   data true                 → "locked"        (refuse with the plan sentence)
 *   data false                → "allow"
 *   a missing function        → "not_installed" (allow; logged once)
 *   any other error / no data → "unavailable"   (refuse 503: fail closed)
 */
export function officeGateDecision(read: { data?: unknown; error?: { code?: string | null } | null } | null | undefined): OfficeGateDecision {
  if (!read) return "unavailable";
  if (read.error) {
    return MISSING_FUNCTION.has(String(read.error.code ?? "")) ? "not_installed" : "unavailable";
  }
  if (read.data === true) return "locked";
  if (read.data === false) return "allow";
  return "unavailable";
}

// ─── 1 GB for the free side ──────────────────────────────────────────────────

export const STORAGE_QUOTA_FULL_TOKEN = "storage_quota_full" as const;

const GB = 1024 ** 3;
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const ar = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]).replace(".", "٫");

function gbText(bytes: number): string {
  const v = Math.round((bytes / GB) * 10) / 10;
  return ar(Number.isInteger(v) ? v : Number(v.toFixed(1)));
}

const STORAGE_UPGRADE_AR = "أو اشترك في إحدى الباقات المدفوعة لإدارة المكتب لرفع ملفات جديدة";

/** The same without a number — for a refusal that carries only the token. */
export const STORAGE_QUOTA_FULL_AR =
  `بلغت ملفاتك المحفوظة سعة الحساب المجاني. احذف ما لا تحتاج إليه من الملفات، ${STORAGE_UPGRADE_AR}.`;

/** The sentence when a free account's stored files reached the cap. */
export function storageQuotaFullAr(capBytes: number): string {
  const cap = Number.isFinite(capBytes) && capBytes > 0 ? capBytes : GB;
  return (
    `بلغت ملفاتك المحفوظة ${gbText(cap)} جيجابايت، وهي سعة الحساب المجاني. ` +
    `احذف ما لا تحتاج إليه من الملفات، ${STORAGE_UPGRADE_AR}.`
  );
}

export interface StorageQuotaRow {
  used_bytes?: unknown;
  cap_bytes?: unknown;
  limited?: unknown;
}

/**
 * The answer of `rpc("my_storage_quota")` → may this account upload a file of
 * `fileBytes`? Refuses only a limited account already at the cap (the same
 * rule the database trigger holds — a file that starts below the cap passes).
 * Anything unreadable allows: the database trigger is the real gate.
 */
export function storageQuotaCheck(row: StorageQuotaRow | null | undefined): { ok: true } | { ok: false; message: string } {
  if (!row || row.limited !== true) return { ok: true };
  const used = Number(row.used_bytes);
  const cap = Number(row.cap_bytes);
  if (!Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0) return { ok: true };
  if (used >= cap) return { ok: false, message: storageQuotaFullAr(cap) };
  return { ok: true };
}
