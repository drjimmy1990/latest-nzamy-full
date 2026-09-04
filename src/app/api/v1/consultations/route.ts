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
 * POST /api/v1/consultations — DISABLED (2026-09-05, phase 3).
 *
 * This handler never had a caller — `createConsultation`
 * (src/lib/services/casesService.ts) has no call site (the consultation
 * wizard writes a `service_requests` row instead) — which is the only reason
 * it survived as long as it did with an INSERT that could not succeed (see
 * the removed history below, kept in git blame, not here).
 *
 * 20260905_phase3_consultations_and_contracts.sql (DECISION 2) adds a trigger
 * — `consultation_from_service_request()` — that gives every
 * `type = 'consultation'` service_requests row its own `consultations` row
 * automatically, the instant it is inserted, keyed `UNIQUE(request_id)`. A
 * POST here for a request that already has one would not create a second
 * record; it would collide with the trigger's row and fail with 23505 on
 * that same constraint — a confusing failure for code that has never once
 * needed to run. The route is answered off rather than repaired, and kept
 * (not deleted) so a stray caller gets an explanatory 409 instead of a 404
 * that reads as "this endpoint doesn't exist yet".
 */
export async function POST(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    { error: "تُنشأ سجلّة الاستشارة تلقائياً مع الطلب — لا حاجة لإنشائها" },
    { status: 409 },
  );
}
