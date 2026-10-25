import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";
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
 * SAFE REPLACE. The table has UNIQUE (user_id, law_slug, article_number)
 * (production schema 2026-10-10), so the new rows are UPSERTED on that key —
 * an article already in the cart keeps its row and gets its new payload and
 * position — and only then are the rows the new cart no longer holds deleted.
 * This route used to delete the whole cart, ignore that delete's result, and
 * then insert, so when the insert failed (it always did: it wrote the missing
 * `article_title` column, 42703 on production 2026-10-16) the user's cart was
 * simply gone. Now a failed upsert leaves the old cart untouched, and a failed
 * cleanup leaves the new items plus some old ones — never fewer.
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
  // D6 (owner ٢٩٨): a frozen account (a pending deletion) changes nothing.
  const frozen = frozenAccountResponse(user);
  if (frozen) return frozen;

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

  let keptIds: string[] = [];
  if (built.rows.length > 0) {
    const { data: saved, error: saveError } = await supabase
      .from("law_draft_carts")
      .upsert(built.rows, { onConflict: "user_id,law_slug,article_number" })
      .select("id");
    if (saveError) {
      console.error("[drafts/cart PUT] upsert failed:", saveError.message, saveError.code);
      return NextResponse.json({ error: "تعذّر حفظ السلة" }, { status: 500 });
    }
    keptIds = (saved ?? []).map((r) => r.id as string);
  }

  // Everything the new cart does not hold. The ids come from the database, so
  // the `in` list carries no user input.
  let removal = supabase.from("law_draft_carts").delete().eq("user_id", user.id);
  if (keptIds.length > 0) removal = removal.not("id", "in", `(${keptIds.join(",")})`);
  const { error: deleteError } = await removal;
  if (deleteError) {
    console.error("[drafts/cart PUT] removing dropped items failed:", deleteError.message, deleteError.code);
    return NextResponse.json({ error: "تعذّر حفظ السلة" }, { status: 500 });
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
