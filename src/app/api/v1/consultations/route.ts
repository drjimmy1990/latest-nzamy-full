import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/consultations — List user's consultations
 * User can be either the client or the lawyer.
 * Query params:
 *   - status (filter by consultation status)
 *   - limit (default: 20)
 *   - offset (default: 0)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const status = searchParams.get("status");

  let query = supabase
    .from("consultations")
    .select("*", { count: "exact" })
    .or(`requester_user_id.eq.${user.id},lawyer_user_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, total: count });
}

/**
 * POST /api/v1/consultations — Create a new consultation
 * Body: { request_id, mode | type, lawyer_user_id? | lawyer_id?,
 *         specialty? | topic?, description?, preferred_date? }
 *
 * consultations columns: id, request_id, requester_user_id, lawyer_user_id,
 * mode, specialty, scheduled_at, status, metadata, created_at (NO `notes`
 * column). `description` is stored in `metadata.description`. Accepts alias
 * fields from the frontend (casesService.createConsultation), which sends
 * lawyer_id/type/topic.
 *
 * ── THIS HANDLER COULD NOT SUCCEED, EVER (fixed 2026-08-27) ────────────────
 * The INSERT omitted `request_id`, which is
 *   `request_id text not null unique references public.service_requests(id)`
 * (supabase/migrations/20260518_client_workflow_backend_ready.sql:54). Every
 * call raised 23502 and this route answered 500 with the raw Postgres message.
 * `public.consultations` holds ZERO rows in production, and that is why.
 *
 * It went unnoticed because nothing calls it: `createConsultation`
 * (src/lib/services/casesService.ts:200) has no caller, and the consultation
 * wizard writes a `service_requests` row instead. But the READ side is live —
 * GET below, and the dashboard summary's «موعدك القادم» card both query this
 * table — so the card could never show anything either.
 *
 * `mode` is now validated here too. The column carries
 *   `check (mode in ('ai','video','voice','text','in-person'))`
 * and the body's value went straight in, so a typo became a 23514 and another
 * 500. A CHECK violation is a bad request, not a server fault, and the caller
 * cannot fix what it is not told.
 */
/** Exactly the `consultations.mode` CHECK list, copied from the migration. */
const CONSULTATION_MODES = ["ai", "video", "voice", "text", "in-person"] as const;
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  const mode = body.mode ?? body.type;
  if (!mode) {
    return NextResponse.json(
      { error: "mode is required" },
      { status: 400 },
    );
  }
  if (!(CONSULTATION_MODES as readonly string[]).includes(String(mode))) {
    return NextResponse.json(
      { error: `mode must be one of: ${CONSULTATION_MODES.join(", ")}` },
      { status: 400 },
    );
  }

  // NOT NULL, and the reason this handler never worked. Named as a 400 rather
  // than left to the constraint, so a caller reads what is wrong instead of a
  // Postgres error code.
  const requestId = body.request_id ?? body.requestId;
  if (typeof requestId !== "string" || !requestId.trim()) {
    return NextResponse.json(
      { error: "request_id is required — a consultation belongs to a service request" },
      { status: 400 },
    );
  }

  // Ownership, checked here rather than trusted from the body. The RLS-scoped
  // client can only SELECT rows this user may see, so a request id belonging to
  // someone else comes back empty and is refused — a consultation must not be
  // attached to a stranger's order by guessing its id. 404 not 403, so the
  // answer cannot be used to test whether an id exists.
  const { data: parent } = await supabase
    .from("service_requests")
    .select("id, requester_user_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!parent || parent.requester_user_id !== user.id) {
    return NextResponse.json({ error: "Service request not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("consultations")
    .insert({
      id: body.id ?? crypto.randomUUID(),
      request_id: requestId,
      requester_user_id: user.id,
      lawyer_user_id: body.lawyer_user_id ?? body.lawyer_id ?? null,
      mode,
      specialty: body.specialty ?? body.topic ?? null,
      scheduled_at: body.preferred_date ?? null,
      status: body.status ?? "pending_assignment",
      metadata: body.description
        ? { description: body.description }
        : (body.metadata ?? {}),
    })
    .select()
    .single();

  if (error) {
    console.error("[consultations POST] Supabase error:", error.message, error.details, error.hint, error.code);
    // 23505 is the `request_id` UNIQUE constraint: this order already has a
    // consultation. That is the caller's mistake, not the server's, and 500
    // would send them to retry forever.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A consultation already exists for this service request" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
