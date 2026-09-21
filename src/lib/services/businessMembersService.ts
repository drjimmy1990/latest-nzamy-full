/**
 * businessMembersService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/business/members (WP-6 B-5, `public.business_members`).
 *
 * Mirrors `firmMembersService.ts`. Until this file the ONLY writer of
 * `business_members` was the `ensure_business_owner_membership` trigger
 * (20260914), which backfills the owner's own row — so a company's «فريق»
 * could never contain a second person, and `TeamManagementTab` said as much
 * (wrongly claiming the TABLE did not exist; it is the code that did not).
 *
 * Owner-only for every write, per plan §5 Q2/Q7. Reads are open to an active
 * member as well, because RLS admits them (20260921_03's `business_members`
 * SELECT policy) and a roster you are on is not a secret from you.
 *
 * ONE EXCEPTION, added for review A5/F03: the INVITED person may write their
 * own row, and only their own, and only from `invited` to `active`/`removed`
 * — that is `invitationsService.ts` plus
 * 20260922_02_members_accept_own_invitation.sql, not this file.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type {
  BusinessRole,
  BusinessMemberStatus,
} from "@/lib/auth/businessMembershipAccess";

export type { BusinessRole, BusinessMemberStatus };

export interface BusinessMember {
  id: string;
  businessId: string;
  userId: string;
  role: BusinessRole;
  status: BusinessMemberStatus;
  /**
   * `null` when the `profiles` projection behind the roster failed — NOT "—".
   *
   * Names come from a server-only `id, display_name, email` projection the
   * route takes after RLS has proved the caller belongs to the company, so
   * one normally arrives. A screen must still be able to tell «this person has
   * no display name» from «we could not read it», so the null reaches the UI
   * instead of being papered over here.
   */
  displayName: string | null;
  email: string | null;
  /** True for the row whose user_id is business_profiles.owner_user_id — not removable. */
  isOwner: boolean;
  acceptedAt: string | null;
  createdAt: string;
}

/** What the caller may do with this roster — decided by the server, not guessed here. */
export interface BusinessMembersRead {
  list: ListRead<BusinessMember>;
  canManage: boolean;
}

const BASE = "/api/v1/business/members";

export async function getBusinessMembers(): Promise<BusinessMembersRead> {
  if (!isSupabaseMode) return { list: listOk([]), canManage: false };
  try {
    const body = await apiGet<{ data: BusinessMember[]; total?: number; canManage?: boolean }>(BASE);
    return { list: listFromApi(body), canManage: body?.canManage === true };
  } catch (error) {
    console.error("[businessMembersService] getBusinessMembers failed:", error);
    return { list: listFailed<BusinessMember>(), canManage: false };
  }
}

/**
 * INVITES an existing account, looked up by e-mail server-side. Throws with
 * Arabic screen copy.
 *
 * The returned member is `status: "invited"`, NOT `"active"` (review
 * 2026-09-21 A5/F03): the person has to accept before the company can see
 * anything of theirs. They answer from their own dashboard, through
 * `invitationsService`. The route answers 201 for a new invitation and 200
 * when it re-invited an existing `removed`/`suspended` row — both carry the
 * same `{ data }`, so nothing here has to tell them apart.
 */
export async function addBusinessMember(input: { email: string; role: BusinessRole }): Promise<BusinessMember> {
  if (!isSupabaseMode) throw new Error("إدارة الفريق غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: BusinessMember }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم بيانات العضو.");
  return res.data;
}

export async function updateBusinessMember(
  memberId: string,
  patch: { role?: BusinessRole; status?: Exclude<BusinessMemberStatus, "invited"> },
): Promise<BusinessMember> {
  if (!isSupabaseMode) throw new Error("إدارة الفريق غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: BusinessMember }>(
    `${BASE}/${encodeURIComponent(memberId)}`,
    "PATCH",
    patch,
  );
  if (!res?.data) throw new Error("لم يُعِد الخادم بيانات العضو بعد التعديل.");
  return res.data;
}
