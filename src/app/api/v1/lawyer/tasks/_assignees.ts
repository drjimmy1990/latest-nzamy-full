/**
 * _assignees.ts — who a task may be assigned to, read on the server.
 * ─────────────────────────────────────────────────────────
 * Owner item 59 («المحامي المُكلَّف»). Shared by POST/PATCH
 * /api/v1/lawyer/tasks (to validate `assigneeUserId`) and
 * GET /api/v1/lawyer/tasks/assignees (the picker's options), so the two can
 * never disagree about who is pickable. A route file may export only its
 * handlers, hence this sibling module (the same shape as
 * consultations/_shared.ts).
 *
 * The roster is read through the CALLER's own client: the `firm_members`
 * SELECT policy admits an active co-member's rows, and a firm's owner has
 * their own `managing_partner` row (added by trigger), so the owner is a
 * member here too. Only display names need the service client, because
 * `profiles` RLS lets a user read their own row and nothing else.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * The caller's firm, the same read the tasks POST has always made for
 * `firm_id`: the first ACTIVE membership, or null for a solo lawyer. A read
 * error is logged and treated as no firm, so the caller can still assign a
 * task to themself and nobody else (fail closed).
 */
export async function readCallerFirmId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("firm_members")
    .select("firm_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[lawyer/tasks] firm_members lookup failed:", error.message, error.code);
    return null;
  }
  return (data?.firm_id as string | undefined) ?? null;
}

/**
 * The user ids of every ACTIVE member of `firmId` — who may be ASSIGNED. On a
 * read error this returns `[]` (logged), so validation refuses any assignee
 * other than the caller rather than accepting one it could not check.
 */
export async function readActiveFirmMemberIds(supabase: SupabaseClient, firmId: string | null): Promise<string[]> {
  return readFirmMemberIds(supabase, firmId, true);
}

/**
 * The user ids of every member of `firmId` in ANY status (invited, active,
 * suspended, removed) — whose NAME a task list may show (see
 * `namesVisibleTo`), so a task assigned to a colleague who has since left
 * still names them. The co-member SELECT policy filters on the caller being
 * active, not on the row's status. On a read error: `[]`, so no colleague
 * name is revealed.
 */
export async function readFirmMemberIdsAnyStatus(supabase: SupabaseClient, firmId: string | null): Promise<string[]> {
  return readFirmMemberIds(supabase, firmId, false);
}

async function readFirmMemberIds(supabase: SupabaseClient, firmId: string | null, activeOnly: boolean): Promise<string[]> {
  if (!firmId) return [];
  let query = supabase.from("firm_members").select("user_id").eq("firm_id", firmId);
  if (activeOnly) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) {
    console.error("[lawyer/tasks] firm roster read failed:", error.message, error.code);
    return [];
  }
  return Array.from(
    new Set(
      (data ?? [])
        .map((r) => (r as { user_id?: unknown }).user_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
}

/**
 * `profiles.display_name` for each id, best-effort. Service-role, the same
 * pattern `service-requests/[id]` uses to resolve a document's `uploaderName`.
 * Callers pass only ids from the caller's own firm roster or the caller
 * themself — a task's `assignee_user_id` goes through `namesVisibleTo`
 * first, because that column can hold any user's id — and only
 * `id, display_name` is read. Never fails the parent request: a failed lookup leaves the names out.
 */
export async function resolveDisplayNames(ids: string[]): Promise<Record<string, string>> {
  const namesById: Record<string, string> = {};
  if (ids.length === 0) return namesById;
  try {
    const svc = await createServiceClient();
    const { data: nameRows, error } = await svc
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);
    if (error) {
      console.error("[lawyer/tasks] display name lookup failed:", error.message, error.code);
      return namesById;
    }
    for (const row of nameRows ?? []) {
      const r = row as Record<string, unknown>;
      if (typeof r.id === "string" && typeof r.display_name === "string" && r.display_name.trim()) {
        namesById[r.id] = r.display_name.trim();
      }
    }
  } catch (e) {
    console.error("[lawyer/tasks] display name lookup failed:", (e as Error).message);
  }
  return namesById;
}
