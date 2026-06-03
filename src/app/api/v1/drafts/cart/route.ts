import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/drafts/cart — Get user's draft cart
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("law_draft_carts")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return empty cart if none exists
  return NextResponse.json({
    data: data ?? { user_id: user.id, items: [] },
  });
}

/**
 * PUT /api/v1/drafts/cart — Replace entire cart content
 * Body: { items: [...] }
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (!Array.isArray(body.items)) {
    return NextResponse.json(
      { error: "items must be an array" },
      { status: 400 },
    );
  }

  // Upsert: create or update the cart
  const { data, error } = await supabase
    .from("law_draft_carts")
    .upsert(
      {
        user_id: user.id,
        items: body.items,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
