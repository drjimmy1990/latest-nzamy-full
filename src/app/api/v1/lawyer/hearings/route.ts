import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { recordActivity, RequestEvent } from "@/lib/events";
import {
  type UiHearingType, type UiUrgency,
  VALID_UI_TYPES, VALID_UI_URGENCIES,
  typeToKind, kindToType, urgencyToDb, urgencyFromDb,
} from "@/lib/services/hearingVocabulary";

/**
 * /api/v1/lawyer/hearings — Phase 1 (خطة_البناء_الكاملة §5).
 *
 * Backed by `public.hearings` (migration 20260903_phase1_case_tables.sql),
 * NOT `service_requests`. Hearings used to be service_requests rows with
 * `metadata.hearing = true`, told apart from tasks/clients/cases only by a
 * jsonb flag; that table is what /dashboard/lawyer/hearings, the dashboard
 * summary and the case-file hearings tab each read a DIFFERENT slice of, by
 * hand, with three different classification bugs fixed in three different
 * places this wave. This route is the one place that shape gets read and
 * written now.
 *
 * ── WIRE VOCABULARY vs DB VOCABULARY ────────────────────────────────────────
 * The request/response bodies here use the vocabulary AddHearingModal has
 * always used — `type` (hearing/deadline/gov_review/client_meet/internal) and
 * `urgency` (critical/high/normal) — NOT the DB's `kind` and `urgency` CHECK
 * constraints, which are wider (`kind` also allows a generic "appointment";
 * `urgency` says "urgent" where the UI says "critical", and also allows "low",
 * which nothing here produces). The translation lives ONLY in this file —
 * `src/lib/services/hearingVocabulary.ts` — so a
 * caller never needs to know the DB enum exists, the same way tasks/route.ts
 * keeps DB_TO_TASK_STATUS local to itself.
 *
 * ── OWNERSHIP, NOT "WHATEVER RLS LETS THROUGH" ──────────────────────────────
 * RLS on `hearings` (can_access_case_row) also admits an ACTIVE firm colleague
 * of the row's owner — by design, so a firm's shared calendar is possible
 * later. This route is a lawyer's OWN diary, not that shared view, so GET
 * filters explicitly to `owner_user_id = uid` on top of RLS rather than
 * relying on the wider grant. A firm-wide calendar is a different query
 * (`?scope=firm`), not a relaxation of this one.
 */

const VALID_TYPES = new Set<string>(VALID_UI_TYPES);
const VALID_URGENCIES = new Set<string>(VALID_UI_URGENCIES);

interface HearingRow {
  id: string;
  case_request_id: string | null;
  title: string;
  kind: string;
  hearing_date: string;
  hearing_time: string | null;
  location: string;
  urgency: string;
  status: string;
  notes: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

function toDto(row: HearingRow) {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    title: row.title,
    type: kindToType(row.kind),
    caseRequestId: row.case_request_id,
    caseName: typeof meta.caseName === "string" ? meta.caseName : undefined,
    date: row.hearing_date,
    time: row.hearing_time,
    location: row.location || undefined,
    urgency: urgencyFromDb(row.urgency),
    notes: row.notes || undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const HEARINGS_SELECT =
  "id, case_request_id, title, kind, hearing_date, hearing_time, location, urgency, status, notes, metadata, created_at, updated_at";

/**
 * GET /api/v1/lawyer/hearings
 * Query params:
 *   - caseId → only hearings linked to that case (case_request_id).
 *   - limit  → default 200. Production holds well under that across every
 *     account combined (verified 2026-09-03), so this is headroom, not a
 *     guess — same reasoning HEARINGS_FETCH_LIMIT documents client-side.
 *
 * Response: `{ data, total }` — NOT a bare array. tasks/route.ts shipped as a
 * bare array and paid for it later (a `.limit(50)` with no `total` to report
 * it against, and three call sites to change in lockstep to fix it). This is
 * a brand-new route with no existing caller to break, so it is done right the
 * first time.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get("caseId");
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

    let query = supabase
      .from("hearings")
      .select(HEARINGS_SELECT, { count: "exact" })
      .eq("owner_user_id", user.id);

    if (caseId) query = query.eq("case_request_id", caseId);

    const { data, error, count } = await query
      .order("hearing_date", { ascending: true })
      .order("hearing_time", { ascending: true, nullsFirst: false })
      .limit(limit);

    if (error) {
      console.error("[lawyer/hearings GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as HearingRow[];
    return NextResponse.json({ data: rows.map(toDto), total: count ?? rows.length });
  } catch (err) {
    console.error("[lawyer/hearings GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/hearings
 * Body: { type, date, time?, caseName?, caseRequestId?, urgency?, location?, notes?, title }
 *
 * `title` is composed by the CALLER (AddHearingModal already builds
 * `${typeLabel} — ${caseName}` client-side, the same as AddCaseModal does for
 * its own title) and stored verbatim — this route does not re-derive it, so
 * the Arabic labels stay defined in exactly one place, the modal's own
 * TYPE_OPTIONS.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const {
      type, date, time, caseName, caseRequestId, urgency, location, notes, title,
    } = body as {
      type?: string; date?: string; time?: string; caseName?: string;
      caseRequestId?: string; urgency?: string; location?: string; notes?: string; title?: string;
    };

    if (!type || !(VALID_TYPES as Set<string>).has(type)) {
      return NextResponse.json({ error: `type must be one of: ${[...VALID_TYPES].join(", ")}` }, { status: 400 });
    }
    // Wall-clock date, matching AddHearingModal's `<input type="date">` and
    // the column comment on hearings.hearing_date — never parsed through
    // `new Date()` here, only shape-checked and passed straight through.
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date is required (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!title || !title.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const uiUrgency: UiUrgency = urgency && (VALID_URGENCIES as Set<string>).has(urgency) ? (urgency as UiUrgency) : "normal";

    // Solo lawyer → no firm row → firm_id stays null, exactly what
    // can_access_case_row's owner arm is for. A lawyer with more than one
    // active membership gets the first; nothing in this product distinguishes
    // between two firms for one lawyer today.
    const { data: membership, error: membershipError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError) {
      console.error("[lawyer/hearings] firm_members lookup failed:", membershipError.message, membershipError.code);
    }

    const metadata: Record<string, unknown> = {};
    if (caseName && caseName.trim()) metadata.caseName = caseName.trim();

    const { data, error } = await supabase
      .from("hearings")
      .insert({
        case_request_id: caseRequestId || null,
        firm_id: membership?.firm_id ?? null,
        owner_user_id: user.id,
        kind: typeToKind(type as UiHearingType),
        title: title.trim(),
        hearing_date: date,
        hearing_time: time || null,
        location: location?.trim() || "",
        urgency: urgencyToDb(uiUrgency),
        notes: notes?.trim() || "",
        metadata,
      })
      .select(HEARINGS_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    // Never blocks the response and never fails the create — see recordActivity's own contract.
    await recordActivity({
      supabase,
      kind: RequestEvent.HEARING_CREATED,
      ownerUserId: user.id,
      firmId: membership?.firm_id ?? null,
      actorUserId: user.id,
      caseRequestId: caseRequestId || null,
      subjectTable: "hearings",
      subjectId: data.id,
      payload: { title: title.trim() },
    });

    return NextResponse.json({ data: toDto(data as HearingRow) });
  } catch (err) {
    console.error("[lawyer/hearings POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
