import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/research/items?used=false|true&limit&offset
 * Every one of the caller's `research_items`, across ALL of their sessions —
 * including the "__desktop__" one (see research/desktop/route.ts) — because
 * `research_items` carries no `space` concept server-side, only a
 * `session_id`. RLS (see items/_shared.ts's header) already scopes SELECT to
 * sessions this user owns, so no join or `user_id` filter is written here.
 *
 * Backs researchService.ts's getUnused()/getUnusedCount() — the two reads
 * that were local-only (draftInboxStore) in both modes until this route
 * existed; see that file's header for the history.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "غير مصرح — يرجى تسجيل الدخول" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const usedParam = searchParams.get("used");
  if (usedParam !== null && usedParam !== "true" && usedParam !== "false") {
    return NextResponse.json(
      { error: "قيمة used يجب أن تكون true أو false" },
      { status: 400 },
    );
  }
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;
  const offsetParam = Number(searchParams.get("offset"));
  const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

  let query = supabase.from("research_items").select("*", { count: "exact" });
  if (usedParam !== null) {
    query = query.eq("used", usedParam === "true");
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[research/items GET] query failed:", error.message, error.code);
    return NextResponse.json({ error: "تعذّر تحميل العناصر" }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], total: count ?? (data ?? []).length });
}
