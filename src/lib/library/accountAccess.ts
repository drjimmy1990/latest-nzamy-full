/**
 * accountAccess.ts — owner item 9 (18 Nov 2026, batch l8): the legal library
 * is open per ACCOUNT TYPE, switched by an admin
 * (platform_settings.library_access_by_account_type), with an optional
 * per-account exception (public.library_access_user_overrides).
 *
 *   lawyer      open by default   (a lawyer member of a firm is a lawyer: open)
 *   consultant  open by default   (a lawyer whose practice_kind is consultant)
 *   firm        open by default   (the firm account itself)
 *   individual  closed
 *   business    closed            (corporate, micro, government, ngo)
 *   provider    closed            (not in the owner's list; closed like the rest)
 *   admin       always open       (no switch)
 *
 * The authority is the SQL function public.library_access_for(uuid)
 * (20261128_20); this file is its twin for the window before that SQL runs and
 * the pure rule the tests pin. A missing or malformed switch reads as the
 * default above.
 *
 * Owner ق٢٦-٢ (package 2026-11-26): the default is OPEN for the three legal
 * professions — lawyer, consultant and the law firm — and closed for the rest
 * (individual, business, provider). It supersedes the 28 Nov seed, which
 * opened the lawyer only. 20261208_40 brings the stored switch in line, but
 * only where no admin has saved it (an admin's choice is kept). Open still
 * means the preview + the free questions; the full text needs a library plan
 * and the points floor as before.
 *
 * Pure: no imports, so node --test loads it.
 */

export const LIBRARY_ACCESS_SETTING_KEY = "library_access_by_account_type";

export const LIBRARY_ACCOUNT_KEYS = ["lawyer", "consultant", "firm", "individual", "business", "provider"] as const;
export type LibraryAccountKey = (typeof LIBRARY_ACCOUNT_KEYS)[number];
export type LibraryAccessMap = Record<LibraryAccountKey, boolean>;

export const LIBRARY_ACCESS_DEFAULTS: Readonly<LibraryAccessMap> = Object.freeze({
  lawyer: true,
  consultant: true,
  firm: true,
  individual: false,
  business: false,
  provider: false,
});

/** The admin page's names for the switches. */
export const LIBRARY_ACCOUNT_LABELS_AR: Readonly<Record<LibraryAccountKey, string>> = Object.freeze({
  lawyer: "محامٍ",
  consultant: "مستشار قانوني",
  firm: "مكتب محاماة (حساب المكتب)",
  individual: "فرد",
  business: "منشأة (شركة، منشأة صغيرة، جهة حكومية، جمعية)",
  provider: "مقدّم خدمة",
});

/**
 * The closed account's message (owner item 9.3's sentence, reworded for
 * ق٢٦-٢: the library is open to lawyers, legal consultants and law firms by
 * default, so «للمحامين فقط» was no longer true).
 */
export const LIBRARY_ACCOUNT_LOCKED_AR = "المكتبة القانونية متاحة حالياً للمحامين والمستشارين القانونيين ومكاتب المحاماة، وستُفتح لحسابات أخرى قريباً";
export const LIBRARY_ACCOUNT_LOCKED_CODE = "library_account_locked";

const BUSINESS_TYPES: ReadonlySet<string> = new Set(["corporate", "micro", "government", "ngo"]);

/**
 * The switch an account answers to: its profiles.user_type, a lawyer split by
 * practice_kind (a missing lawyer_profiles row is an advocate, the platform's
 * fail-open-to-advocate rule). "admin" has no switch; null = no profile or an
 * unknown type (closed).
 */
export function libraryAccountKey(userType: unknown, practiceKind: unknown): LibraryAccountKey | "admin" | null {
  if (typeof userType !== "string") return null;
  if (userType === "admin") return "admin";
  if (userType === "lawyer") return practiceKind === "consultant" ? "consultant" : "lawyer";
  if (userType === "firm") return "firm";
  if (userType === "individual") return "individual";
  if (userType === "provider") return "provider";
  if (BUSINESS_TYPES.has(userType)) return "business";
  return null;
}

/** The stored switch map, every key filled: a key that is not a boolean keeps its default. */
export function parseLibraryAccessMap(value: unknown): LibraryAccessMap {
  const out: LibraryAccessMap = { ...LIBRARY_ACCESS_DEFAULTS };
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const v = value as Record<string, unknown>;
  for (const key of LIBRARY_ACCOUNT_KEYS) {
    if (typeof v[key] === "boolean") out[key] = v[key] as boolean;
  }
  return out;
}

export type LibraryAccessVia = "admin" | "override" | "type" | "no_profile";

export interface LibraryAccessDecision {
  allowed: boolean;
  accountKey: LibraryAccountKey | "admin" | null;
  via: LibraryAccessVia;
}

/**
 * The rule (the same as public.library_access_for): admin → open; an
 * override row → its `allowed`; else the type's switch. No profile → closed.
 */
export function libraryAccessDecision(input: {
  userType: unknown;
  practiceKind: unknown;
  map: unknown;
  override: boolean | null;
}): LibraryAccessDecision {
  const accountKey = libraryAccountKey(input.userType, input.practiceKind);
  if (accountKey === "admin") return { allowed: true, accountKey, via: "admin" };
  if (typeof input.userType !== "string") return { allowed: false, accountKey: null, via: "no_profile" };
  if (typeof input.override === "boolean") return { allowed: input.override, accountKey, via: "override" };
  if (accountKey === null) return { allowed: false, accountKey, via: "type" };
  return { allowed: parseLibraryAccessMap(input.map)[accountKey], accountKey, via: "type" };
}

/**
 * Q94a (batch l12, 20261202_50): an exception may END — at `expiresAt`, or
 * with the account's library subscription (`endsWithSubscription`: in force
 * while a library grant covers now, so it follows a renewal). Neither = a
 * permanent exception (a team member), as before. The same rule as
 * public.library_access_for; out of force the exception is ignored and the
 * type's switch answers.
 */
export interface OverrideEnd {
  expiresAt: string | null;
  endsWithSubscription: boolean;
}

export function overrideInForce(end: OverrideEnd, hasActiveLibraryGrant: boolean, now: number = Date.now()): boolean {
  const at = end.expiresAt ? Date.parse(end.expiresAt) : NaN;
  const dated = end.expiresAt !== null && end.expiresAt !== "";
  if (!dated && !end.endsWithSubscription) return true;
  if (dated && Number.isFinite(at) && at > now) return true;
  return end.endsWithSubscription && hasActiveLibraryGrant;
}

/** A stored override row's end (missing columns — the SQL not run — read as no end). */
export function overrideEndFromRow(row: unknown): OverrideEnd {
  const r = (row && typeof row === "object" ? row : {}) as { expires_at?: unknown; ends_with_subscription?: unknown };
  return {
    expiresAt: typeof r.expires_at === "string" && r.expires_at !== "" ? r.expires_at : null,
    endsWithSubscription: r.ends_with_subscription === true,
  };
}

/** The body of a locked answer (403). */
export function libraryAccountLockedBody(): { error: string; code: string; libraryAccountLocked: true } {
  return { error: LIBRARY_ACCOUNT_LOCKED_AR, code: LIBRARY_ACCOUNT_LOCKED_CODE, libraryAccountLocked: true };
}

/** True for a JSON body the server sent for a locked account. */
export function isLibraryAccountLockedBody(body: unknown): boolean {
  return !!body && typeof body === "object" && (body as { code?: unknown }).code === LIBRARY_ACCOUNT_LOCKED_CODE;
}

/**
 * The admin's PUT body: `{ map: { key: boolean, … } }`, at least one known key,
 * every named key a boolean. Unknown keys are refused, so a typo never saves.
 */
export function parseLibraryAccessPatch(
  body: unknown,
): { ok: true; patch: Partial<LibraryAccessMap> } | { ok: false; error: string } {
  const map = body && typeof body === "object" ? (body as { map?: unknown }).map : undefined;
  if (!map || typeof map !== "object" || Array.isArray(map)) return { ok: false, error: "أرسل المفاتيح في الحقل map" };
  const patch: Partial<LibraryAccessMap> = {};
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    if (!(LIBRARY_ACCOUNT_KEYS as readonly string[]).includes(k)) return { ok: false, error: `نوع حساب غير معروف: ${k.slice(0, 40)}` };
    if (typeof v !== "boolean") return { ok: false, error: "قيمة المفتاح يجب أن تكون تشغيلاً أو إيقافاً" };
    patch[k as LibraryAccountKey] = v;
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: "لم يُرسل أي تغيير" };
  return { ok: true, patch };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}$/;

/** The furthest an exception's date may be set (five years). */
export const OVERRIDE_MAX_DAYS = 5 * 366;

/**
 * Q94a: `expiresAt` as the admin sends it — a date «YYYY-MM-DD» (the end of
 * that day, Riyadh time) or a full ISO time. null = no date. Must be in the
 * future and within OVERRIDE_MAX_DAYS.
 */
export function parseOverrideExpiry(value: unknown, now: number = Date.now()): { ok: true; expiresAt: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, expiresAt: null };
  if (typeof value !== "string") return { ok: false, error: "تاريخ انتهاء الاستثناء غير صالح" };
  const v = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T23:59:59+03:00` : v;
  const at = /^\d{4}-\d{2}-\d{2}T/.test(iso) ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return { ok: false, error: "تاريخ انتهاء الاستثناء غير صالح" };
  if (at <= now) return { ok: false, error: "تاريخ انتهاء الاستثناء يجب أن يكون بعد اليوم" };
  if (at > now + OVERRIDE_MAX_DAYS * 86_400_000) return { ok: false, error: "تاريخ انتهاء الاستثناء بعيد جداً (خمس سنوات على الأكثر)" };
  return { ok: true, expiresAt: new Date(at).toISOString() };
}

/**
 * The admin's override body: `{ userId | email, allowed, reason, expiresAt?,
 * endsWithSubscription? }`; a reason is required. Q94a: an exception may end
 * on a date and/or with the account's library subscription.
 */
export function parseOverrideInput(
  body: unknown,
  now: number = Date.now(),
):
  | { ok: true; userId: string | null; email: string | null; allowed: boolean; reason: string; expiresAt: string | null; endsWithSubscription: boolean }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "بيانات غير صالحة" };
  const b = body as Record<string, unknown>;
  const userId = typeof b.userId === "string" && UUID.test(b.userId.trim()) ? b.userId.trim().toLowerCase() : null;
  const email = !userId && typeof b.email === "string" && EMAIL.test(b.email.trim()) ? b.email.trim().toLowerCase() : null;
  if (!userId && !email) return { ok: false, error: "أدخل البريد الإلكتروني للحساب أو معرّفه" };
  if (typeof b.allowed !== "boolean") return { ok: false, error: "حدّد: فتح المكتبة لهذا الحساب أو إغلاقها" };
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  if (reason.length < 3) return { ok: false, error: "اكتب سبب الاستثناء (فريق، تجربة…)" };
  if (reason.length > 500) return { ok: false, error: "السبب أطول من 500 حرف" };
  if (b.endsWithSubscription !== undefined && typeof b.endsWithSubscription !== "boolean") {
    return { ok: false, error: "قيمة «ينتهي بانتهاء اشتراك المكتبة» غير صالحة" };
  }
  const expiry = parseOverrideExpiry(b.expiresAt, now);
  if (!expiry.ok) return expiry;
  return { ok: true, userId, email, allowed: b.allowed, reason, expiresAt: expiry.expiresAt, endsWithSubscription: b.endsWithSubscription === true };
}

/** A /laws (or /precedents, /book) link: the library's own pages. */
export function isLibraryHref(href: unknown): boolean {
  return typeof href === "string" && /^\/(laws|precedents|book)(\/|$|\?)/.test(href);
}

interface NavItemLike {
  href: string;
  children?: NavItemLike[];
}
interface NavGroupLike<I extends NavItemLike> {
  items: I[];
}

/**
 * Owner item 9.3: a locked account's sidebar does not show the library. The
 * rows linking to the library pages are dropped (children too); a group left
 * empty is dropped.
 */
export function withoutLibraryItems<I extends NavItemLike, G extends NavGroupLike<I>>(groups: G[]): G[] {
  const strip = (items: I[]): I[] =>
    items
      .filter((it) => !isLibraryHref(it.href))
      .map((it) => (it.children ? ({ ...it, children: strip(it.children as I[]) } as I) : it));
  return groups.map((g) => ({ ...g, items: strip(g.items) })).filter((g) => g.items.length > 0);
}
