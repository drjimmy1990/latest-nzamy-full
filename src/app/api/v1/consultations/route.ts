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
 * Body: { lawyer_user_id? | lawyer_id?, mode | type, specialty? | topic?,
 *        description?, preferred_date? }
 *
 * consultations columns: id, requester_user_id, lawyer_user_id, mode, specialty,
 * scheduled_at, status, metadata, created_at (NO `notes` column). `description`
 * is stored in `metadata.description`. Accepts alias fields from the frontend
 * (casesService.createConsultation) which sends lawyer_id/type/topic.
 */
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

  const { data, error } = await supabase
    .from("consultations")
    .insert({
      id: body.id ?? crypto.randomUUID(),
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
