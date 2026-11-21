import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireApiUser } from "@/lib/auth/apiAuth";
import {
  AI_HISTORY_COLUMNS,
  AI_HISTORY_PAGE,
  AI_HISTORY_RECENT,
  AI_RUN_HIDE_CLEARS,
  historyCursor,
  historyItem,
  historyToolFilter,
  isMissingHiddenColumn,
  isRunId,
  type AiHistoryItem,
} from "@/lib/ai/aiHistory";

/**
 * /api/v1/ai/history — «سجلّي» (L11-log, owner file 03 ل11, batch l12).
 *
 * GET     the signed-in user's own runs, newest first: ?tool=<id> to filter,
 *         ?before=<ISO> for the next page, ?recent=1 for a tool page's last
 *         five. Each row: date, tool, question, the start of the answer and
 *         its link, points charged (aiHistory.ts historyItem).
 * DELETE  ?id=<run>: the user's own delete. Stamps user_hidden_at and clears
 *         the question, the answer and the sources at once; the price, the
 *         charge and the dates stay. A running run cannot be deleted (its
 *         result is still on the way).
 *
 * WHOSE ROWS: ai_runs.input is column-locked from the session roles
 * (20261027_10), so both verbs use the service role and EVERY query carries
 * `.eq("user_id", auth.user.id)` — the session's user, never a value from
 * the request. That filter is the access rule (aiHistory.test.ts pins it).
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const SIGN_IN = { error: "سجّل الدخول لعرض سجلّك" };

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.id;

    const params = request.nextUrl.searchParams;
    const tool = historyToolFilter(params.get("tool"));
    const before = historyCursor(params.get("before"));
    const recent = params.get("recent") === "1";
    const limit = recent ? AI_HISTORY_RECENT : AI_HISTORY_PAGE;

    const admin = await createServiceClient();
    const read = (withHiddenFilter: boolean) => {
      let q = admin
        .from("ai_runs")
        .select(AI_HISTORY_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit + 1);
      if (withHiddenFilter) q = q.is("user_hidden_at", null);
      if (tool) q = q.eq("tool", tool);
      if (before) q = q.lt("created_at", before);
      return q;
    };
    let deleteAvailable = true;
    let { data, error } = await read(true);
    if (error && isMissingHiddenColumn(error)) {
      // 20261202_40 not run yet: list without the filter, no delete.
      deleteAvailable = false;
      ({ data, error } = await read(false));
    }
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return NextResponse.json({ runs: [], hasMore: false, deleteAvailable: false }, { headers: NO_STORE });
      }
      console.error("[ai/history] read failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر تحميل السجل" }, { status: 503, headers: NO_STORE });
    }
    const rows = (Array.isArray(data) ? data : []) as unknown as Array<Record<string, unknown>>;
    const runs = rows.slice(0, limit).map(historyItem).filter((r): r is AiHistoryItem => r !== null);
    return NextResponse.json({ runs, hasMore: rows.length > limit, deleteAvailable }, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/history] GET threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "تعذّر تحميل السجل" }, { status: 503, headers: NO_STORE });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await requireApiUser(supabase, SIGN_IN);
    if (auth instanceof NextResponse) return auth;
    const userId = auth.user.id;

    const id = request.nextUrl.searchParams.get("id");
    if (!isRunId(id)) return NextResponse.json({ error: "غير موجود" }, { status: 404, headers: NO_STORE });

    const admin = await createServiceClient();
    const { data, error } = await admin
      .from("ai_runs")
      .update({ user_hidden_at: new Date().toISOString(), ...AI_RUN_HIDE_CLEARS })
      .eq("id", id)
      .eq("user_id", userId)
      .neq("status", "running")
      .is("user_hidden_at", null)
      .select("id");
    if (error) {
      if (isMissingHiddenColumn(error)) {
        return NextResponse.json({ error: "الحذف غير متاح بعد — حاول لاحقاً" }, { status: 503, headers: NO_STORE });
      }
      console.error("[ai/history] delete failed:", error.code, error.message);
      return NextResponse.json({ error: "تعذّر الحذف — حاول مرة أخرى" }, { status: 503, headers: NO_STORE });
    }
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ error: "لا يمكن حذف هذا الطلب الآن (غير موجود أو ما زال قيد التنفيذ)" }, { status: 404, headers: NO_STORE });
    }
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("[ai/history] DELETE threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "تعذّر الحذف — حاول مرة أخرى" }, { status: 503, headers: NO_STORE });
  }
}
