import { NextRequest, NextResponse } from "next/server";
import { dbErrorJson } from "@/lib/api/dbError";
import { createClient } from "@/lib/supabase/server";
import { isAuthUnavailable, authUnavailableResponse, frozenAccountResponse } from "@/lib/auth/apiAuth";

const MAX_PAGE = 100;
const MAX_OFFSET = 100_000;

/** An integer query value clamped to [min, max]; missing or malformed → `fallback`. */
function pageParam(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw !== null && /^\d{1,9}$/.test(raw.trim()) ? Number(raw.trim()) : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * GET /api/v1/research/sessions — List user's research sessions
 * Query params:
 *   - archived ('true'|'false', default: all)
 *   - limit (default: 20, at most 100)
 *   - offset (default: 0)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (isAuthUnavailable(user, authError)) return authUnavailableResponse();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  // Batch l16 (B-43b): a page is 1-100 rows from offset 0 up (a malformed value reads as the default).
  const limit = pageParam(searchParams.get("limit"), 20, 1, MAX_PAGE);
  const offset = pageParam(searchParams.get("offset"), 0, 0, MAX_OFFSET);
  const archived = searchParams.get("archived");

  let query = supabase
    .from("research_sessions")
    .select("*, research_items(count)", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (archived === "true") {
    query = query.eq("status", "archived");
  } else if (archived === "false") {
    query = query.eq("status", "active");
  }

  const { data, count, error } = await query;

  if (error) {
    return dbErrorJson("research/sessions GET", error);
  }

  return NextResponse.json({ data, total: count });
}

/**
 * POST /api/v1/research/sessions — Create a new research session
 * Body: { title? }
 */
export async function POST(request: NextRequest) {
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

  const body = await request.json();

  const { data, error } = await supabase
    .from("research_sessions")
    .insert({
      user_id: user.id,
      title: body.title ?? body.name ?? "Untitled Session",
    })
    .select()
    .single();

  if (error) {
    return dbErrorJson("research/sessions POST", error);
  }

  return NextResponse.json({ data }, { status: 201 });
}
