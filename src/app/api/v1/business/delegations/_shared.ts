import { createServiceClient } from "@/lib/supabase/server";
import {
  DELEGATION_SCOPE_LABEL,
  DELEGATION_STATUS_LABEL,
  delegationStatus,
  type DelegationScope,
} from "@/lib/auth/businessDelegations";
import { BUSINESS_ROLE_LABEL, type BusinessRole } from "@/lib/auth/businessMembershipAccess";

/**
 * Shared by ./route.ts and ./[id]/route.ts — the row shape, the DTO and the
 * display-name projection of «سجل التفويضات» (20261017_30).
 */

/** The table is not there yet (20261017_30 not applied). */
export function isMissingRelation(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

export const DELEGATION_COLUMNS =
  "id, business_id, delegate_user_id, scope, note, expires_on, granted_by, granted_at, revoked_at, revoked_by";

export interface DelegationRow {
  id: string;
  business_id: string;
  delegate_user_id: string;
  scope: string;
  note: string | null;
  expires_on: string | null;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
}

export interface MemberLite {
  user_id: string;
  role: string;
  status: string;
}

export async function displayNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string"))];
  const names = new Map<string, string | null>();
  if (unique.length === 0) return names;
  const service = await createServiceClient();
  const { data, error } = await service.from("profiles").select("id, display_name").in("id", unique);
  if (error) {
    console.error("[business/delegations] profiles lookup failed:", error.message, error.code);
    return names;
  }
  for (const p of data ?? []) names.set(p.id as string, (p.display_name as string | null) ?? null);
  return names;
}

export function toDelegationDto(
  row: DelegationRow,
  names: Map<string, string | null>,
  member: MemberLite | undefined,
  today: string,
) {
  const status = delegationStatus(
    { revokedAt: row.revoked_at, expiresOn: row.expires_on, memberActive: member?.status === "active" },
    today,
  );
  const scope = row.scope as DelegationScope;
  return {
    id: row.id,
    delegateUserId: row.delegate_user_id,
    delegateName: names.get(row.delegate_user_id) ?? null,
    delegateRole: member ? (BUSINESS_ROLE_LABEL[member.role as BusinessRole] ?? null) : null,
    scope,
    scopeLabel: DELEGATION_SCOPE_LABEL[scope] ?? row.scope,
    note: row.note,
    expiresOn: row.expires_on,
    grantedAt: row.granted_at,
    grantedByName: row.granted_by ? names.get(row.granted_by) ?? null : null,
    revokedAt: row.revoked_at,
    revokedByName: row.revoked_by ? names.get(row.revoked_by) ?? null : null,
    status,
    statusLabel: DELEGATION_STATUS_LABEL[status],
  };
}

