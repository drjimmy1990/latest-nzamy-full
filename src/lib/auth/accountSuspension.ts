/**
 * accountSuspension.ts — the pure half of a real admin suspension (owner
 * package 17 Nov 2026, TODO 3.5 / ticket S7).
 *
 * WHAT A SUSPENSION IS (src/lib/accountSuspension/suspensionServer.ts)
 *   1. GoTrue bans the account: auth.admin.updateUserById(id, { ban_duration })
 *      sets auth.users.banned_until, so GoTrue refuses every new sign-in and
 *      every token refresh («user_banned»).
 *   2. The same call writes `app_metadata.account_suspension`, the copy the
 *      app's gates read (only the service role writes app_metadata;
 *      user_metadata is the user's own and is never read here).
 *   3. public.admin_revoke_user_sessions (20261124_60) ends the open sessions,
 *      so GoTrue answers «session_not_found» to the tokens already issued.
 *
 * WHERE IT IS ENFORCED — the gates that already call getUser(), which returns
 * the user fresh from GoTrue (banned_until and app_metadata included), so the
 * check adds no query: src/proxy.ts (both branches), assertRole, and
 * requireApiUser / frozenAccountResponse in src/lib/auth/apiAuth.ts.
 *
 * Pure, with no imports, so the edge proxy and `node --test` both load it.
 */

/** The app_metadata key the gates read. */
export const ACCOUNT_SUSPENSION_KEY = "account_suspension";

/** GoTrue ban length for an admin suspension: 100 years, i.e. until lifted. */
export const SUSPENSION_BAN_DURATION = "876000h";

/** GoTrue's value that lifts a ban. */
export const LIFT_BAN_DURATION = "none";

/** The one page a suspended session is sent to (not PROTECTED: no loop). */
export const ACCOUNT_SUSPENDED_PATH = "/account-suspended";

/** The answer a suspended account gets from a gated API, and the page's text. */
export const ACCOUNT_SUSPENDED_AR = "تم إيقاف حسابك بقرار من الإدارة. للاستفسار تواصل مع الدعم.";

/** The machine code that travels with ACCOUNT_SUSPENDED_AR. */
export const ACCOUNT_SUSPENDED_CODE = "account_suspended";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True when `bannedUntil` is a parseable time after `now`. */
export function isBanActive(bannedUntil: unknown, now: number = Date.now()): boolean {
  if (typeof bannedUntil !== "string" || bannedUntil.length === 0) return false;
  const t = Date.parse(bannedUntil);
  return Number.isFinite(t) && t > now;
}

/**
 * Suspended when GoTrue's own ban is running (banned_until in the future —
 * also true for a ban set from Studio) OR the app's copy says so
 * (`app_metadata.account_suspension.status === "suspended"`). Anything else —
 * no key, a malformed one, `"active"` — is NOT suspended, so no ordinary
 * account is ever locked out by it. user_metadata is never read.
 */
export function isSuspendedUser(user: unknown, now: number = Date.now()): boolean {
  if (!isRecord(user)) return false;
  if (isBanActive(user.banned_until, now)) return true;
  const meta = user.app_metadata;
  if (!isRecord(meta)) return false;
  const entry = meta[ACCOUNT_SUSPENSION_KEY];
  return isRecord(entry) && entry.status === "suspended";
}

/**
 * The whole app_metadata to write when suspending: the existing keys
 * (provider, providers, account_deletion…) are kept.
 */
export function suspendedAppMetadata(
  existing: unknown,
  actorId: string,
  atIso: string,
): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {};
  return { ...base, [ACCOUNT_SUSPENSION_KEY]: { status: "suspended", at: atIso, by: actorId } };
}

/**
 * The whole app_metadata to write when lifting it. An explicit "active" value
 * is written, so the result never depends on how GoTrue treats a null.
 */
export function activeSuspensionAppMetadata(
  existing: unknown,
  actorId: string,
  atIso: string,
): Record<string, unknown> {
  const base = isRecord(existing) ? { ...existing } : {};
  return { ...base, [ACCOUNT_SUSPENSION_KEY]: { status: "active", at: atIso, by: actorId } };
}

/** The PostgREST / Postgres codes that mean "20261124_60 has not run here". */
export function isMissingSuspensionSchema(code: string | null | undefined): boolean {
  return code === "42883" || code === "PGRST202";
}
