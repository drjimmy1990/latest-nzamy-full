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
    .or(`client_id.eq.${user.id},lawyer_id.eq.${user.id}`)
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
 * Body: { lawyer_id?, type, topic, description, preferred_date? }
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

  if (!body.type || !body.topic || !body.description) {
    return NextResponse.json(
      { error: "type, topic, and description are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("consultations")
    .insert({
      client_id: user.id,
      lawyer_id: body.lawyer_id ?? null,
      type: body.type,
      topic: body.topic,
      description: body.description,
      status: "pending",
      scheduled_at: body.preferred_date ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
