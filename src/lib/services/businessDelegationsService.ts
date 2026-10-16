/**
 * businessDelegationsService.ts — typed client for /api/v1/business/delegations
 * («سجل التفويضات», owner decision ٣٦ / owner decision ٥ «التفويض»).
 *
 * Every rule lives on the server (20261017_30 + the route); this file only
 * moves data. In demo mode there is no register to read, so the read reports
 * itself as unavailable instead of inventing rows.
 */

"use client";

import { apiGet, apiMutate, isSupabaseMode } from "@/lib/services/api";
import type { DelegationScope, DelegationStatus } from "@/lib/auth/businessDelegations";
import type { BusinessProfileScope } from "@/lib/auth/businessProfileScope";

export interface BusinessDelegation {
  id: string;
  delegateUserId: string;
  /** null when the name projection failed — not "no name". */
  delegateName: string | null;
  delegateRole: string | null;
  scope: DelegationScope;
  scopeLabel: string;
  note: string | null;
  /** YYYY-MM-DD, the last day (Riyadh); null = until revoked. */
  expiresOn: string | null;
  grantedAt: string;
  grantedByName: string | null;
  revokedAt: string | null;
  revokedByName: string | null;
  status: DelegationStatus;
  statusLabel: string;
}

export interface EligibleDelegate {
  userId: string;
  name: string | null;
  role: string | null;
}

export type DelegationsRead =
  | {
      state: "ok";
      rows: BusinessDelegation[];
      canManage: boolean;
      callerScope: BusinessProfileScope;
      eligibleMembers: EligibleDelegate[];
    }
  | { state: "unavailable"; message: string }
  | { state: "failed"; message: string };

export async function getBusinessDelegations(): Promise<DelegationsRead> {
  if (!isSupabaseMode) {
    return { state: "unavailable", message: "سجل التفويضات يعمل على الحساب الحقيقي فقط، وليس في وضع العرض." };
  }
  try {
    const res = await apiGet<{
      data: BusinessDelegation[];
      canManage: boolean;
      callerScope: BusinessProfileScope;
      eligibleMembers: EligibleDelegate[];
    }>("/api/v1/business/delegations");
    return {
      state: "ok",
      rows: Array.isArray(res.data) ? res.data : [],
      canManage: res.canManage === true,
      callerScope: res.callerScope ?? "member",
      eligibleMembers: Array.isArray(res.eligibleMembers) ? res.eligibleMembers : [],
    };
  } catch (err) {
    const message = err instanceof Error && /[؀-ۿ]/.test(err.message) ? err.message : "تعذّر تحميل سجل التفويضات.";
    return { state: "failed", message };
  }
}

export async function createBusinessDelegation(input: {
  delegateUserId: string;
  expiresOn: string | null;
  note: string | null;
}): Promise<BusinessDelegation> {
  const res = await apiMutate<{ data: BusinessDelegation }>("/api/v1/business/delegations", "POST", {
    delegateUserId: input.delegateUserId,
    scope: "company_profile",
    expiresOn: input.expiresOn,
    note: input.note,
  });
  return res.data;
}

export async function revokeBusinessDelegation(id: string): Promise<BusinessDelegation> {
  const res = await apiMutate<{ data: BusinessDelegation }>(
    `/api/v1/business/delegations/${encodeURIComponent(id)}`,
    "PATCH",
    { action: "revoke" },
  );
  return res.data;
}
