/**
 * The Supabase reads behind useUser() and the mapping of their answers onto a
 * UserSession.
 *
 * Moved out of useUser.ts, a "use client" hook with `@/` imports that
 * `node --test` cannot load, so the shared session store built on these reads
 * can be unit-tested against a fake client (userSessionStore.test.ts).
 * useUser.ts imports everything it used to define here; nothing else did.
 *
 * Relative `.ts` imports, and only `import type` from useUser and the
 * Supabase client: nothing here loads the hook at runtime.
 */
import type { User } from "@supabase/supabase-js";
import type { createClient } from "../lib/supabase/client.ts";
import { getPermissions } from "./userPermissions.ts";
import { isDbUserType } from "../lib/auth/userTypes.ts";
import { mergeMembershipReads } from "../lib/auth/entityMembership.ts";
import type { ActiveEntityMemberships } from "../lib/auth/entityMembership.ts";
import { normalizeGovernmentRole } from "./governmentRole.ts";
import { toPracticeKind, type PracticeKind } from "../lib/auth/practiceKind.ts";
import { toStaffRole, type StaffRole } from "../lib/auth/staffRoles.ts";
import type {
  AffiliationRole,
  BusinessRole,
  MembershipState,
  ProfileState,
  SubRole,
  UserSession,
  UserTier,
  UserType,
} from "./useUser.ts";

export const GUEST_SESSION: UserSession = {
  isLoggedIn:    false,
  userType:      null,
  subRole:       null,
  name:          "",
  tier:          "free",
  credits:       0,
  creditsMax:    0,
  dashboardMode: "light",
  permissions:   [],
};

// ─── Map Supabase user → UserSession ─────────────────────────────────────────

/**
 * The outcome of reading `profiles.user_type` for one user.
 *
 * `missing` and `unavailable` are kept apart on purpose. `missing` means the
 * query succeeded and came back with no usable type — no row at all, or a row
 * whose `user_type` is null or empty. Either way that is a data problem, and it
 * now surfaces as `userType: null` + `profileState: "missing"` rather than as a
 * silent demotion to `"individual"` (see mapSupabaseUser).
 * `unavailable` means the query itself failed — offline, RLS error, timeout — and
 * says nothing whatever about who the user is. It must never look like an answer.
 */
export type ProfileTypeRead =
  | { status: "found"; userType: string }
  | { status: "missing" }
  | { status: "unavailable" };

export type EntityMembershipRead =
  | { status: "found"; memberships: ActiveEntityMemberships; degraded: boolean }
  | { status: "unavailable" };

function relationName(value: unknown, field: string): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "";
  const name = (row as Record<string, unknown>)[field];
  return typeof name === "string" ? name : "";
}

export async function readEntityMemberships(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<EntityMembershipRead> {
  try {
    const [firmResult, businessResult, ownedFirmResult, ownedBusinessResult] = await Promise.all([
      supabase
        .from("firm_members")
        .select("firm_id, role, firm_profiles(name_ar)")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("business_members")
        .select("business_id, role, business_profiles(company_name_ar)")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("firm_profiles")
        .select("id, name_ar")
        .eq("owner_user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("business_profiles")
        .select("id, company_name_ar")
        .eq("owner_user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);

    // WP-6 B-8. Each read is now evaluated INDEPENDENTLY — mirroring
    // `resolveActiveEntityIds` (src/app/api/v1/service-requests/route.ts),
    // which logs each error and nulls only the failing query. This function
    // used to collapse all four on any one error, so a recursive
    // `business_members` policy (42P17, UAT-TEAM-001) discarded the caller's
    // own `business_profiles` row, read successfully from a different table
    // under a different policy, and threw an owner out of their own dashboard
    // on a cold load. The merge itself lives in `mergeMembershipReads` so
    // every combination of the four is unit-tested without a database.
    for (const [label, result] of [
      ["firm_members", firmResult],
      ["business_members", businessResult],
      ["firm_profiles", ownedFirmResult],
      ["business_profiles", ownedBusinessResult],
    ] as const) {
      if (result.error) {
        console.error(`[useUser] ${label} membership lookup failed:`, result.error.message, result.error.code);
      }
    }

    const firm = firmResult.data as Record<string, unknown> | null;
    const ownedFirm = ownedFirmResult.data as Record<string, unknown> | null;
    const business = businessResult.data as Record<string, unknown> | null;
    const ownedBusiness = ownedBusinessResult.data as Record<string, unknown> | null;

    return mergeMembershipReads({
      firmMember: {
        failed: Boolean(firmResult.error),
        summary:
          firm && typeof firm.firm_id === "string" && typeof firm.role === "string"
            ? {
                entityId: firm.firm_id,
                entityName: relationName(firm.firm_profiles, "name_ar"),
                role: firm.role,
              }
            : null,
      },
      ownedFirm: {
        failed: Boolean(ownedFirmResult.error),
        summary:
          ownedFirm && typeof ownedFirm.id === "string"
            ? {
                entityId: ownedFirm.id,
                entityName: typeof ownedFirm.name_ar === "string" ? ownedFirm.name_ar : "",
                role: "managing_partner",
              }
            : null,
      },
      businessMember: {
        failed: Boolean(businessResult.error),
        summary:
          business && typeof business.business_id === "string" && typeof business.role === "string"
            ? {
                entityId: business.business_id,
                entityName: relationName(business.business_profiles, "company_name_ar"),
                role: business.role,
              }
            : null,
      },
      ownedBusiness: {
        failed: Boolean(ownedBusinessResult.error),
        summary:
          ownedBusiness && typeof ownedBusiness.id === "string"
            ? {
                entityId: ownedBusiness.id,
                entityName:
                  typeof ownedBusiness.company_name_ar === "string" ? ownedBusiness.company_name_ar : "",
                role: "owner",
              }
            : null,
      },
    });
  } catch {
    // A THROW is different from a per-query error: nothing was read at all.
    return { status: "unavailable" };
  }
}

/**
 * Reads `profiles.user_type` for one user through the RLS-scoped browser
 * client. The row is reachable only because of the "users read own profile"
 * policy (supabase/migrations/20260603_phase1_001_profiles.sql:65-67): the
 * `.eq("id", …)` selects it, RLS is what keeps every other row out of reach.
 *
 * `maybeSingle()` rather than `single()`: `single()` reports "no row" as an
 * error, which would collapse `missing` and `unavailable` into one case.
 */
export async function readProfileUserType(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ProfileTypeRead> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("id", userId)
      .maybeSingle();

    if (error) return { status: "unavailable" };

    const value: unknown = data?.user_type;
    if (typeof value !== "string" || value.length === 0) return { status: "missing" };
    return { status: "found", userType: value };
  } catch {
    // A thrown fetch is a transport failure, never a statement about the user.
    return { status: "unavailable" };
  }
}

export type PracticeKindRead =
  | { status: "found"; practiceKind: PracticeKind }
  | { status: "unavailable" };

/** The deploy-order rule: a missing column is logged once, not on every read. */
let practiceKindFailureLogged = false;

/**
 * Art. 18 — reads `lawyer_profiles.practice_kind` for one lawyer with its OWN
 * query. The column is never added to another select, so on a database where
 * 20261019_20 has not run yet (42703) only this field falls back, to
 * 'advocate', and the profile and membership reads are untouched. No row reads
 * as 'advocate' too. The row is reachable through the "lawyers read own
 * profile" policy; user_id and practice_kind are both in the column grant.
 */
export async function readPracticeKind(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<PracticeKindRead> {
  try {
    const { data, error } = await supabase
      .from("lawyer_profiles")
      .select("practice_kind")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      if (!practiceKindFailureLogged) {
        practiceKindFailureLogged = true;
        console.warn("[useUser] lawyer_profiles.practice_kind read failed; the lawyer is treated as an advocate:", error.message, error.code);
      }
      return { status: "unavailable" };
    }
    return { status: "found", practiceKind: toPracticeKind(data?.practice_kind) };
  } catch {
    return { status: "unavailable" };
  }
}

/** The deploy-order rule: a missing function is logged once, not on every read. */
let staffRoleFailureLogged = false;

/**
 * Owner ٢١٠ — an admin's staff role through public.staff_role() (20261019_30:
 * SECURITY DEFINER, EXECUTE granted to authenticated; it answers the caller's
 * own role while their profile is an admin). Any failure is null, logged once:
 * before the migration the function is missing (PGRST202 / 42883).
 */
export async function readStaffRole(supabase: ReturnType<typeof createClient>): Promise<StaffRole | null> {
  try {
    const { data, error } = await supabase.rpc("staff_role");
    if (error) {
      if (!staffRoleFailureLogged) {
        staffRoleFailureLogged = true;
        console.warn("[useUser] staff_role() read failed; the admin nav stays complete (the server still enforces roles):", error.message, error.code);
      }
      return null;
    }
    return toStaffRole(data);
  } catch {
    return null;
  }
}

/**
 * Builds the browser-side session.
 *
 * `resolvedUserType` is the account type the caller has already decided on, and
 * `user_type` is the ONLY field on this session that comes from `profiles`. The
 * caller passes `profiles.user_type` when the row was read, the previously
 * resolved type when the read was `unavailable` for this same signed-in user,
 * and `null` when neither applies.
 *
 * Everything else below — tier, sub-role, credits, display mode, affiliation
 * and the sector fields — still comes from `user_metadata`, unchanged.
 */
export function mapSupabaseUser(
  user: User | null,
  resolvedUserType: string | null,
  memberships: ActiveEntityMemberships = {},
  profileState: ProfileState = "ok",
  membershipState: MembershipState = "ok",
  practiceKind: PracticeKind = "advocate",
  staffRole: StaffRole | null = null,
): UserSession {
  if (!user) return GUEST_SESSION;

  const meta = user.user_metadata ?? {};
  // profiles.user_type is the only trusted browser role. user_metadata is
  // writable by the account holder, so it must never create an admin or entity
  // session when the profile read is unavailable.
  //
  // `missing` no longer falls back to "individual". That fallback is what
  // turned a real lawyer whose row could not be resolved into a client account,
  // at which point <UserTypeGuard> refused them their own dashboard with
  // «صلاحيات غير كافية» — UAT-LIVE-AI-001, and the "client-side demotion" of
  // docs/audits/2026-09-20-profiles-uat/02-auth-session-audit.md §4. A profile
  // that is absent or typeless is an INCOMPLETE PROFILE, not a different
  // account type, and the session now says so: userType stays null and
  // `profileState: "missing"` carries the reason, which UserTypeGuard renders
  // as «ملفك غير مكتمل» with a link to /onboarding.
  //
  // `unavailable` is untouched: applyUser carries the previously resolved type
  // forward for this same signed-in user, so only a first load with the network
  // already down reaches the "individual" fallback.
  const userType: UserType =
    profileState === "missing"
      ? null
      : resolvedUserType !== null && isDbUserType(resolvedUserType)
        ? resolvedUserType
        : "individual";

  const tier = (meta.tier ?? "free") as UserTier;
  const subRole = (meta.sub_role ?? meta.provider_sub_role ?? null) as SubRole;

  return {
    isLoggedIn:    true,
    userId:        user.id,
    userType,
    profileState,
    membershipState,
    subRole,
    name:          meta.display_name ?? meta.full_name ?? user.email ?? "",
    avatar:        meta.avatar_url,
    tier,
    credits:       meta.credit_balance ?? 0,
    creditsMax:    meta.credits_max ?? 0,
    dashboardMode: meta.display_mode ?? "full",
    permissions:   getPermissions(userType, tier),
    businessType:       meta.business_type,
    providerSpecialties: meta.provider_specialties,
    affiliation: memberships.firm
      ? {
          entityName: memberships.firm.entityName,
          entityType: "firm",
          role: memberships.firm.role as AffiliationRole,
        }
      : undefined,
    firmMembership: memberships.firm as UserSession["firmMembership"],
    // user_metadata is writable by the account holder and the database allows
    // roles the app has no screen for (clerk, admin); an unrecognised value is
    // dropped here so every consumer's `?? "gov_counsel"` default applies.
    governmentRole:     normalizeGovernmentRole(meta.government_role),
    officerSpecialty:    meta.officer_specialty,
    businessRole: (memberships.business?.role ?? meta.business_role) as BusinessRole | undefined,
    businessMembership: memberships.business as UserSession["businessMembership"],
    active_roles:       meta.active_roles,
    country:       meta.country_code ?? "SA",
    // Only a lawyer can be a consultant (Art. 18).
    practiceKind:  userType === "lawyer" ? practiceKind : "advocate",
    // Only an admin holds a staff role (owner ٢١٠).
    staffRole:     userType === "admin" ? staffRole : null,
  };
}
