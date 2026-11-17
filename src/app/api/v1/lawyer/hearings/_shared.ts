import type { SupabaseClient } from "@supabase/supabase-js";
import { kindToType, urgencyFromDb } from "@/lib/services/hearingVocabulary";
import { ownRequestsOrFilter } from "@/lib/services/ownRequestsFilter";
import { namesVisibleTo } from "@/lib/services/taskMetadata";
import { readFirmMemberIdsAnyStatus, resolveDisplayNames } from "../tasks/_assignees";

/**
 * Shared by /api/v1/lawyer/hearings (GET/POST) and /api/v1/lawyer/hearings/[id]
 * (PATCH). Lives outside route.ts on purpose: a route module may only export
 * HTTP handlers.
 */

export interface HearingRow {
  id: string;
  owner_user_id?: string;
  firm_id?: string | null;
  case_request_id: string | null;
  title: string;
  kind: string;
  hearing_date: string;
  hearing_time: string | null;
  location: string;
  urgency: string;
  status: string;
  notes: string;
  /** Owner item 59 («مدة الجلسة»). Nullable; set by POST's `durationMinutes`. */
  duration_minutes: number | null;
  /**
   * N01-18 (20261124_50): who attends for the firm, when not the owner. The
   * database admits only the owner or an active member of the row's firm.
   */
  assignee_user_id?: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// N01-18: assignee_user_id needs 20261124_50 — run it BEFORE this code deploys.
export const HEARINGS_SELECT =
  "id, owner_user_id, firm_id, case_request_id, title, kind, hearing_date, hearing_time, location, urgency, status, notes, duration_minutes, assignee_user_id, metadata, created_at, updated_at";

/**
 * `viewerId` (the caller) decides `isOwn`: false for a hearing a colleague
 * assigned to the caller, which the diary shows with its owner's name and
 * only the outcome actions (PATCH refuses the rest). `names` maps user ids to
 * display names already filtered by `hearingNamesFor`.
 */
export function toDto(row: HearingRow, viewerId?: string, names: Record<string, string> = {}) {
  const meta = row.metadata ?? {};
  const history = Array.isArray(meta.history) ? meta.history : [];
  return {
    id: row.id,
    title: row.title,
    type: kindToType(row.kind),
    caseRequestId: row.case_request_id,
    // CODE-F17: display only. When the row is linked, POST/PATCH stamp the
    // case's own title here; free text on an unlinked row is never a link.
    caseName: typeof meta.caseName === "string" ? meta.caseName : undefined,
    date: row.hearing_date,
    time: row.hearing_time,
    location: row.location || undefined,
    urgency: urgencyFromDb(row.urgency),
    notes: row.notes || undefined,
    status: row.status,
    durationMinutes: typeof row.duration_minutes === "number" ? row.duration_minutes : null,
    assigneeUserId: row.assignee_user_id ?? null,
    assigneeName: row.assignee_user_id ? names[row.assignee_user_id] ?? null : null,
    isOwn: viewerId === undefined || row.owner_user_id === undefined || row.owner_user_id === viewerId,
    ownerName: viewerId !== undefined && row.owner_user_id && row.owner_user_id !== viewerId
      ? names[row.owner_user_id] ?? null
      : null,
    // CODE-F18: the change log (postpone / cancel / held / reopen / edit),
    // oldest first — who, when, why.
    history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * CODE-F17 / LIVE-F28: a hearing is linked to a case by ID, and only to a case
 * that is the caller's OWN work. `hearings.case_request_id` is a foreign key,
 * which ignores RLS, and RLS on service_requests also shows a verified lawyer
 * every unassigned marketplace request — so the read here applies the same
 * own-work filter the case list applies (ownRequestsOrFilter), and the
 * returned title is what the hearing stores as its display name.
 */
export async function resolveOwnCase(
  supabase: SupabaseClient,
  userId: string,
  caseRequestId: string,
): Promise<{ ok: true; id: string; title: string } | { ok: false; error: string; status: number }> {
  const { data: memberships } = await supabase
    .from("firm_members")
    .select("firm_id")
    .eq("user_id", userId)
    .eq("status", "active");
  const firmIds = ((memberships ?? []) as { firm_id: string | null }[])
    .map((m) => m.firm_id)
    .filter((v): v is string => !!v);

  const { data, error } = await supabase
    .from("service_requests")
    .select("id, title")
    .eq("id", caseRequestId)
    .or(ownRequestsOrFilter({ uid: userId, firmIds, businessIds: [] }))
    .maybeSingle();

  if (error) {
    console.error("[lawyer/hearings] case lookup failed:", error.message, error.code);
    return { ok: false, error: "تعذّر التحقق من القضية المختارة — لم يُحفظ شيء.", status: 500 };
  }
  if (!data) {
    return { ok: false, error: "القضية المختارة غير موجودة ضمن قضاياك — لم يُحفظ شيء.", status: 400 };
  }
  const row = data as { id: string; title: string | null };
  return { ok: true, id: row.id, title: (row.title ?? "").trim() || "قضية بدون عنوان" };
}

// ─── N01-18: the hearing's assignee («المحامي المُكلَّف بالجلسة») ─────────────

export const HEARING_ASSIGNEE_INVALID_AR = "المحامي المُكلَّف بالجلسة غير صالح — يُختار من محامي المكتب النشطين.";

/**
 * The firm roles a hearing may be assigned to: the ones that plead (Art. 18 —
 * FIRM_LITIGATION_ROLES in entityRouteAccess.ts) plus a trainee lawyer. A
 * consultant, in-house or of-counsel member, and the admin roles are not
 * offered. (A consultant's own writes are refused by the database anyway.)
 */
export const HEARING_ASSIGNABLE_ROLES: ReadonlySet<string> = new Set([
  "managing_partner", "partner", "senior_lawyer", "lawyer", "trainee",
]);

/**
 * The caller's firm: the first ACTIVE membership, or null for a solo lawyer —
 * the same read POST has always made for `firm_id`.
 */
export async function readCallerHearingFirmId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("firm_members")
    .select("firm_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[lawyer/hearings] firm_members lookup failed:", error.message, error.code);
    return null;
  }
  return (data?.firm_id as string | undefined) ?? null;
}

/**
 * Who a hearing of `firmId` may be assigned to: its ACTIVE members in a
 * HEARING_ASSIGNABLE_ROLES role. Read through the caller's own client (the
 * co-member SELECT policy admits an active member's view of the roster). A
 * read error answers `[]`, so validation refuses anyone but the caller.
 */
export async function readHearingAssignableIds(supabase: SupabaseClient, firmId: string | null): Promise<string[]> {
  if (!firmId) return [];
  const { data, error } = await supabase
    .from("firm_members")
    .select("user_id, role")
    .eq("firm_id", firmId)
    .eq("status", "active");
  if (error) {
    console.error("[lawyer/hearings] firm roster read failed:", error.message, error.code);
    return [];
  }
  const ids = new Set<string>();
  for (const r of (data ?? []) as { user_id?: unknown; role?: unknown }[]) {
    if (typeof r.user_id === "string" && r.user_id && typeof r.role === "string" && HEARING_ASSIGNABLE_ROLES.has(r.role)) {
      ids.add(r.user_id);
    }
  }
  return [...ids];
}

/**
 * Validates a body's `assigneeUserId`. null / absent / the caller → fine (the
 * caller is "me"; stored as null when it is the owner, so "no assignee" has
 * one spelling). Anyone else must be on `readHearingAssignableIds` of the
 * HEARING'S firm — a solo hearing (firm null) can name nobody else.
 */
export async function parseHearingAssignee(
  supabase: SupabaseClient,
  input: { assigneeId: unknown; ownerId: string; firmId: string | null },
): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const { assigneeId, ownerId, firmId } = input;
  if (assigneeId === null || assigneeId === undefined || assigneeId === "") return { ok: true, value: null };
  if (typeof assigneeId !== "string") return { ok: false, error: HEARING_ASSIGNEE_INVALID_AR };
  const id = assigneeId.trim();
  if (!id) return { ok: true, value: null };
  if (id === ownerId) return { ok: true, value: null };
  const allowed = await readHearingAssignableIds(supabase, firmId);
  return allowed.includes(id) ? { ok: true, value: id } : { ok: false, error: HEARING_ASSIGNEE_INVALID_AR };
}

/**
 * Display names for the owners and assignees on a page of hearings — only for
 * the caller and members of the caller's firm (any status), because the names
 * are read with the service role (namesVisibleTo, the tasks rule).
 */
export async function hearingNamesFor(
  supabase: SupabaseClient,
  userId: string,
  rows: HearingRow[],
): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.assignee_user_id) ids.add(r.assignee_user_id);
    if (r.owner_user_id && r.owner_user_id !== userId) ids.add(r.owner_user_id);
  }
  ids.delete(userId);
  if (ids.size === 0) return {};
  const firmMemberIds = await readFirmMemberIdsAnyStatus(supabase, await readCallerHearingFirmId(supabase, userId));
  return resolveDisplayNames(namesVisibleTo({ ids: [...ids], callerId: userId, firmMemberIds }));
}
