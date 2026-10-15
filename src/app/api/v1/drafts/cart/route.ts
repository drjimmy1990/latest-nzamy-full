import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { buildCartRows } from "./_cartRows";

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

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    // Anonymous users have no server cart — return an empty 200 instead of 401
    // so the public /laws page (DraftDrawer) doesn't spam 401s on every mount.
    return NextResponse.json({ data: { user_id: null, items: [] } });
  }

  const { data, error } = await supabase
    .from("law_draft_carts")
    .select("*")
    .eq("user_id", user.id)
    // The order the client saved (PUT stores it in `position`), newest first
    // among rows saved before positions were stored.
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

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
 * Body: { items: [{ law_slug, article_number, payload? }] }   (article_title,
 * which older clients send, is ignored — the column does not exist; the title
 * travels inside `payload`.)
 *
 * SAFE REPLACE. The new rows are inserted FIRST and the previous rows are
 * deleted only after that succeeded, by id. This route used to delete the
 * whole cart, ignore that delete's result, and then insert — so when the
 * insert failed (it always did: it wrote the missing `article_title` column,
 * 42703 on production 2026-10-16) the user's cart was simply gone. Now a
 * failed insert leaves the old cart untouched, and a failed cleanup removes
 * the rows just inserted so the cart is never doubled.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const built = buildCartRows(user.id, body?.items);
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  // What the cart holds now — removed below only once the new rows are in.
  const { data: previous, error: previousError } = await supabase
    .from("law_draft_carts")
    .select("id")
    .eq("user_id", user.id);
  if (previousError) {
    console.error("[drafts/cart PUT] reading the current cart failed:", previousError.message, previousError.code);
    return NextResponse.json({ error: "تعذّر حفظ السلة" }, { status: 500 });
  }
  const previousIds = (previous ?? []).map((r) => r.id as string);

  let insertedIds: string[] = [];
  if (built.rows.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("law_draft_carts")
      .insert(built.rows)
      .select("id");
    if (insertError) {
      console.error("[drafts/cart PUT] insert failed:", insertError.message, insertError.code);
      return NextResponse.json({ error: "تعذّر حفظ السلة" }, { status: 500 });
    }
    insertedIds = (inserted ?? []).map((r) => r.id as string);
  }

  if (previousIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("law_draft_carts")
      .delete()
      .eq("user_id", user.id)
      .in("id", previousIds);
    if (deleteError) {
      console.error("[drafts/cart PUT] removing the previous cart failed:", deleteError.message, deleteError.code);
      // Undo the insert so the cart is the old one, not old + new.
      if (insertedIds.length > 0) {
        await supabase.from("law_draft_carts").delete().eq("user_id", user.id).in("id", insertedIds);
      }
      return NextResponse.json({ error: "تعذّر حفظ السلة" }, { status: 500 });
    }
  }

  // Return updated cart
  const { data } = await supabase
    .from("law_draft_carts")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  return NextResponse.json({
    data: { user_id: user.id, items: data ?? [] },
  });
}
