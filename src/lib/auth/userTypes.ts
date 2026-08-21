/**
 * The canonical user-type vocabulary.
 *
 * Three separate lists had already drifted apart before this module existed:
 *
 *   1. the `profiles.user_type` CHECK constraint
 *      (supabase/migrations/20260603_phase1_001_profiles.sql:32-35), repeated
 *      verbatim in the signup trigger
 *      (supabase/migrations/20260614_auto_create_role_profiles.sql:32-37);
 *   2. the onboarding picker (src/app/onboarding/page.tsx:40-46), which emits
 *      `company` — a value the CHECK does not allow; `corporate` is the real one;
 *   3. two dashboard maps that must agree — src/app/auth/callback/route.ts:47-57
 *      and the local `dashDir` in src/proxy.ts:153-156.
 *
 * Everything that translates, validates or routes a user type goes through here
 * so those lists cannot diverge again. This module is pure: no I/O, no Supabase,
 * no React, no user-facing copy.
 */

/**
 * Exactly the `profiles.user_type` CHECK-constraint list, copied from
 * supabase/migrations/20260603_phase1_001_profiles.sql:32-35.
 *
 * The signup trigger at
 * supabase/migrations/20260614_auto_create_role_profiles.sql:32-37 repeats the
 * same nine values; the two were compared value-by-value and agree.
 *
 * Note that `admin` is a real, live value — one of the current accounts has it.
 * It is in this list because the database allows it, NOT because anything may
 * assign it. See `isAssignableUserType`.
 */
export const DB_USER_TYPES = [
  "individual",
  "lawyer",
  "firm",
  "corporate",
  "micro",
  "provider",
  "government",
  "ngo",
  "admin",
] as const;

export type DbUserType = (typeof DB_USER_TYPES)[number];

/**
 * Onboarding picker id → `profiles.user_type` value.
 *
 * Hand-mirrored from the picker options at src/app/onboarding/page.tsx:40-46
 * (the Arabic list; the English list at :49-55 uses the same ids). The picker
 * is a React client component, so this copy cannot be imported from it and is
 * not automatically kept in step — if a picker option is added or renamed,
 * update this map by hand. `userTypes.test.ts` fails if a value here is not a
 * DB value, and fails if the set of DB types with no picker option changes.
 *
 * Six of the seven ids are identity mappings. `company` is the odd one: the
 * picker calls it a company, the constraint calls it `corporate`.
 *
 * Two DB types are deliberately absent as keys:
 *   - `admin`   — must never be reachable from a picker (see `isAssignableUserType`);
 *   - `provider`— has no picker option at all today, so a service provider
 *                 signing in with Google cannot state what they are. That is a
 *                 real gap, not a design decision, and is left open on purpose.
 *
 * Keyed by `PickerId` rather than by `string` on purpose: indexing this map
 * with an arbitrary string is a compile error, so nobody can write
 * `PICKER_TO_DB[selected]` and get `undefined` typed as a valid user_type.
 * Go through `toDbUserType`, which returns `null` for ids that are not here.
 */
export type PickerId =
  | "individual"
  | "company"
  | "micro"
  | "government"
  | "ngo"
  | "lawyer"
  | "firm";

export const PICKER_TO_DB: Record<PickerId, DbUserType> = {
  individual: "individual",
  company: "corporate",
  micro: "micro",
  government: "government",
  ngo: "ngo",
  lawyer: "lawyer",
  firm: "firm",
};

/**
 * `profiles.user_type` → the dashboard route for that type.
 *
 * Typed as a total `Record<DbUserType, string>` on purpose: adding a tenth
 * value to `DB_USER_TYPES` without adding its path here is a compile error, not
 * a runtime surprise. Every path below corresponds to a directory that exists
 * under src/app/dashboard/. Two do not match their type name: `individual` →
 * `client` and `corporate` → `business`.
 */
export const DASHBOARD_PATHS: Record<DbUserType, string> = {
  individual: "/dashboard/client",
  lawyer: "/dashboard/lawyer",
  firm: "/dashboard/firm",
  corporate: "/dashboard/business",
  micro: "/dashboard/micro",
  provider: "/dashboard/provider",
  government: "/dashboard/government",
  ngo: "/dashboard/ngo",
  admin: "/dashboard/admin",
};

/**
 * Where `dashboardPathFor` sends a user whose type it does not recognise.
 *
 * The home page, deliberately, for two reasons. It is not a `/dashboard/*`
 * path — each of those prefixes is restricted to a single user_type by
 * `ROUTE_ACCESS` (src/proxy.ts:5-14), so redirecting an unknown-typed user to
 * one would bounce them straight back out again. And it is not any account's
 * dashboard, so nobody is silently filed under the wrong type.
 *
 * A caller with a better answer should test with `isDbUserType` first and use
 * its own fallback rather than relying on this one.
 */
export const FALLBACK_DASHBOARD_PATH = "/";

/** True when `value` is one of the nine values the CHECK constraint allows. */
export function isDbUserType(value: string): value is DbUserType {
  return (DB_USER_TYPES as readonly string[]).includes(value);
}

/**
 * Translates an onboarding picker id into the `profiles.user_type` value to
 * write, or `null` if the id is not one the picker offers.
 *
 * Returns `null` — never a default — for anything unrecognised. A silent
 * fallback to `individual` is precisely how the `company` / `corporate`
 * mismatch stayed invisible: the wrong value was quietly replaced with a
 * plausible one instead of failing somewhere a human would see it. A caller
 * that gets `null` should refuse to write, not guess.
 *
 * This translates one direction only. A value already read from `profiles` is
 * not a picker id and will come back `null`; use `isDbUserType` for those.
 */
export function toDbUserType(pickerValue: string): DbUserType | null {
  // hasOwnProperty rather than a bare lookup, so inherited Object members
  // ("constructor", "toString", …) are not mistaken for picker ids.
  if (!Object.prototype.hasOwnProperty.call(PICKER_TO_DB, pickerValue)) return null;
  // Safe: the line above proved `pickerValue` is an own key of the map.
  return PICKER_TO_DB[pickerValue as PickerId];
}

/**
 * True when `value` is a user_type that a user may be given by onboarding, an
 * API body, or any other caller.
 *
 * `admin` is a DB value and returns **false** here. The guard lives in code
 * rather than in the absence of a UI control, because:
 *   - the onboarding picker has no admin option, so an admin who runs the
 *     wizard would write whatever the picker does offer over their own type;
 *   - one of the live accounts IS the admin, so this is a real account that
 *     could downgrade itself, not a hypothetical;
 *   - only a manual database edit could undo it.
 * Removing an admin entry from a list somewhere would re-open this. Keep the
 * check.
 */
export function isAssignableUserType(value: string): boolean {
  return isDbUserType(value) && value !== "admin";
}

/**
 * The dashboard route for a `profiles.user_type`, or `FALLBACK_DASHBOARD_PATH`
 * when the type is not one of the nine. The argument is never interpolated
 * into the returned path.
 */
export function dashboardPathFor(userType: string): string {
  return isDbUserType(userType) ? DASHBOARD_PATHS[userType] : FALLBACK_DASHBOARD_PATH;
}
