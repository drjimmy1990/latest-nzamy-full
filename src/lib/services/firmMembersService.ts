/**
 * firmMembersService.ts
 * ─────────────────────────────────────────────────────────
 * Typed client for /api/v1/firm/members (Phase 2, public.firm_members).
 *
 * Until Phase 2 nothing in the product wrote a firm_members row, so the
 * "firm" arm of every Phase 1 policy was dead. This is the first writer:
 * the firm OWNER (user_type "firm", firm_profiles.owner_user_id) adds an
 * EXISTING lawyer account by e-mail. Invitations to people without an
 * account are a later step (team_invitations exists, unused).
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";
import type { FirmRole } from "@/types/firmBackendReady";

export type { FirmRole };
export type FirmMemberStatus = "invited" | "active" | "suspended" | "removed";

export interface FirmMember {
  id: string;
  firmId: string;
  userId: string;
  role: FirmRole;
  status: FirmMemberStatus;
  displayName: string;
  email: string | null;
  /** true for the firm owner's own managing_partner row — not removable. */
  isOwner: boolean;
  acceptedAt: string | null;
  createdAt: string;
}

const BASE = "/api/v1/firm/members";

export async function getFirmMembers(): Promise<ListRead<FirmMember>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    const body = await apiGet<{ data: FirmMember[]; total?: number }>(BASE);
    return listFromApi(body);
  } catch (error) {
    console.error("[firmMembersService] getFirmMembers failed:", error);
    return listFailed<FirmMember>();
  }
}

/** Adds an existing lawyer account (looked up by e-mail, server-side) as an active member. Throws with Arabic screen copy. */
export async function addFirmMember(input: { email: string; role: FirmRole }): Promise<FirmMember> {
  if (!isSupabaseMode) throw new Error("إدارة الفريق غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: FirmMember }>(BASE, "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم بيانات العضو.");
  return res.data;
}

export async function updateFirmMember(memberId: string, patch: { role?: FirmRole; status?: Exclude<FirmMemberStatus, "invited"> }): Promise<FirmMember> {
  if (!isSupabaseMode) throw new Error("إدارة الفريق غير متاحة في وضع العرض التجريبي");
  const res = await apiMutate<{ data: FirmMember }>(`${BASE}/${encodeURIComponent(memberId)}`, "PATCH", patch);
  if (!res?.data) throw new Error("لم يُعِد الخادم بيانات العضو بعد التعديل.");
  return res.data;
}
