import type { SupabaseClient } from "@supabase/supabase-js";
import { kindToType, urgencyFromDb } from "@/lib/services/hearingVocabulary";
import { ownRequestsOrFilter } from "@/lib/services/ownRequestsFilter";

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
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export const HEARINGS_SELECT =
  "id, owner_user_id, firm_id, case_request_id, title, kind, hearing_date, hearing_time, location, urgency, status, notes, duration_minutes, metadata, created_at, updated_at";

export function toDto(row: HearingRow) {
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
