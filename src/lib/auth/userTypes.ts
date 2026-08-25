/**
 * The canonical user-type vocabulary.
 *
 * Three separate lists had already drifted apart before this module existed:
 *
 *   1. the `profiles.user_type` CHECK constraint
 *      (supabase/migrations/20260603_phase1_001_profiles.sql:32-35), repeated
 *      verbatim in the signup trigger
 *      (supabase/migrations/20260614_auto_create_role_profiles.sql:32-37);
 *   2. the onboarding picker (src/app/onboarding/page.tsx:86-99), which emits
 *      `company` — a value the CHECK does not allow; `corporate` is the real one;
 *   3. two dashboard maps that had to agree — one in the OAuth callback and a
 *      local `dashDir` in the proxy. Both were deleted when those two files
 *      started calling `dashboardPathFor` below, so the line numbers an
 *      earlier version of this note gave now point at unrelated code; what
 *      each of them said is pinned in `userTypes.test.ts` instead.
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
 * Hand-mirrored from the picker options in src/app/onboarding/page.tsx (the
 * Arabic list; the English list beside it uses the same ids). The picker is a
 * React client component, so this copy cannot be imported from it and is not
 * automatically kept in step — if a picker option is added or renamed, update
 * this map by hand. `userTypes.test.ts` fails if a value here is not a DB
 * value, and fails if the set of DB types with no picker option changes.
 *
 * Seven of the ten ids are identity mappings. Three are not, and each is
 * deliberate:
 *
 *   - `company` → `corporate`. The picker calls it a company; the CHECK
 *     constraint calls it `corporate`. This mismatch is the reason this module
 *     exists.
 *
 *   - `notary`, `tracker` and `arbitrator` → `provider`, all three. A موثّق, a
 *     معقّب and a محكّم are the ONE user_type `provider`; what separates them
 *     is `provider_profiles.sub_role`, which `PICKER_TO_SUB_ROLE` below
 *     carries. This map keeps its single meaning — picker id to `user_type` —
 *     and the sub-role rides in the second map rather than being smuggled into
 *     this one.
 *
 *     Those three ids are the vocabulary /register/provider already uses for
 *     the same three roles (`ProviderType` in
 *     src/app/register/provider/types.ts:1), so the email route and the Google
 *     route name them identically rather than inventing a second spelling.
 *
 * `admin` is the only DB type with no key here, and it must stay that way: it
 * must never be reachable from any control (see `isAssignableUserType`).
 * `userTypes.test.ts` pins that the unreachable set is exactly {admin}, so
 * adding an eleventh id that resolved to `admin` fails the suite.
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
  | "firm"
  | "notary"
  | "tracker"
  | "arbitrator";

export const PICKER_TO_DB: Record<PickerId, DbUserType> = {
  individual: "individual",
  company: "corporate",
  micro: "micro",
  government: "government",
  ngo: "ngo",
  lawyer: "lawyer",
  firm: "firm",
  notary: "provider",
  tracker: "provider",
  arbitrator: "provider",
};

// ── The service-provider sub-role vocabulary ────────────────────────────────

/**
 * Exactly the `provider_profiles.sub_role` CHECK-constraint list, copied from
 * supabase/migrations/20260603_phase1_001_profiles.sql:159-160:
 *
 *   sub_role text not null check (sub_role in ('notary', 'arbitrator', 'bailiff'))
 *
 * There is no default. Reading that table column by column at :157-173,
 * `sub_role` is the ONLY not-null column without one apart from the `user_id`
 * primary key — every other column (`service_areas`, `availability`,
 * `verification_status`, `marketplace_visible`, `metadata`, `created_at`,
 * `updated_at`) defaults, and the rest are nullable. So this one value has to
 * travel with a provider account on every route that can create one, and an
 * insert that omits it raises 23502 rather than picking something.
 */
export const PROVIDER_SUB_ROLES = ["notary", "arbitrator", "bailiff"] as const;

export type ProviderSubRole = (typeof PROVIDER_SUB_ROLES)[number];

/** True when `value` is one of the three values the CHECK constraint allows. */
export function isProviderSubRole(value: string): value is ProviderSubRole {
  return (PROVIDER_SUB_ROLES as readonly string[]).includes(value);
}

/**
 * Picker id → the `provider_profiles.sub_role` that id means, or `null` for the
 * seven ids whose `user_type` has no sub-role at all.
 *
 * Total over `PickerId` on purpose, for the same reason `DASHBOARD_PATHS` is
 * total over `DbUserType`: adding a picker option without deciding whether it
 * carries a sub-role is a compile error here, not a claim that succeeds at
 * runtime and then fails against a CHECK constraint.
 *
 * `tracker` → `'bailiff'` is the one mapping that is not its own name, and it
 * is not a typo — the interface calls the role معقّب / "Gov. Agent" and the
 * database column calls it `bailiff`. /register/provider makes exactly the same
 * three translations for its email signup at
 * src/app/register/provider/page.tsx:375 (موثّق→'notary', محكّم→'arbitrator',
 * معقّب→'bailiff'), and the two lists must agree, because both routes end up
 * writing the same column of the same table.
 *
 * Nothing here defaults, and nothing downstream may: `canClaimAccountType`
 * refuses a sub-role it does not recognise instead of substituting one. A
 * silent default would file a محكّم as a موثّق, in the wrong review queue,
 * with nothing on any screen saying so.
 */
export const PICKER_TO_SUB_ROLE: Record<PickerId, ProviderSubRole | null> = {
  individual: null,
  company: null,
  micro: null,
  government: null,
  ngo: null,
  lawyer: null,
  firm: null,
  notary: "notary",
  tracker: "bailiff",
  arbitrator: "arbitrator",
};

/**
 * The `sub_role` a picker id means, or `null` when it means none.
 *
 * `null` covers two different cases — "not a picker id at all" and "a picker id
 * whose user_type takes no sub-role" — and they are deliberately not
 * distinguished here, because every caller has already resolved the id through
 * `toDbUserType` and so knows which case it is in. `canClaimAccountType`
 * cross-checks the two maps against each other and refuses the claim outright
 * if they ever disagree.
 */
export function toProviderSubRole(pickerValue: string): ProviderSubRole | null {
  // hasOwnProperty for the same reason `toDbUserType` uses it: inherited
  // Object members must not be mistaken for picker ids.
  if (!Object.prototype.hasOwnProperty.call(PICKER_TO_SUB_ROLE, pickerValue)) return null;
  return PICKER_TO_SUB_ROLE[pickerValue as PickerId];
}

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
 * `ROUTE_ACCESS` (src/proxy.ts:13-37), so redirecting an unknown-typed user to
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
