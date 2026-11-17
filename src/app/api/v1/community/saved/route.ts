import { NextRequest, NextResponse } from "next/server";
import { dbErrorJson } from "@/lib/api/dbError";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse } from "@/lib/auth/apiAuth";
import { LIST_SELECT, toFeedItem } from "../posts/_feed";
import { viewerStateFor } from "../posts/_viewer";

/**
 * GET /api/v1/community/saved — the signed-in user's saved («حفظ») questions,
 * newest save first, in the feed's own shape (toFeedItem).
 * Query params: limit (default 20, max 50), offset (default 0).
 *
 * community_saves (20261125_53) answers only the caller's own rows. The post
 * is embedded `!inner` under the posts' own RLS, so a saved question that was
 * moderated, deleted or is no longer readable drops out of the list AND out
 * of `total` — it is not shown as an empty card.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) return NextResponse.json({ error: "سجّل الدخول لعرض الأسئلة المحفوظة." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1), 50);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

  const { data, count, error } = await supabase
    .from("community_saves")
    .select(`created_at, post:community_posts!inner(${LIST_SELECT})`, { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return dbErrorJson("community/saved GET", error);

  const rows = ((data ?? []) as unknown as { post: Record<string, unknown> | null }[])
    .map((r) => r.post)
    .filter((p): p is Record<string, unknown> => p != null && typeof p === "object");
  const viewer = await viewerStateFor(supabase, user.id, rows.map((r) => String(r.id ?? "")));
  return NextResponse.json({
    data: rows.map((r) => toFeedItem(r, viewer.forPost(String(r.id ?? "")))),
    total: count,
  });
}
