/**
 * accountFreeze.ts — the pure half of D6, account deletion (owner ٢٩٨): an
 * independent account is frozen for 60 days, then purged.
 *
 * WHERE THE FREEZE LIVES
 *   The truth is public.account_deletion_requests (20261026_70). The gates
 *   (src/proxy.ts and assertRole) read a cached copy of it from the auth user's
 *   `app_metadata.account_deletion`, which the `getUser()` they already make
 *   returns fresh from GoTrue. So the gate adds no query, and it does not
 *   depend on the migration. Only the service role writes `app_metadata`.
 *   `user_metadata` is never read: the user can write it with his own token.
 *   The routes under /api/v1/me/account-deletion re-sync the copy from the
 *   table, in both directions.
 *
 * Pure, with no imports, so the edge proxy and `node --test` both load it.
 */

/** The app_metadata key the gates read. */
export const ACCOUNT_FREEZE_KEY = "account_deletion";

/** The one page a frozen account may open. */
export const ACCOUNT_FROZEN_PATH = "/account-frozen";

/** Typed by the user in Settings to confirm. */
export const DELETE_CONFIRM_PHRASE_AR = "احذف حسابي";

/** Typed by a super admin to purge at once. */
export const ADMIN_PURGE_CONFIRM_AR = "حذف نهائي";

/**
 * The answer a frozen account gets from a gated API. The gates read only the
 * cached copy, which does not say WHO froze the account, so the text is right
 * for both: a freeze the user asked for he lifts himself, an administration's
 * freeze only an admin lifts (owner ٣١٣) — the page says which.
 */
export const ACCOUNT_FROZEN_AR =
  "حسابك مجمّد. افتح صفحة «حسابك مجمّد»: إن كان التجميد بطلبك فاستعد حسابك منها، وإن كان بقرار من الإدارة فتواصل مع الدعم.";

/**
 * A freeze the administration made (requested_by = "admin"): the user cannot
 * lift it himself (20261026_70 account_deletion_close is self-only for him);
 * only an admin's «استعادة» does. The frozen page shows this with no restore
 * button.
 */
export const ADMIN_FREEZE_AR = "تم تجميد الحساب بقرار من الإدارة — تواصل مع الدعم";

/** True when the request is the administration's (not the user's own). */
export function isAdminFreeze(requestedBy: unknown): boolean {
  return requestedBy === "admin";
}

/** Days of the frozen recovery period (owner ٢٩٨). The database is the authority: purge_after = requested_at + 60 days. */
export const FREEZE_DAYS = 60;

export interface FreezeState {
  frozen: boolean;
  /** ISO timestamp of the earliest purge, when known. */
  purgeAfter: string | null;
}

const NOT_FROZEN: FreezeState = Object.freeze({ frozen: false, purgeAfter: null }) as FreezeState;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Frozen only when `app_metadata.account_deletion.status` is exactly
 * "frozen". Anything else (absent, malformed, "active") is not frozen.
 */
export function freezeStateFromUser(user: unknown): FreezeState {
  if (!isRecord(user)) return { ...NOT_FROZEN };
  const meta = user.app_metadata;
  if (!isRecord(meta)) return { ...NOT_FROZEN };
  const entry = meta[ACCOUNT_FREEZE_KEY];
  if (!isRecord(entry) || entry.status !== "frozen") return { ...NOT_FROZEN };
  const purgeAfter = typeof entry.purge_after === "string" && entry.purge_after.length > 0 ? entry.purge_after : null;
  return { frozen: true, purgeAfter };
}

/** The whole app_metadata to write when freezing: every other key kept. */
export function frozenAppMetadata(existing: unknown, purgeAfter: string | null): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {};
  return { ...base, [ACCOUNT_FREEZE_KEY]: { status: "frozen", purge_after: purgeAfter } };
}

/**
 * The whole app_metadata to write when lifting the freeze. An explicit
 * non-frozen value is written, so the result never depends on how GoTrue
 * treats a null.
 */
export function activeAppMetadata(existing: unknown): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {};
  return { ...base, [ACCOUNT_FREEZE_KEY]: { status: "active" } };
}

/** The typed confirmation, whitespace-normalised. */
export function phraseMatches(typed: unknown, phrase: string): boolean {
  if (typeof typed !== "string") return false;
  return typed.trim().replace(/\s+/g, " ") === phrase;
}

/** The PostgREST / Postgres codes that mean "20261026_70 has not run here". */
export function isMissingAccountDeletionSchema(code: string | null | undefined): boolean {
  return code === "42P01" || code === "42883" || code === "PGRST202" || code === "PGRST205";
}

/** The database's refusal (its message carries a stable token) in Arabic. */
export function deletionErrorAr(message: string | null | undefined): string {
  const m = typeof message === "string" ? message : "";
  if (m.includes("ACCOUNT_DELETION_ADMIN")) {
    return "حساب الإدارة لا يُحذف من الإعدادات. أزل صلاحية الإدارة أولاً من إدارة الفريق.";
  }
  if (m.includes("ACCOUNT_DELETION_ENTITY_OWNER") || m.includes("ACCOUNT_DELETE_ENTITY_OWNER")) {
    const kind = /\b(firm|business|government|ngo)\b/.exec(m.replace(/[_:]/g, " "))?.[1] ?? null;
    return entityOwnerBlockAr(kind);
  }
  if (m.includes("ACCOUNT_PURGE_IN_PROGRESS")) {
    return "جارٍ حذف هذا الحساب الآن. أعد المحاولة بعد ساعة إن لم يكتمل.";
  }
  if (m.includes("ACCOUNT_DELETION_NO_PROFILE")) {
    return "لا يوجد ملف لهذا الحساب.";
  }
  if (m.includes("ACCOUNT_DELETION_NO_USER")) {
    return "هذا الحساب غير موجود.";
  }
  if (m.includes("ACCOUNT_DELETE_FIRM_ASSETS_LEFT")) {
    return "لم يُحذف الحساب: بقيت سجلات مكتب لم يمكن نقلها لصاحب المكتب، فلم يتغير شيء.";
  }
  return "تعذّر تنفيذ طلب حذف الحساب الآن. أعد المحاولة بعد قليل.";
}

/**
 * Owner ٣٠٧: the entity kinds whose ownership blocks the owner's deletion
 * while other members remain (20261026_70 account_entity_owner_block; the
 * caller's own via 20261030_12 account_deletion_owner_block()).
 */
export type EntityOwnerBlock = "firm" | "business" | "government" | "ngo";

/** The block as the database answers it, or null for anything else. */
export function normalizeOwnerBlock(value: unknown): EntityOwnerBlock | null {
  return value === "firm" || value === "business" || value === "government" || value === "ngo" ? value : null;
}

const ENTITY_NAME_AR: Record<EntityOwnerBlock, string> = {
  firm: "المكتب",
  business: "الشركة",
  government: "الجهة",
  ngo: "الجمعية",
};

/**
 * Owner ٣٠٧ (أ): the owner of an entity that still has members cannot delete
 * his account until its ownership is transferred. No screen transfers
 * ownership yet, so the text promises none: it says it is not available and
 * points to support.
 */
export function entityOwnerBlockAr(kind: unknown): string {
  const k = normalizeOwnerBlock(kind);
  const what = k ? ENTITY_NAME_AR[k] : "الجهة";
  return `أنت مالك ${what}، وفي ${what} أعضاء آخرون غيرك، فلا يُحذف حسابك حتى تُنقل ملكية ${what} إلى غيرك. نقل الملكية غير متاح في المنصة بعد، فتواصل مع الدعم.`;
}

/**
 * Owner ٣٠٧: what the frozen page says instead of a purge date when the final
 * deletion is suspended — an entity owner (his ownership must be transferred
 * first), or a purge the database refused (status `blocked`).
 */
export function deletionSuspendedAr(kind: unknown): string {
  const k = normalizeOwnerBlock(kind);
  if (k) {
    const what = ENTITY_NAME_AR[k];
    return `الحذف النهائي موقوف: أنت مالك ${what}، وفي ${what} أعضاء آخرون غيرك، ولا يُحذف الحساب قبل نقل ملكية ${what}. نقل الملكية غير متاح في المنصة بعد.`;
  }
  return "الحذف النهائي موقوف: تعذّر حذف الحساب لسبب تراجعه الإدارة، فبقي مجمّداً ولم يُحذف منه شيء.";
}

/**
 * The admin's «حذف نهائي الآن» that ended blocked: why, in Arabic. `reason`
 * is PurgeRun.reason (entity_owner, firm_assets_left, foreign_key, …).
 */
export function purgeBlockedAr(reason: unknown): string {
  if (reason === "entity_owner") {
    return "لم يُحذف الحساب: صاحبه مالك مكتب أو شركة أو جهة فيها أعضاء آخرون، والحذف النهائي موقوف حتى نقل الملكية — ولا شاشة لنقل الملكية بعد. بقي الحساب مجمّداً بقرار الإدارة.";
  }
  if (reason === "firm_assets_left") {
    return "لم يُحذف الحساب: بقيت سجلات مكتب لم يمكن نقلها لصاحب المكتب، فلم يتغير شيء. بقي الحساب مجمّداً وسُجّل السبب على طلب الحذف.";
  }
  return "لم يُحذف الحساب: بيانات تمنع الحذف. بقي الحساب مجمّداً وسُجّل السبب على طلب الحذف.";
}

export type PurgeOutcome = "purged" | "blocked" | "retry";

/**
 * What a failed `auth.admin.deleteUser` means for the request. GoTrue answers
 * a database refusal (a foreign key, the 20261026_70 guard) with "Database
 * error deleting user". That refusal is deterministic, so it is recorded as
 * blocked and not retried every day. A transport failure is retried.
 */
export function classifyDeleteUserError(message: string | null | undefined): { outcome: PurgeOutcome; reason: string } {
  const m = (typeof message === "string" ? message : "").toLowerCase();
  if (m.includes("user not found")) return { outcome: "purged", reason: "already_gone" };
  if (m.includes("account_delete_entity_owner")) return { outcome: "blocked", reason: "entity_owner" };
  if (m.includes("account_delete_firm_assets_left")) return { outcome: "blocked", reason: "firm_assets_left" };
  if (m.includes("foreign key")) return { outcome: "blocked", reason: "foreign_key" };
  if (m.includes("database error")) return { outcome: "blocked", reason: "database_refused" };
  return { outcome: "retry", reason: "delete_failed" };
}

/**
 * The purge date as an Arabic Gregorian date in Riyadh time («٢٥ ديسمبر
 * ٢٠٢٦»), whatever timezone renders it. Null for anything not a date string.
 */
export function frozenUntilAr(iso: unknown): string | null {
  if (typeof iso !== "string" || iso.length === 0) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("ar-SA", {
    calendar: "gregory",
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(ms));
}
