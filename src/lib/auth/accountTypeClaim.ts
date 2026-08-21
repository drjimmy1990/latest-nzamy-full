/**
 * The one-time account-type claim — its eligibility rule and the sector row
 * that has to come with it. Pure: no Supabase, no React, no I/O, and no
 * user-facing copy. The Arabic message for each refusal lives in the route
 * (src/app/api/v1/onboarding/account-type/route.ts), which is the only place
 * that knows it is answering an HTTP request.
 *
 * ── Why a server-side claim exists at all ────────────────────────────────
 * `supabase/migrations/20260716_security_hardening.sql:123-156` installs
 * `trg_lock_user_type`, a BEFORE UPDATE trigger on `public.profiles`. It
 * returns early for service-role callers (`auth.uid() IS NULL`, :132-134) and
 * otherwise, when `OLD.user_type IS DISTINCT FROM NEW.user_type` and
 * `public.is_admin()` is false, raises
 * `'Permission denied: user_type cannot be self-modified'` with ERRCODE
 * `42501` (:137-143). So a user's own session can never change their own
 * `user_type` — the onboarding wizard cannot write it, and must ask a server
 * route to do it with the service-role client instead.
 *
 * That is a privileged write, so the rule for when it is allowed is kept
 * here, separately from the route, where every branch of it can be tested
 * without a database.
 *
 * ── What this module does NOT decide ──────────────────────────────────────
 * It does not authenticate anybody, it does not read `profiles`, and it never
 * sees a user id. The route reads the caller's own profile through the
 * RLS-scoped client and hands the two facts in. Nothing here is a substitute
 * for the route re-asserting `.eq("id", user.id)` on the write itself.
 */

import { isAssignableUserType, toDbUserType } from "./userTypes.ts";

/**
 * The subset of `DbUserType` that an onboarding claim can produce: exactly the
 * values of `PICKER_TO_DB`, written out because that map is declared as
 * `Record<PickerId, DbUserType>` and so its value type widens to all nine.
 *
 * `accountTypeClaim.test.ts` fails if this list and `Object.values(PICKER_TO_DB)`
 * stop agreeing, which is what makes `SECTOR_ROW_BY_USER_TYPE` below a total
 * record rather than a map with holes in it.
 *
 * Two DB types are absent and both absences are deliberate:
 *   - `admin`    — never claimable, guarded three separate ways (see
 *                  `canClaimAccountType`);
 *   - `provider` — has no onboarding picker option at all, so no picker id can
 *                  resolve to it. It is also the one type this module could not
 *                  provision correctly if it tried: `provider_profiles.sub_role`
 *                  is NOT NULL with a CHECK and no default
 *                  (supabase/migrations/20260603_phase1_001_profiles.sql:159-160)
 *                  and nothing in a claim knows whether the caller is a notary,
 *                  an arbitrator or a bailiff.
 */
export type ClaimableDbUserType =
  | "individual"
  | "lawyer"
  | "firm"
  | "corporate"
  | "micro"
  | "government"
  | "ngo";

export const CLAIMABLE_DB_USER_TYPES: readonly ClaimableDbUserType[] = [
  "individual",
  "lawyer",
  "firm",
  "corporate",
  "micro",
  "government",
  "ngo",
] as const;

/** True when `value` is a user_type an onboarding claim may produce. */
export function isClaimableDbUserType(value: string): value is ClaimableDbUserType {
  return (CLAIMABLE_DB_USER_TYPES as readonly string[]).includes(value);
}

// ── Refusals ────────────────────────────────────────────────────────────────

/**
 * Why a claim was refused. A discriminated reason rather than a bare `false`
 * so the route can answer each case with its own Arabic sentence: "that type
 * does not exist", "your account already has a type" and "you already finished
 * onboarding" are three different things to be told, and collapsing them into
 * one "not allowed" would be both a worse product and a worse thing to debug
 * from a log line.
 */
export type AccountTypeClaimRefusal =
  /** The body's `pickerId` is not one the onboarding picker offers. */
  | "invalid_picker_id"
  /** The requested type exists but may never be assigned by a claim — `admin`. */
  | "not_assignable"
  /** No `profiles` row was readable for the caller, so eligibility is unknowable. */
  | "profile_missing"
  /** The caller already has a type other than the untouched `individual` default. */
  | "type_already_set"
  /** The caller already finished onboarding; this is not a role-switch API. */
  | "onboarding_already_completed";

export type AccountTypeClaimDecision =
  | { readonly ok: true; readonly userType: ClaimableDbUserType }
  | { readonly ok: false; readonly reason: AccountTypeClaimRefusal };

export interface AccountTypeClaimInput {
  /** The `pickerId` from the request body, unvalidated and untrusted. */
  requestedPickerId: string;
  /**
   * `profiles.user_type` as read through the caller's own RLS-scoped client.
   * Null or undefined when the row is missing — refused, never defaulted.
   */
  currentType?: string | null;
  /**
   * `profiles.onboarding_completed`. Typed `unknown` for the same reason
   * `needsOnboarding` does it (src/lib/auth/onboardingGate.ts): only the
   * boolean `true` counts as completed, and an absent value has to be
   * representable without a cast.
   */
  onboardingCompleted?: unknown;
}

/**
 * Decides whether this caller may claim this account type, once.
 *
 * Permits the claim only when **all** of these hold:
 *   1. `requestedPickerId` maps through `toDbUserType` to a non-null DB value;
 *   2. `isAssignableUserType` is true for that value — so never `admin`;
 *   3. the DB value is one a claim can actually provision (`isClaimableDbUserType`);
 *   4. the caller's current `user_type` is exactly `"individual"` — the value
 *      the signup trigger writes by default
 *      (supabase/migrations/20260716_security_hardening.sql:24) and therefore
 *      the only one that means "this account has not chosen yet";
 *   5. `onboarding_completed` is not `true`.
 *
 * Conditions 4 and 5 are what keep this a **one-time claim during onboarding
 * rather than a role-switch API**. Somebody who already onboarded, or who
 * already holds a non-`individual` type, is refused — changing an established
 * account's type stays an admin action, exactly as `trg_lock_user_type`
 * intends.
 *
 * Claiming `individual` while already `individual` is permitted and is a
 * legitimate outcome: it is what a client picks. The write is then a no-op on
 * the column, which the trigger ignores because it only fires on
 * `OLD.user_type IS DISTINCT FROM NEW.user_type`.
 */
export function canClaimAccountType(input: AccountTypeClaimInput): AccountTypeClaimDecision {
  // ── `admin`, refused explicitly and first ────────────────────────────────
  // This is the third of three independent guards, and the only one that
  // survives both of the others being loosened: `toDbUserType("admin")`
  // already returns null (admin is not a picker id) and `isAssignableUserType`
  // below refuses it as well. The instruction this codebase repeats — guard
  // `admin` in code, not by its absence from a list — is what this line is.
  // `accountTypeClaim.test.ts` fails if it is deleted.
  if (input.requestedPickerId === "admin") {
    return { ok: false, reason: "not_assignable" };
  }

  const dbType = toDbUserType(input.requestedPickerId);
  if (dbType === null) {
    return { ok: false, reason: "invalid_picker_id" };
  }

  if (!isAssignableUserType(dbType)) {
    return { ok: false, reason: "not_assignable" };
  }

  // Unreachable while `PICKER_TO_DB` holds only claimable values — the test
  // suite pins that. It is here because the two lists are maintained by hand
  // in two files, and because `SECTOR_ROW_BY_USER_TYPE` below would otherwise
  // need a lookup that can miss. Refused rather than provisioned blindly.
  if (!isClaimableDbUserType(dbType)) {
    return { ok: false, reason: "not_assignable" };
  }

  // ── The caller's own state ───────────────────────────────────────────────
  const currentType = input.currentType ?? "";
  if (currentType === "") {
    // The signup trigger creates the row (…20260716:38-45, ON CONFLICT DO
    // NOTHING), so this should not happen. If it does, eligibility cannot be
    // established and the claim is refused rather than assumed.
    return { ok: false, reason: "profile_missing" };
  }

  if (currentType !== "individual") {
    return { ok: false, reason: "type_already_set" };
  }

  if (input.onboardingCompleted === true) {
    return { ok: false, reason: "onboarding_already_completed" };
  }

  return { ok: true, userType: dbType };
}

// ── The sector row the signup trigger would have created ────────────────────

/**
 * How to provision the role-specific row for a claimed type.
 *
 * The signup trigger `public.handle_new_user`
 * (supabase/migrations/20260716_security_hardening.sql:19-110) creates these
 * rows **only when the auth user is inserted**. A Google user is inserted as
 * `individual` (the `COALESCE` at :24), so claiming `lawyer` afterwards leaves
 * them with no `lawyer_profiles` row at all — and the verification flow, which
 * reads `lawyer_profiles.verification_status`, then has nothing to read.
 * The claim has to create what the trigger would have.
 *
 * Column names and values are mirrored from the trigger's branches, one for
 * one — see `SECTOR_ROW_BY_USER_TYPE`. The literal Arabic placeholders are the
 * trigger's own `COALESCE` fallbacks; the branch that reads
 * `raw_user_meta_data->>'company_name'` and friends is deliberately NOT
 * mirrored, because an OAuth provider never supplies those keys, so mirroring
 * it would add a permanently dead read of `user_metadata` to the one file
 * whose whole purpose is to stop routing on `user_metadata`.
 */
export interface SectorRowSpec {
  /** The table the trigger provisions for this type. */
  readonly table: string;
  /** The column in that table holding the owner's `auth.users.id`. */
  readonly ownerColumn: "user_id" | "owner_user_id";
  /**
   * Whether `ownerColumn` carries a uniqueness guarantee, which decides how the
   * route may make the insert idempotent.
   *
   * `lawyer_profiles` and `micro_profiles` have `user_id` as their PRIMARY KEY
   * (supabase/migrations/20260603_phase1_001_profiles.sql:93,216), so an
   * upsert that ignores duplicates is race-proof there.
   *
   * `firm_profiles`, `business_profiles`, `government_profiles` and
   * `ngo_profiles` instead have `id uuid primary key default gen_random_uuid()`
   * with `owner_user_id` merely NOT NULL and indexed, never unique
   * (supabase/migrations/20260603_phase1_002_entities.sql:36-37, 219-220,
   * 398-399, 568-569). The trigger's bare `ON CONFLICT DO NOTHING` on those
   * four tables therefore has no constraint to conflict against and can never
   * fire — inserting twice makes two rows. The route compensates with an
   * explicit existence check; a UNIQUE index on `owner_user_id` is the durable
   * fix and needs a migration, which is not in this change.
   */
  readonly ownerColumnIsUnique: boolean;
  /**
   * Every other column the trigger sets — which is every NOT NULL column of
   * that table without a default, plus the trigger's own non-default choices.
   * Getting one of these wrong fails the claim at its last step.
   */
  readonly columns: Readonly<Record<string, string | boolean>>;
}

/**
 * Claimable type → the sector row to create, or `null` for a type that has no
 * sector table.
 *
 * Total over `ClaimableDbUserType` on purpose: adding a picker option whose DB
 * value is not a key here is a compile error, not a claim that succeeds and
 * leaves the user without the row their dashboard needs.
 */
export const SECTOR_ROW_BY_USER_TYPE: Record<ClaimableDbUserType, SectorRowSpec | null> = {
  // No sector table exists for a plain individual, and the trigger has no
  // branch for one either (…20260716:48-101 covers the other six).
  individual: null,

  // …20260716:48-51
  lawyer: {
    table: "lawyer_profiles",
    ownerColumn: "user_id",
    ownerColumnIsUnique: true,
    columns: { is_accepting_clients: true },
  },

  // …20260716:58-65. `name_ar` is NOT NULL with no default; `name_en` defaults
  // to '' but the trigger sets it, so this does too.
  firm: {
    table: "firm_profiles",
    ownerColumn: "owner_user_id",
    ownerColumnIsUnique: false,
    columns: { name_ar: "جهة جديدة", name_en: "New Entity" },
  },

  // …20260716:67-74. `corporate` provisions business_profiles, NOT
  // firm_profiles — an earlier trigger version sent both there
  // (supabase/migrations/20260616_production_readiness_fixes.sql:144) and
  // 20260630 corrected it.
  corporate: {
    table: "business_profiles",
    ownerColumn: "owner_user_id",
    ownerColumnIsUnique: false,
    columns: { company_name_ar: "شركة جديدة", company_name_en: "New Company" },
  },

  // …20260716:94-100
  micro: {
    table: "micro_profiles",
    ownerColumn: "user_id",
    ownerColumnIsUnique: true,
    columns: { business_name: "نشاط تجاري جديد" },
  },

  // …20260716:76-83. `entity_type` is NOT NULL with a CHECK and no default;
  // 'other' is the trigger's fallback and one of the seven allowed values
  // (supabase/migrations/20260603_phase1_002_entities.sql:403-406).
  government: {
    table: "government_profiles",
    ownerColumn: "owner_user_id",
    ownerColumnIsUnique: false,
    columns: { entity_name_ar: "جهة حكومية جديدة", entity_type: "other" },
  },

  // …20260716:85-92. `org_type` is NOT NULL with a CHECK and no default;
  // 'other' is the trigger's fallback and an allowed value
  // (supabase/migrations/20260603_phase1_002_entities.sql:572-573).
  ngo: {
    table: "ngo_profiles",
    ownerColumn: "owner_user_id",
    ownerColumnIsUnique: false,
    columns: { org_name_ar: "منظمة جديدة", org_type: "other" },
  },
};

/**
 * The sector row to provision for a claimed type, or `null` when that type has
 * no sector table. Takes a `ClaimableDbUserType`, so the caller has to have
 * been through `canClaimAccountType` first.
 */
export function sectorRowSpecFor(userType: ClaimableDbUserType): SectorRowSpec | null {
  return SECTOR_ROW_BY_USER_TYPE[userType];
}

/**
 * The row body to insert for `userType`, owner column included.
 *
 * Returns `null` for a type with no sector table. `userId` is only ever placed
 * in the owner column; it is never interpolated into a table or column name.
 */
export function sectorRowValuesFor(
  userType: ClaimableDbUserType,
  userId: string,
): { table: string; ownerColumn: string; ownerColumnIsUnique: boolean; row: Record<string, string | boolean> } | null {
  const spec = sectorRowSpecFor(userType);
  if (spec === null) return null;
  return {
    table: spec.table,
    ownerColumn: spec.ownerColumn,
    ownerColumnIsUnique: spec.ownerColumnIsUnique,
    row: { ...spec.columns, [spec.ownerColumn]: userId },
  };
}
