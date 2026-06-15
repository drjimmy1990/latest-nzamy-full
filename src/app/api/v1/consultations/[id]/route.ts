import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/consultations/[id] — Get consultation detail
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const { data, error } = await supabase
    .from("consultations")
    .select("*")
    .eq("id", id)
    .or(`requester_user_id.eq.${user.id},lawyer_user_id.eq.${user.id}`)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "Consultation not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ data });
}

/**
 * PATCH /api/v1/consultations/[id] — Update consultation
 * Body: { status?, scheduled_at?, notes? }
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  // Verify user is part of this consultation
  const { data: existing } = await supabase
    .from("consultations")
    .select("requester_user_id, lawyer_user_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: "Consultation not found" },
      { status: 404 },
    );
  }

  if (existing.requester_user_id !== user.id && existing.lawyer_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const allowedFields = ["status", "scheduled_at", "notes"];
  const updates: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("consultations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
