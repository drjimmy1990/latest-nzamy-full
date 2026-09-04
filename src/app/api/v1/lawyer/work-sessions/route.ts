import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { parseIsoDate } from "@/lib/services/deadlineEngine";
import { validateWorkSessionInput, type WorkSessionInputBody } from "@/lib/services/workSessionInput";
import { WORK_SESSION_SELECT, toWorkSessionDto, riyadhDayStartIso, riyadhDayEndIso, dbErrorResponse, type WorkSessionRow } from "./_shared";

/**
 * /api/v1/lawyer/work-sessions — Phase 6, the pomodoro / focus log out of
 * the browser (item 97; see workSessionsService.ts's own header).
 *
 * Backed by `public.work_sessions` (20260906_phase6_settings_out_of_browser.sql),
 * RLS `for all using (user_id = auth.uid())` — any signed-in role may keep a
 * log, so this route only calls `assertRole()` with no allow-list; the
 * policy is what actually scopes every row to its owner.
 *
 * GET filters on `started_at`, the timestamptz the session was begun at —
 * `from`/`to` are wall-clock YYYY-MM-DD days in Riyadh (no DST, a fixed
 * UTC+3), validated with the same `ISO_DATE_RE` + `parseIsoDate` pair
 * `lawyer/deadlines/route.ts` uses for its own date params, then widened to
 * the UTC instant range that day spans in Riyadh — `from` inclusive at
 * 00:00:00+03:00, `to` inclusive through 23:59:59.999+03:00 — the same
 * `+03:00`-literal construction `lawyer/dashboard/summary/route.ts` already
 * uses for its "this month" boundary.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/v1/lawyer/work-sessions?from=YYYY-MM-DD&to=YYYY-MM-DD&limit
 * Response: { data: WorkSession[], total } — newest first (started_at desc).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 200;

    if (from !== null && (!ISO_DATE_RE.test(from) || !parseIsoDate(from))) {
      return NextResponse.json({ error: "from يجب أن يكون بصيغة YYYY-MM-DD." }, { status: 400 });
    }
    if (to !== null && (!ISO_DATE_RE.test(to) || !parseIsoDate(to))) {
      return NextResponse.json({ error: "to يجب أن يكون بصيغة YYYY-MM-DD." }, { status: 400 });
    }

    let query = supabase.from("work_sessions").select(WORK_SESSION_SELECT, { count: "exact" }).eq("user_id", user.id);
    if (from) query = query.gte("started_at", riyadhDayStartIso(from));
    if (to) query = query.lte("started_at", riyadhDayEndIso(to));

    const { data, error, count } = await query.order("started_at", { ascending: false }).limit(limit);

    if (error) {
      console.error("[lawyer/work-sessions GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: "تعذّر تحميل سجل الجلسات." }, { status: 500 });
    }

    const rows = (data ?? []) as WorkSessionRow[];
    return NextResponse.json({ data: rows.map(toWorkSessionDto), total: count ?? rows.length });
  } catch (err) {
    console.error("[lawyer/work-sessions GET] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/work-sessions
 * Body: WorkSessionInput (see src/lib/services/workSessionInput.ts for the
 * exact checks). `taskId` is never existence-checked — the column carries no
 * FK on purpose, so a session logged against a task that is later deleted
 * keeps its place in the log.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole();
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = (await request.json().catch(() => null)) as WorkSessionInputBody | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "بيانات الطلب غير صالحة." }, { status: 400 });
    }

    const validation = validateWorkSessionInput(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const input = validation.value;

    const { data, error } = await supabase
      .from("work_sessions")
      .insert({
        user_id: user.id,
        mode: input.mode,
        started_at: input.startedAt,
        ended_at: input.endedAt,
        duration_min: input.durationMin,
        completed: input.completed,
        task_id: input.taskId,
        label: input.label,
      })
      .select(WORK_SESSION_SELECT)
      .single();

    if (error || !data) {
      const { status, message } = dbErrorResponse(error);
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json({ data: toWorkSessionDto(data as WorkSessionRow) });
  } catch (err) {
    console.error("[lawyer/work-sessions POST] Unexpected error:", err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
