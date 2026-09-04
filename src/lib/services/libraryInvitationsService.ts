/**
 * libraryInvitationsService.ts — admin-issued library invitation codes
 * (Phase 6, server-side). `library.invitations` is a separate table/system
 * from the colleague-referral `public.invitations` flow behind
 * /api/v1/invite/[code]/accept: this one is admin-generated codes with a
 * max-uses counter, gating the full legal library.
 * ─────────────────────────────────────────────────────────
 *   POST /api/v1/library/invitations/redeem       — spend a code (any signed-in user)
 *   GET  /api/v1/admin/library-invitations         — list codes (admin)
 *   POST /api/v1/admin/library-invitations         — create a code (admin)
 *
 * The client-side flow in src/lib/invitationStore.ts (localStorage
 * "subscription" + self-issued invitations) is a separate, still-fake demo
 * path this service does not touch or replace.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import { listOk, listFailed, listFromApi, type ListRead } from "@/lib/services/listRead";

export type LibraryInvitationStatus = "active" | "exhausted" | "expired";

export interface LibraryInvitation {
  id: string;
  code: string;
  maxUses: number;
  currentUses: number;
  expiresAt: string | null;
  createdBy: string | null;
  status: LibraryInvitationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RedeemLibraryInvitationResult {
  tier: string;
  /** ISO timestamp the granted plan runs until, or null if the server did not report one. */
  until: string | null;
}

export interface CreateLibraryInvitationInput {
  /** Omit to have the server generate a 10-character code. */
  code?: string;
  maxUses: number;
  /** ISO date/time string. Omit for no expiry. */
  expiresAt?: string;
}

const DEMO = "غير متاح في وضع العرض التجريبي";

/** Spend a library invitation code for the signed-in user. Throws with an Arabic message on rejection. */
export async function redeemLibraryInvitation(code: string): Promise<RedeemLibraryInvitationResult> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ ok: true; tier: string; until: string | null }>(
    "/api/v1/library/invitations/redeem",
    "POST",
    { code },
  );
  return { tier: res.tier, until: res.until };
}

export async function adminListLibraryInvitations(): Promise<ListRead<LibraryInvitation>> {
  if (!isSupabaseMode) return listOk([]);
  try {
    return listFromApi(
      await apiGet<{ data: LibraryInvitation[]; total?: number }>("/api/v1/admin/library-invitations"),
    );
  } catch (error) {
    console.error("[libraryInvitationsService] adminListLibraryInvitations failed:", error);
    return listFailed<LibraryInvitation>();
  }
}

export async function adminCreateLibraryInvitation(
  input: CreateLibraryInvitationInput,
): Promise<LibraryInvitation> {
  if (!isSupabaseMode) throw new Error(DEMO);
  const res = await apiMutate<{ data: LibraryInvitation }>("/api/v1/admin/library-invitations", "POST", input);
  if (!res?.data) throw new Error("لم يُعِد الخادم كود الدعوة المُنشأ.");
  return res.data;
}
