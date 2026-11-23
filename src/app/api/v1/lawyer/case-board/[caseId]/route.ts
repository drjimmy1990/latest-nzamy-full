import { NextResponse, NextRequest } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { assertRole } from "@/lib/auth/assertRole";
import { checkFreeBoard } from "@/lib/services/caseFreeBoard";

/**
 * /api/v1/lawyer/case-board/[caseId] — the free board of a case («لوحة», owner
 * ١٨٩ (ب), batch l13), backed by public.case_free_boards (20261203_60). The
 * case map beside it (/api/v1/lawyer/case-graph/[caseId]) is a separate thing
 * and is not touched.
 *
 * WHO: the case's own rule, public.case_board_open(caseId) — the caller can
 * read the case row under its own policies AND works on the case (an active
 * member of its firm, or on a solo case its lawyer). The route asks that rule
 * first (404 when it says no, so a stranger cannot tell a hidden case from a
 * missing one), then every read and write runs on the caller's RLS client,
 * where the same rule is the table's policy. Never a service-role client.
 *
 * GET → { data: null } (no board yet — a real, common state) or
 *       { data: { cards, links, updatedAt } }.
 * PUT { cards, links, baseUpdatedAt } → { success, updatedAt }. A full
 *       replace with a version check on `updated_at`: `baseUpdatedAt` null =
 *       "I saw no board" (insert; a board created meanwhile is a 409), a string
 *       = "I saw this version" (update only if still at it, else 409
 *       board_conflict). It is required: this route has no older clients.
 */

const OPEN_FAILED = { error: "القضية غير موجودة أو لا تملك الوصول إلى لوحتها." };

type Supa = Extract<Awaited<ReturnType<typeof assertRole>>, { ok: true }>["supabase"];

/** true / false from the case's rule; null when the database could not answer. */
async function canOpen(supabase: Supa, caseId: string): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("case_board_open", { p_request: caseId });
  if (error) {
    console.error("[case-board] case_board_open failed:", error.message, error.code);
    return null;
  }
  return data === true;
}

function validCaseId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 200;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { supabase } = auth;
    const { caseId } = await context.params;
    if (!validCaseId(caseId)) return NextResponse.json({ error: "caseId required" }, { status: 400 });

    const open = await canOpen(supabase, caseId);
    if (open === null) return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    if (!open) return NextResponse.json(OPEN_FAILED, { status: 404 });

    const { data, error } = await supabase
      .from("case_free_boards")
      .select("cards, links, updated_at")
      .eq("case_request_id", caseId)
      .maybeSingle();
    if (error) {
      console.error("[case-board GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    if (!data) return NextResponse.json({ data: null });
    const row = data as { cards: unknown; links: unknown; updated_at: string };
    return NextResponse.json({ data: { cards: row.cards, links: row.links, updatedAt: row.updated_at } });
  } catch (err) {
    console.error("[case-board GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;
    const { caseId } = await context.params;
    if (!validCaseId(caseId)) return NextResponse.json({ error: "caseId required" }, { status: 400 });

    const body = (await request.json().catch(() => null)) as { cards?: unknown; links?: unknown; baseUpdatedAt?: unknown } | null;
    if (!body || typeof body !== "object") return NextResponse.json({ error: "صيغة اللوحة غير صحيحة." }, { status: 400 });
    const { baseUpdatedAt } = body;
    if (baseUpdatedAt !== null && typeof baseUpdatedAt !== "string") {
      return NextResponse.json({ error: "baseUpdatedAt must be a string or null" }, { status: 400 });
    }
    const checked = checkFreeBoard(body);
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    const { cards, links } = checked.board;

    const open = await canOpen(supabase, caseId);
    if (open === null) return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    if (!open) return NextResponse.json(OPEN_FAILED, { status: 404 });

    const conflict = () => NextResponse.json(
      { error: "تغيّرت اللوحة المحفوظة منذ آخر قراءة لها — من زميل أو من نافذة أخرى.", code: "board_conflict" },
      { status: 409 },
    );

    if (typeof baseUpdatedAt === "string") {
      const { data: updated, error } = await supabase
        .from("case_free_boards")
        .update({ cards, links, updated_by: user.id })
        .eq("case_request_id", caseId)
        .eq("updated_at", baseUpdatedAt)
        .select("updated_at");
      if (error) {
        console.error("[case-board PUT] update failed:", error.message, error.code);
        if (error.code === "42501") return NextResponse.json(OPEN_FAILED, { status: 404 });
        return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
      }
      if (!updated || updated.length === 0) {
        const { data: exists } = await supabase
          .from("case_free_boards")
          .select("case_request_id")
          .eq("case_request_id", caseId)
          .maybeSingle();
        if (!exists) return NextResponse.json({ error: "لا توجد لوحة محفوظة لهذه القضية." }, { status: 404 });
        return conflict();
      }
      return NextResponse.json({ success: true, updatedAt: (updated[0] as { updated_at: string }).updated_at });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("case_free_boards")
      .insert({ case_request_id: caseId, cards, links, created_by: user.id, updated_by: user.id })
      .select("updated_at")
      .single();
    if (insertError) {
      if (insertError.code === "23505") return conflict();
      console.error("[case-board PUT] insert failed:", insertError.message, insertError.code);
      if (insertError.code === "42501") return NextResponse.json(OPEN_FAILED, { status: 404 });
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    return NextResponse.json({ success: true, updatedAt: (inserted as { updated_at: string }).updated_at });
  } catch (err) {
    console.error("[case-board PUT] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
