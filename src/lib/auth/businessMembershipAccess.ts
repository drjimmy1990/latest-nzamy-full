/**
 * businessMembershipAccess.ts — the runtime shape of `public.business_members`
 * and who may see or change a company's roster.
 * ─────────────────────────────────────────────────────────
 * WP-6 B-5 (plan §5 Q7 = yes). Sibling of `firmMembershipAccess.ts`; kept as
 * its own module rather than folded into that one because the two tables have
 * different role vocabularies and different owner columns, and a shared
 * "entity members" abstraction would have to be wrong about one of them.
 *
 * `BUSINESS_ROLE_VALUES` mirrors the `role` CHECK on `business_members`
 * (20260603_phase1_002_entities.sql:303-307) EXACTLY — nine values. It is a
 * runtime array, not just the `BusinessRole` type in
 * `@/types/businessBackendReady`, for the same reason
 * `firm/members/route.ts` keeps `FIRM_ROLE_VALUES`: a route validating a
 * write against a database CHECK needs the values at runtime.
 *
 * Pure — no Supabase, no Next.js — so `node --test` can run it.
 */

import type { BusinessRole } from "@/types/businessBackendReady";

export type { BusinessRole };

export const BUSINESS_ROLE_VALUES: readonly BusinessRole[] = [
  "owner",
  "legal_manager",
  "legal_staff",
  "compliance_officer",
  "seconded",
  "department_head",
  "hr_manager",
  "finance_manager",
  "employee",
];

const BUSINESS_ROLE_SET = new Set<string>(BUSINESS_ROLE_VALUES);

export function isBusinessRole(value: unknown): value is BusinessRole {
  return typeof value === "string" && BUSINESS_ROLE_SET.has(value);
}

/**
 * `owner` is deliberately NOT invitable. The owner's row is created by the
 * `ensure_business_owner_membership` trigger (20260914) from
 * `business_profiles.owner_user_id`; handing a second account that role
 * through this API would put the roster and the column out of step, and the
 * column is what every RLS write policy reads.
 */
export const BUSINESS_INVITE_ROLE_VALUES: readonly BusinessRole[] = BUSINESS_ROLE_VALUES.filter(
  (r) => r !== "owner",
);

export function isInvitableBusinessRole(value: unknown): value is BusinessRole {
  return isBusinessRole(value) && value !== "owner";
}

export type BusinessMemberStatus = "invited" | "active" | "suspended" | "removed";

/** The `status` CHECK on business_members (20260603_phase1_002_entities.sql:311-312). */
export const BUSINESS_MEMBER_STATUS_VALUES: readonly BusinessMemberStatus[] = [
  "invited",
  "active",
  "suspended",
  "removed",
];

/**
 * The statuses this API may SET.
 *
 * "invited" is absent on purpose, but no longer because there is nothing to
 * accept (review A5/F03 built that: POST /api/v1/{business,firm}/members
 * writes "invited", and the invitee answers at POST
 * /api/v1/me/invitations/{kind}/{id}/accept|decline). It is absent because
 * this is the OWNER's PATCH: letting an owner set a row back to "invited"
 * would reset an ACTIVE member to «pending» and silently cancel a consent
 * already given. Re-inviting a "removed"/"suspended" row is POST's job, not
 * this one's.
 */
export const BUSINESS_PATCHABLE_STATUSES: readonly BusinessMemberStatus[] = [
  "active",
  "suspended",
  "removed",
];

const PATCHABLE_SET = new Set<string>(BUSINESS_PATCHABLE_STATUSES);

export function isPatchableBusinessStatus(value: unknown): value is BusinessMemberStatus {
  return typeof value === "string" && PATCHABLE_SET.has(value);
}

export const BUSINESS_ROLE_LABEL: Record<BusinessRole, string> = {
  owner: "مالك الحساب",
  legal_manager: "رئيس الشؤون القانونية",
  legal_staff: "أخصائي قانوني",
  compliance_officer: "مسؤول الامتثال",
  seconded: "مستشار منتدب",
  department_head: "رئيس قسم",
  hr_manager: "مدير موارد بشرية",
  finance_manager: "مدير مالي",
  employee: "موظف عام",
};

export interface BusinessMemberPatchInput {
  role?: unknown;
  status?: unknown;
}

export type BusinessMemberPatchDecision =
  | { ok: true; patch: { role?: BusinessRole; status?: BusinessMemberStatus } }
  | { ok: false; error: string; status: 400 };

/**
 * Validates a PATCH body for one membership row. Pure, so the whole 400
 * surface of `[memberId]/route.ts` is testable without a database.
 *
 * A role change may name `owner` no more than an invite may: promoting a
 * member to owner without moving `business_profiles.owner_user_id` would
 * produce a company with two owners, only one of whom can actually write.
 */
export function decideBusinessMemberPatch(
  input: BusinessMemberPatchInput,
): BusinessMemberPatchDecision {
  const { role, status } = input;

  if (role === undefined && status === undefined) {
    return { ok: false, error: "لا يوجد ما يُحدَّث.", status: 400 };
  }
  if (role !== undefined && !isInvitableBusinessRole(role)) {
    return {
      ok: false,
      error: `الدور يجب أن يكون واحدًا من: ${BUSINESS_INVITE_ROLE_VALUES.join(", ")}`,
      status: 400,
    };
  }
  if (status !== undefined && !isPatchableBusinessStatus(status)) {
    return {
      ok: false,
      error: `الحالة يجب أن تكون واحدة من: ${BUSINESS_PATCHABLE_STATUSES.join(", ")}`,
      status: 400,
    };
  }

  const patch: { role?: BusinessRole; status?: BusinessMemberStatus } = {};
  if (role !== undefined) patch.role = role as BusinessRole;
  if (status !== undefined) patch.status = status as BusinessMemberStatus;
  return { ok: true, patch };
}
