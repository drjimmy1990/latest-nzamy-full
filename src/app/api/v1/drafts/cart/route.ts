import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/drafts/cart — Get user's draft cart articles
 * Returns all saved articles as an array.
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
    .order("saved_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Return as items array for backward compatibility
  return NextResponse.json({
    data: { user_id: user.id, items: data ?? [] },
  });
}

/**
 * PUT /api/v1/drafts/cart — Replace entire cart content
 * Body: { items: [{ law_slug, article_number, article_title? }] }
 * Deletes all existing items and inserts new ones.
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

  // Delete all existing items for this user
  await supabase
    .from("law_draft_carts")
    .delete()
    .eq("user_id", user.id);

  // Insert new items (if any)
  if (body.items.length > 0) {
    const rows = body.items.map((item: { law_slug: string; article_number: string; article_title?: string }) => ({
      user_id: user.id,
      law_slug: item.law_slug,
      article_number: item.article_number,
      article_title: item.article_title ?? "",
    }));

    const { error } = await supabase
      .from("law_draft_carts")
      .insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Return updated cart
  const { data } = await supabase
    .from("law_draft_carts")
    .select("*")
    .eq("user_id", user.id)
    .order("saved_at", { ascending: false });

  return NextResponse.json({
    data: { user_id: user.id, items: data ?? [] },
  });
}
